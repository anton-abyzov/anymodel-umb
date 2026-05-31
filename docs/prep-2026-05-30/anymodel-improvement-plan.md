# AnyModel — Prioritized Improvement Plan
## Goal: first-class bridge for Claude Code → local Qwen3-Coder (and other local OpenAI-compatible models)

**Date:** 2026-05-30
**Target:** AnyModel v1.12.0 at `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel`
**Backend under test:** LM Studio MLX `http://localhost:1234`, `qwen/qwen3-coder-30b` + `qwen/qwen3-coder-next` (80B). M4 Max / 128GB.
**This document is the task for a future implementation session.** Hand it directly to Claude Code.

> Companion docs in this folder: `anymodel-code-review.md` (full findings + path:line), `anymodel-baseline-test.md` (live before-state + repro).

---

## Ground truth: what works today vs what's broken

### PROVEN working by the live baseline (do NOT regress)
The unmodified proxy, launched as `node cli.mjs proxy lmstudio --model qwen/qwen3-coder-30b --port 9099`, passed all four protocol cases against LM Studio + Qwen3-Coder-30B:
1. **Plain chat** — correct Anthropic envelope, `stop_reason`, usage.
2. **Tool-call elicitation** — OpenAI `tool_calls` → Anthropic `tool_use`, object `input`, `stop_reason:"tool_use"`, faithful id correlation.
3. **SSE streaming of plain text** — full `message_start → … → message_stop` sequence (because LM Studio sent `[DONE]`).
4. **Multi-turn `tool_result` round-trip** — `tool_use.id` ↔ `tool_result.tool_use_id` survives, coherent follow-up.

### BROKEN / unhandled today (code-verified, NOT exercised by the happy-path baseline)
- Streaming that ends **without `data: [DONE]`** → no `message_stop` → loop hangs (the baseline only passed because LM Studio sent `[DONE]`).
- **Text-channel tool calls** (Qwen XML / Hermes tags) → forwarded as prose, nothing executed.
- **Parallel/batched streamed tool calls** → argument fragments cross-assigned → garbage inputs.
- **Images / documents / `tool_result.is_error`** → silently dropped.
- **Stuck/silent upstream** → no timeout → indefinite hang, retries never fire.
- `top_p` / `stop_sequences` / `max_output_tokens` dropped; streaming `input_tokens` always 0; no TTFT heartbeat.
- Security defaults: `0.0.0.0` bind + no auth; passthrough leaks a real Anthropic key; unredacted error-body logs; unbounded buffering; non-canonical error shapes.

---

## Priority tiers

- **TIER 0 — Must-fix to work at all** (the loop breaks or hangs without these): P0.1–P0.3.
- **TIER 1 — Quality / robustness** (correctness, fidelity, security defaults): P1.1–P1.10.
- **TIER 2 — Nice-to-have** (polish, metering, hardening): P2.1–P2.9.

Ordered by leverage within each tier. Effort S (<1h) / M (half-day) / L (1–2 days).

---

## TIER 0 — MUST-FIX TO WORK AT ALL

### P0.1 — Flush the stream translator on upstream `end` (no-`[DONE]` truncation)
- **Why #1:** Highest leverage, smallest change. LM Studio / llama.cpp / vLLM frequently close the socket without `data: [DONE]`; without `flush()` the client never gets `message_stop` and every such turn hangs. This is the most likely real-world breakage for the target.
- **Files:** `proxy.mjs` (streaming `end` handler, ~707). Confirm the same translator path for Ollama.
- **Change:**
  ```js
  upstream.on('end', () => {
    try { const tail = translator.flush(); if (tail) res.write(tail); }
    catch (e) { console.error('[STREAM] flush error', e.message); }
    res.end();
  });
  ```
  `flush()` → `emitStop()` is idempotent (`stopEmitted` guard; returns `''` if already emitted), so it's safe when `[DONE]` did arrive.
- **Effort:** S. **Risk:** Very low (idempotent; additive on `end`).
- **Test:** New streaming test feeding chunks that end WITHOUT `[DONE]`; assert `content_block_stop` for every open block + `message_delta{stop_reason}` + `message_stop`. Re-run the live streaming baseline to confirm no double-stop when `[DONE]` IS present.

### P0.2 — Recover text-channel tool calls (Qwen XML / Hermes / fenced JSON)
- **Why:** Dominant Qwen-under-LM-Studio failure mode. When the server's tool-call parser misfires, the call lands in `content` as text; AnyModel emits `{type:'text'}` + `end_turn`, Claude Code executes nothing, loop dead-ends — silently.
- **Files:** `providers/openai.mjs` (`translateResponse` + `createStreamTranslator` `emitStop`/`flush`); mirror in `providers/ollama.mjs` (`ollamaToAnthropic` + `createOllamaStreamTranslator`).
- **Change:** After building content blocks, if NO structured `tool_use` was produced but a text block matches a known emitter pattern, parse → `tool_use`, strip the matched span, override `stop_reason:'tool_use'`. Patterns:
  - Hermes: `/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/g` → `name`, `arguments` (note `arguments` is often a JSON *string* → parse-if-string; fall back `obj.arguments||obj.parameters||{}`).
  - Qwen XML: `/<function=([^>]+)>([\s\S]*?)<\/function>/g` + nested `/<parameter=([^>]+)>([\s\S]*?)<\/parameter>/g`.
  - Fenced ```json `{name,arguments}`.
  Gate with `ANYMODEL_PARSE_TEXT_TOOLCALLS=auto|on|off` (default `auto` → local providers only; cloud untouched).
- **Streaming caveat:** Cannot reclassify already-streamed text. For local providers, buffer assistant text until end-of-message before deciding, OR force non-streaming when `tools` are present. Choose buffer-until-flush as the default; document the trade-off.
- **Effort:** M (non-streaming) + M (streaming buffering) = M/L. **Risk:** Medium — gate behind flag + local-only; add tests for false-positive avoidance (don't convert prose that merely mentions a tag).
- **Test:** Feed a Qwen-XML response and a Hermes response in the text channel (non-streaming + streaming); assert `tool_use` blocks + `stop_reason:'tool_use'`. Negative test: a text block that merely *describes* `<tool_call>` in prose is not converted (require strict whole-match + valid JSON/structure).

### P0.3 — Upstream socket/idle timeout (stop the infinite hang)
- **Why:** A stalled 30B/80B model or a silent TCP connection hangs the proxy forever; retries never fire (they need a status code or thrown error, not a hang). Turns the worst failure mode into a recoverable, visible one.
- **Files:** `proxy.mjs` `sendRequest` (~209-222) + buffered-await / streaming paths.
- **Change:**
  ```js
  const req = transport.request(
    { ...opts, agent, timeout: Number(process.env.ANYMODEL_UPSTREAM_TIMEOUT_MS) || 300000 },
    upstream => resolve(upstream));
  req.on('timeout', () => req.destroy(new Error('upstream timeout')));
  ```
  Also `upstream.setTimeout(...)` after `resolve` (covers buffered-body + streaming idle). Clear on success so a long-but-active stream isn't killed. Surface a 504 in the Anthropic error shape (depends on P1.6's `sendError`).
- **Effort:** S/M. **Risk:** Low-Medium — default 300s is generous; make it env-tunable; ensure active long streams aren't false-positived (use idle timeout, reset on data).
- **Test:** Mock that accepts the connection then never responds; assert a 504 (or retry-then-504) within the timeout, not an indefinite hang. Mock a slow-but-steady stream and assert it is NOT killed.

---

## TIER 1 — QUALITY / ROBUSTNESS

### P1.1 — Per-`tc.index` map for streamed tool calls (parallel-tool-call misroute)
- **Why:** Claude Code batches independent tool calls; the hard-coded `blockIndex-1` cross-assigns argument fragments → corrupt inputs, parse failures, wasted turns.
- **Files:** `providers/openai.mjs` `createStreamTranslator`.
- **Change:** `Map<tc.index, blockIndex>`; allocate a block + emit `content_block_start` on first sighting of any `tc.index` (capture id/name when present); route `input_json_delta` via `map.get(tc.index)`; close all mapped blocks in `emitStop`. **Also fix** the related `blockIndex++` inflation on every text delta so tool block indices stay correct when text precedes tools (rework block-index accounting holistically).
- **Effort:** M. **Risk:** Medium (touches streaming index logic — strong tests required).
- **Test:** Stream two `tool_calls` (index 0 and 1) with interleaved argument fragments; assert each block accumulates only its own JSON. Add a case where index 1's name arrives after index 0's first arg fragment. Regress single-tool + text-then-tool sequences.

### P1.2 — Translate image/document content blocks (stop silent multimodal loss)
- **Files:** `providers/openai.mjs` `translateRequest`.
- **Change:** Emit user content as an **array** of mixed `{type:'text'}` / `{type:'image_url'}` parts. base64 → `data:${media_type};base64,${data}`; url → `b.source.url`. Guard undefined/unknown `b.source.type`. Hoist images out of `tool_result` (tool role is text-only) into a following user message. `{type:'document'}` and non-vision models → `[image omitted]`/`[document omitted]` marker (never silent `''`).
- **Effort:** M. **Risk:** Low-Medium (changes user-message shape from string to array — verify text-only turns still serialize as before or that the server accepts single-part arrays).
- **Test (`test/openai.test.mjs`):** image base64, image url, image inside tool_result, document block, mixed text+image turn.

### P1.3 — Preserve `tool_result.is_error` (failed tools must look failed)
- **Files:** `providers/openai.mjs:42-50`, plus `gemini.mjs:68`, `ollama.mjs:45`.
- **Change:** `content = (tr.is_error ? '[tool_error] ' : '') + (typeof tr.content==='string' ? tr.content : JSON.stringify(tr.content))`.
- **Effort:** S. **Risk:** Very low. **Test:** `tool_result{is_error:true}` → marker survives in all three providers.

### P1.4 — Forward `top_p`, `stop_sequences`, `max_output_tokens` (sampling parity)
- **Files:** `providers/openai.mjs` `translateRequest`; mirror `stop`/`top_p` into `ollama.mjs` `options`.
- **Change:** Guarded forwards (see code-review M11). The real bite is `stop_sequences` (over-generation on local).
- **Effort:** S. **Risk:** Low. **Test:** assert `body.stop` / `body.top_p` mapping; assert `max_tokens` falls back to `max_output_tokens`. (UNVERIFIED: whether `sanitizeBody` already normalizes `max_output_tokens` — 1-line grep; fallback is harmless regardless.)

### P1.5 — Unify finish_reason mapping; map `content_filter` → `refusal`
- **Files:** `providers/openai.mjs` (three duplicated maps: 158, 242, 333).
- **Change:** One shared helper applied at all three sites. Add `content_filter → 'refusal'` (don't silently collapse a blocked generation to `end_turn`). For legacy `function_call`: either also wire the legacy payload extraction OR drop the entry and note it unsupported — do NOT imply tool intent is preserved when the payload is never read.
- **Effort:** S/M. **Risk:** Low. **Test:** assert `content_filter` no longer yields `end_turn`; assert streaming and non-streaming agree.

### P1.6 — Canonical Anthropic error envelope via one `sendError` helper
- **Files:** `proxy.mjs` (six flat-shape sites + the two already-canonical ones).
- **Change:** `sendError(res, status, type, message)` → `{type:'error', error:{type:<anthropic type>, message}}`; documented type strings. Route all sites through it. (Also the dependency for P0.3's 504 and P1.7/P1.9 error responses.)
- **Effort:** S/M. **Risk:** Low. **Test:** each error path returns the canonical shape and a recognized `error.type`.

### P1.7 — Default bind to loopback; warn/refuse on exposed-without-token
- **Files:** `proxy.mjs` `server.listen` (~939) + `checkAuth`.
- **Change:** `server.listen(tryPort, process.env.ANYMODEL_HOST || '127.0.0.1', ...)`. Require `ANYMODEL_HOST=0.0.0.0`/`--host` to expose; when non-loopback and no `--token`, loud warning or refuse.
- **Effort:** S. **Risk:** Low (but a behavior change for anyone relying on LAN access — document; provide the opt-in). **UNVERIFIED:** confirm `listen` currently has no host arg and `checkAuth` allows on no-token before acting. **Test:** assert default bind is `127.0.0.1`; assert exposed+no-token warns/refuses.

### P1.8 — Don't leak a real Anthropic key on local-mode passthrough
- **Files:** `proxy.mjs` `proxyToAnthropic`.
- **Change:** Thread the local flag in (move inside `createProxy` or pass an arg); for local providers strip `x-api-key`/`authorization` before forwarding (or mock `/api/*` + unknown routes). Opt-in flag + docs.
- **Effort:** S/M. **Risk:** Low. **Test:** local provider + real `ANTHROPIC_API_KEY` → no auth header reaches the mocked Anthropic upstream.

### P1.9 — Cap buffered body sizes + guard upstream JSON.parse
- **Files:** `proxy.mjs` (all buffered read sites; the two unguarded `JSON.parse` at 686 and 631).
- **Change:** `readCappedBody(stream, limit)` helper enforcing `ANYMODEL_MAX_BODY_BYTES` (default ~64MB) → 413 inbound / 502 upstream, fail-fast on oversized `Content-Length`; apply to ALL buffered sites. Wrap both parses → on failure return an Anthropic `api_error` with a redacted truncated snippet.
- **Effort:** M. **Risk:** Low-Medium (centralizing buffering touches several sites — keep behavior identical under the cap).
- **Test:** oversized inbound → 413; non-JSON upstream 200 → `api_error`, not generic 502.

### P1.10 — Wire tool-capability cache/fallback into the openai-local path + soft text-channel signal
- **Files:** `providers/openai-local.mjs` (import + use `shouldSendTools`/`cacheToolResult`); `proxy.mjs` (generalize the `tool_choice` strip beyond Ollama; feed a soft signal from P0.2's detector).
- **Change:** (1) LM Studio / llama.cpp participate in the capability cache like Ollama. (2) "tools sent + zero structured `tool_calls` + text contains tool-call syntax" → soft tool-failure signal (per-model, not a hard off). Depends on P0.2.
- **Effort:** M. **Risk:** Medium (don't over-eagerly disable tools for a model that's merely prompt-sensitive — keep soft).
- **Test:** assert lmstudio provider participates in caching; assert the soft signal is recorded on a text-channel tool-call response.

---

## TIER 2 — NICE-TO-HAVE

- **P2.1 — Streaming `input_tokens`** (`openai.mjs`): accumulate `usage.prompt_tokens`, include in `message_delta`; optionally `stream_options:{include_usage:true}`. *S, low.* Restores `/context` accuracy.
- **P2.2 — TTFT heartbeat** (`proxy.mjs` after ~698): `event: ping` every 15s until first real event; clear on end/error/close/first-write; guard `!res.writableEnded`. *S, low.* Prevents idle-timeout drops on 80B cold prompts.
- **P2.3 — Streaming malformed-arg `{}`-fallback** (`openai.mjs`): buffer per-`tc.index` args (needs P1.1), parse on `content_block_stop`, emit `{}` on failure. Ship buffer+parse+fallback only; AVOID the aggressive quote/comma "repair". *M, medium.*
- **P2.4 — Non-streaming malformed-arg observability** (`openai.mjs:139`): `console.warn` with tool name on parse failure; optional drop-and-retry. *S, low.*
- **P2.5 — Scale system-condense budget to window** (`proxy.mjs` ~326): default `MAX_SYSTEM_CHARS` to a fraction of `numCtx` (mirror the message-budget formula); keep `LOCAL_MAX_SYSTEM_CHARS` override. *S, low.* (The other local transforms already scale / are gated — see false-positives.)
- **P2.6 — Base-URL trailing-slash normalization** (`openai-local.mjs:42`): `.replace(/\/+$/, '')`; optional auto-`/v1`. *S, low.*
- **P2.7 — `crypto.randomUUID()` for synthesized tool_use ids** (`proxy.mjs:42`); drop the dead `tool_choice` string branch (`openai.mjs:101-102`). *S, low.*
- **P2.8 — Log hygiene** (`proxy.mjs`): gate body logging behind `ANYMODEL_LOG_BODIES` (default off) + redaction pass; header allowlist on forwarded upstream headers; `req.on('error')` on inbound reads; `crypto.timingSafeEqual` for token compare. *M, low.*
- **P2.9 — `.env` auto-load opt-in + base-URL validation** (`proxy.mjs:186-207`); `OLLAMA_THINK=on|off`; best-effort `GET /v1/models` validation for non-LMStudio openai-local. *M, low.*

---

## Suggested execution order (single increment, grouped commits)

1. **P0.1** (flush) — land first, re-run streaming baseline. *Smallest, highest leverage.*
2. **P0.3** (timeout) + **P1.6** (sendError) — together (504 needs the helper).
3. **P1.1** (per-index streaming) — then **P2.3** can follow.
4. **P0.2** (text-channel tool calls) — then **P1.10** (capability wiring) builds on it.
5. **P1.2** (images), **P1.3** (is_error), **P1.4** (sampling), **P1.5** (finish_reason) — independent, batch them.
6. **Security defaults**: **P1.7** (loopback), **P1.8** (key leak), **P1.9** (caps + parse guards).
7. **Tier 2** polish.

## Testing discipline
- Test stack: `node --test test/*.test.mjs` (`npm test`). Add cases under `test/openai.test.mjs` and a new streaming-no-`[DONE]` test.
- After each Tier-0 fix, re-run the **live baseline** from `anymodel-baseline-test.md` (all four protocol cases must still PASS) plus the new negative-path test for that fix.
- For P0.2 / P1.1, prefer real LM Studio probes with `qwen/qwen3-coder-30b` AND `qwen3-coder-next` (parallel tool calls + text-channel behavior differ by model/template).

## UNVERIFIED items to confirm before/while implementing
- **P1.7:** `server.listen` has no host arg; `checkAuth` allows when no `--token`.
- **P1.4:** whether `sanitizeBody` already normalizes `max_output_tokens` → `max_tokens` (affects redundancy only).
- **P1.1:** the long-standing claim that `ollama.mjs` uses a per-`tc.index` map is FALSE — do not copy it as a pattern; Ollama gets complete tool calls, not fragments.
