# AnyModel v1.12.0 — Code Review (verified findings)

**Date:** 2026-05-30
**Scope:** `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel` — the Anthropic↔OpenAI translation proxy that lets Claude Code drive local OpenAI-compatible models (LM Studio / llama.cpp / Ollama). Reviewed as a bridge for **Claude Code → local Qwen3-Coder-30B / qwen3-coder-next**.
**Bundle (`cli.js`, ~13MB) NOT reviewed** — only `.mjs` sources.
**Method:** four review dimensions (protocol, streaming, tool-fidelity, security, local-providers), each finding independently re-verified against source. Verdicts below are the *adjudicated* ones. Line numbers cite the `.mjs` sources; where a verifier found drift, the corrected location is noted.

> Several originally-claimed findings were adjudicated **false-positive** and are listed at the end so they are not re-investigated.

---

## How AnyModel runs (one-paragraph orientation)

`cli.mjs` is the bin entry: it parses args/presets, auto-detects or selects a provider, resolves the model, calls `createProxy()` in `proxy.mjs`, then (in client mode) spawns the bundled Claude Code (`cli.js`) with `ANTHROPIC_BASE_URL=http://localhost:<port>`. `proxy.mjs` routes only `/v1/messages` to the provider and passes everything else through to `api.anthropic.com`. The Anthropic↔OpenAI translation lives entirely in `providers/openai.mjs` (`translateRequest` / `translateResponse` / `createStreamTranslator`), reused verbatim by the `lmstudio` + `llamacpp` `openai-local` factory and partially by the native Ollama provider. Default port 9090. Zero runtime deps (Node builtins only). **The lmstudio provider hits LM Studio's OpenAI-compatible `/v1/chat/completions` and does the translation itself — it does NOT use LM Studio's native Anthropic `/v1/messages` endpoint.**

---

## CRITICAL — agentic loop breaks for the target use case

### C1. Stream truncated when upstream closes without a `[DONE]` sentinel — `flush()` exists but is never called
- **File:** `proxy.mjs:707` (bug); `providers/openai.mjs` `emitStop` (~199-209), `[DONE]` handler (~221-224), `flush()` (~346-350).
- **Problem:** The streaming branch ends the client response on upstream `end` with `upstream.on('end', () => res.end())` and **never calls `translator.flush()`**. The translator emits the terminal Anthropic events (`content_block_stop` ×N, `message_delta{stop_reason,usage}`, `message_stop`) **only** when it sees a literal `data: [DONE]` line OR via `flush()`. `finish_reason` chunks deliberately only *record* the stop (comment in source: "The [DONE] sentinel — or a final flush — is what commits the stop event"). LM Studio (MLX), llama.cpp, and vLLM do not all emit `[DONE]`; many close the socket cleanly after the final content/usage chunk. In that case Claude Code receives `message_start` + deltas but **no `message_stop`**, so the turn never finalizes — the agentic loop hangs or aborts after the first model reply. The author anticipated this exact case in the `flush()` comment; the only caller (`proxy.mjs:707`) doesn't invoke it. CI is blind: tests call the `[DONE]` path directly, never the no-`[DONE]` close.
- **Why it's the #1 defect:** This is the single most likely real-world breakage for the LM Studio / Qwen target. The baseline passed only because LM Studio *happened* to send `[DONE]`.
- **Fix:**
  ```js
  upstream.on('end', () => {
    try { const tail = translator.flush(); if (tail) res.write(tail); }
    catch (e) { console.error('[STREAM] flush error', e.message); }
    res.end();
  });
  ```
  `flush()` is idempotent (`emitStop` is guarded by `stopEmitted`, returns `''` if already emitted), so it is safe even when `[DONE]` already fired. The synthesized stop carries the real `accumulatedStopReason` / `accumulatedOutputTokens`.
- **Also:** confirm/apply the same flush-on-end for the Ollama translator routed through the same line.
- **Test:** feed chunks that end WITHOUT `[DONE]`; assert `message_delta` + `message_stop` are emitted and all open blocks are closed.

### C2. No text-channel tool-call parser — Qwen/Hermes `<tool_call>` tags forwarded as plain text, silently breaking the loop
- **File:** `providers/openai.mjs` — `translateResponse` (text block 133-135, tool_use only from structured `tool_calls` 137-150, stop_reason 158); `createStreamTranslator` (text 281-303, tool_use only from `delta.tool_calls` 305-326). Same structural gap in `ollama.mjs`.
- **Problem:** Tool calls are extracted **exclusively** from the structured `message.tool_calls` / `delta.tool_calls` arrays. Nothing scans `message.content` / `delta.content` for textual tool-call syntax — not Hermes `<tool_call>{...}</tool_call>`, not Qwen3-Coder XML `<function=name><parameter=x>...</parameter></function>`, not fenced ```json. Local Qwen3-Coder under LM Studio frequently emits tool calls into the **text channel** when the chat template / tool-call parser fails to coerce them into structured `tool_calls` (wrong/missing `--tool-call-parser`, MLX quirks). When that happens AnyModel maps the content straight to a `{type:'text'}` block and sets `stop_reason:'end_turn'`. Claude Code sees a normal assistant text turn, executes nothing, and the loop dead-ends — the user watches the model *describe* a tool call as prose. No error, no retry — invisible.
- **Severity rationale:** Per the Qwen3 handover, parser choice is the #1 Qwen tool-call failure point; this is the dominant local failure mode and it is completely unhandled.
- **Fix:** Add a post-translation textual recovery pass (and mirror in the stream translator's `emitStop`/`flush`): if NO structured `tool_use` was produced but a text block matches a known emitter pattern, parse and convert —
  1. Hermes: `/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/g` → JSON.parse → `{type:'tool_use', id:genId(), name:obj.name, input: obj.arguments||obj.parameters||{}}` (note `obj.arguments` is often itself a JSON *string* → parse-if-string).
  2. Qwen XML: `/<function=([^>]+)>([\s\S]*?)<\/function>/g` with nested `/<parameter=([^>]+)>([\s\S]*?)<\/parameter>/g` → input map.
  3. Fenced ```json `{name,arguments}`.
  On success: strip the matched span from the text block, append the `tool_use` block(s), override `stop_reason` to `'tool_use'`. Gate behind an env flag (e.g. `ANYMODEL_PARSE_TEXT_TOOLCALLS=auto|on|off`, default `auto` for local providers only) so cloud paths are untouched.
- **Streaming caveat (hard part):** you cannot stream text deltas and then retroactively reclassify them. For local providers, buffer assistant text until end-of-message before deciding, OR force non-streaming when `tools` are present.
- **Mirror** the recovery in `ollama.mjs` (`ollamaToAnthropic` + `createOllamaStreamTranslator`).
- **Test:** feed a Qwen-XML response and a Hermes response in the text channel; assert `tool_use` blocks are produced and `stop_reason` becomes `tool_use`.

---

## HIGH — corrupts tool calls / loses input / hangs

### H1. Parallel streamed tool calls misroute argument fragments (hard-coded `blockIndex-1`)
- **File:** `providers/openai.mjs` streaming `delta.tool_calls` handler (~305-326; argument delta routed to `index: blockIndex-1` ~321). (One verifier saw actual lines ~270-301; logic identical, `tc.index` never read anywhere in the function.)
- **Problem:** A new tool call (`tc.function.name` present) opens a block at `blockIndex` then `blockIndex++`; argument fragments (`tc.function.arguments`) are routed to `blockIndex-1` — always the most-recently-opened block. Correct **only** for strictly sequential tool calls. OpenAI-compatible servers identify each streamed call by `tc.index` and interleave argument fragments across indices; a single chunk can carry fragments for multiple indices. Because `tc.index` is ignored, fragments for call 0 and call 1 cross-assign → one `tool_use` accumulates both calls' JSON (invalid → parses to `{}`), the other gets nothing. Claude Code routinely batches independent tool calls (e.g. several Reads at once), so this hits in normal use: wrong-argument executions, client-side JSON parse failures, wasted correction turns. The non-streaming path is fine (iterates by position).
- **Fix:** Track tool blocks by `tc.index`:
  ```js
  const toolBlockByIndex = new Map();
  // on first sighting of an index (name OR arguments): allocate block,
  //   toolBlockByIndex.set(tc.index, blockIndex++), emit content_block_start (capture id/name when present)
  // on arguments: const bi = toolBlockByIndex.get(tc.index); emit input_json_delta at index: bi
  // close all mapped blocks in emitStop
  ```
  Allocate the block on first sighting of **any** `tc.index` (some servers emit an arguments fragment before/without a name chunk).
- **Caveat (secondary defect spotted during verification):** the text path does `blockIndex++` on **every** content delta, inflating `blockIndex` per text chunk. So `blockIndex-1` is *also* wrong whenever text precedes a tool call, and tool block indices are non-contiguous generally. A correct fix must rework block-index accounting holistically, not just the arguments routing.
- **Note:** the often-cited claim that `ollama.mjs` solves this "via a per-index map" is **false** — Ollama works only because its native `/api/chat` delivers complete, non-fragmented tool calls (it never routes argument fragments). Do not cite it as precedent.
- **Test:** stream two `tool_calls` with indices 0 and 1 whose argument fragments interleave across chunks; assert each block accumulates only its own JSON. Add a case where index 1's name arrives in a later chunk than index 0's first arg fragment.

### H2. Image / document / non-text content blocks silently dropped in request translation
- **File:** `providers/openai.mjs` `translateRequest` — assistant text-only (27), tool_result content `b.text||''` (44), user content `b.text||''` (57), stringify fallback (62-65).
- **Problem:** `translateRequest` only ever extracts `block.text`. Any `{type:'image'}` or `{type:'document'}` block is discarded with no `image_url` translation. An image returned inside a `tool_result` collapses to `''`. A non-array/non-string user content object is `JSON.stringify`'d (garbage). Claude Code sends images for screenshots, pasted diagrams, and some tool outputs; these vanish, so the model reasons over a partial turn and may loop/hallucinate.
- **Fix:** Translate `{type:'image'}` to OpenAI vision parts and emit user content as an **array** of mixed `{type:'text'}` / `{type:'image_url'}` parts:
  - base64: `{type:'image_url', image_url:{url:`data:${b.source.media_type};base64,${b.source.data}`}}`
  - url source: `{type:'image_url', image_url:{url:b.source.url}}`
  Guard against undefined/unknown `b.source.type`. The OpenAI `tool` role is text-only → hoist image parts out of a `tool_result` into a following user message. For `{type:'document'}` (PDF) and for non-vision models, substitute a visible marker (`[image omitted]` / `[document omitted]`) so the loop can reason about the gap instead of silently losing it. Apply array-building consistently to the text and tool_result branches.
- **Test (`test/openai.test.mjs`):** image base64, image url, image inside tool_result, document block.

### H3. No socket/idle timeout on the upstream inference request — a stuck local model hangs the loop forever
- **File:** `proxy.mjs` `sendRequest` (~209-222); buffered-body awaits (~684-685, 720-721, also 545, 568, 628); streaming wiring (~699-748).
- **Problem:** `transport.request({...opts, agent})` sets no `timeout`/`req.setTimeout` and there is no overall deadline. The keep-alive agents have no timeout either. If a 30B/80B model stalls mid-generation or a TCP connection establishes then goes silent, the promise never settles and the proxy never responds — Claude Code hangs with no error. The **retry loop never fires** because retries only trigger on a returned status code or a thrown connection error; a silent hang is neither. (The client-side `/health` probe has a 500ms timeout — the inference path has none.)
- **Fix:** Add an idle/response timeout and surface an Anthropic-shaped 504:
  ```js
  const req = transport.request(
    { ...opts, agent, timeout: Number(process.env.ANYMODEL_UPSTREAM_TIMEOUT_MS) || 300000 },
    upstream => resolve(upstream));
  req.on('timeout', () => req.destroy(new Error('upstream timeout')));
  ```
  Also call `upstream.setTimeout(...)` after `resolve` so a stream that goes idle mid-body/mid-stream is aborted (the request-socket timeout only covers the header phase). Clear the timeout on successful completion so a long-but-active stream is not killed. A thrown timeout error is then caught by the existing retry/catch loop.
- **Test:** point at a mock that accepts the connection then never responds; assert a 504 (or retry-then-504) within the timeout instead of an indefinite hang.

### H4. (security) Passthrough forwards the client's real Anthropic API key to `api.anthropic.com` even in local mode
- **File:** `proxy.mjs` `proxyToAnthropic` (~780-786, header spread ~785).
- **Problem:** For any non-`/v1/messages` route, the proxy spreads `headers:{...req.headers, host:'api.anthropic.com'}` and pipes to Anthropic over HTTPS, forwarding `x-api-key`/`authorization` verbatim. Only `/api/auth` + `/api/auth/session` are mocked; every other Claude Code housekeeping call (telemetry, capability probes) ships through. There is no provider/local gate. When the user is "running local" with a **real** `ANTHROPIC_API_KEY` exported, that key silently egresses to Anthropic. (`cli.mjs` injects a dummy `ANTHROPIC_API_KEY='anymodel-proxy'`, so the *default* launch egresses only the dummy — the real-key leak is conditional on a real key winning over the dummy, or the user launching Claude Code independently against the proxy.)
- **Fix:** When the provider is local (ollama/lmstudio/llamacpp), strip `x-api-key`/`authorization` before forwarding (or mock `/api/*` and unknown routes), behind an explicit opt-in flag + docs. `proxyToAnthropic` is module-level with no `provider` in scope — thread the local flag into it (move inside `createProxy` or pass an arg).
- **Test:** local provider + real `ANTHROPIC_API_KEY` set; assert no auth header reaches the (mocked) Anthropic upstream on passthrough routes.

### H5. (security) Full upstream error bodies logged to stdout with no redaction
- **File:** `proxy.mjs` — `console.error(errBody.slice(0,200))` on 429/5xx (actual ~510), `errBody.slice(0,300)` on non-200 (actual ~520). (Originally cited 526/586/603/878 — those line numbers are stale; one cited "auth/ToS" site logs only a static string, not a body.)
- **Problem:** Raw upstream error bodies are logged unredacted. Provider error bodies can echo request fragments and occasionally key prefixes (OpenRouter `sk-or-v1-`, etc.). No redaction layer exists anywhere. For a proxy fronting an entire coding session this is a real leakage surface into logs / log aggregators.
- **Severity note:** For a localhost single-user tool this is closer to medium; the outbound provider key is never itself logged (only upstream *error* bodies). Still a legitimate hardening gap.
- **Fix:** Gate verbose body logging behind opt-in (`ANYMODEL_LOG_BODIES`, default off). At default verbosity log only status code + a generic message. When enabled, run a redaction pass over `sk-`, `sk-or-v1-`, `Bearer …`, `x-api-key` values, and a generic high-entropy token regex.

---

## MEDIUM — robustness / fidelity / interop

### M1. `tool_result.is_error` dropped — failed tool calls look successful to the model
- **File:** `providers/openai.mjs:42-50` (tool_result → `{role:'tool', tool_call_id, content}`). Same omission in `gemini.mjs:68` and `ollama.mjs:45`.
- **Problem:** Anthropic sets `is_error:true` on a `tool_result` when a tool failed (non-zero bash exit, MCP 500, validation error). It is never read (`grep is_error` → zero hits repo-wide). The model receives the failure as an ordinary success and proceeds on bad data — in an agentic loop it fails to switch strategy, causing cascading wrong actions.
- **Fix:** Prefix the tool-role content with a marker when `block.is_error` (OpenAI tool role has no structured error field): `content = (tr.is_error ? '[tool_error] ' : '') + (typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content))`. Fix all three providers.
- **Test:** feed `tool_result{is_error:true}`; assert the marker survives.

### M2. `content_filter` (and legacy `function_call`) finish_reason collapse to `end_turn`
- **File:** `providers/openai.mjs` stop-reason map duplicated at 158 (non-streaming), 242 and 333 (streaming), each `{tool_calls:'tool_use',length:'max_tokens',stop:'end_turn'}[fr] || 'end_turn'`.
- **Problem:** `content_filter` falls through to `end_turn`, so a blocked/aborted generation is reported as a clean stop and the loop "finishes" on truncated output. `function_call` (legacy) also falls to `end_turn` instead of `tool_use`.
- **Fix:** Factor the map into one shared helper applied at all three sites (prevents streaming/non-streaming drift). Map `content_filter` → `'refusal'` (Anthropic's real moderation stop_reason) rather than silently to `end_turn`. **Caveat:** mapping `function_call` → `'tool_use'` is necessary-but-not-sufficient — the provider never reads the legacy `message.function_call`/`delta.function_call` payload, so no `tool_use` block would be produced without additional payload extraction. Modern OpenAI-compatible servers all use the `tool_calls` shape, so either also wire `function_call` payload extraction or drop the entry and note legacy `function_call` is unsupported (don't imply tool intent is preserved when the payload is never read).

### M3. Tool-call arguments silently become `{}` on JSON.parse failure (non-streaming)
- **File:** `providers/openai.mjs:139` — `try { JSON.parse(tc.function.arguments||'{}') } catch { return {} }`.
- **Problem:** Local Qwen under `max_tokens` pressure not infrequently emits truncated/malformed argument JSON. The catch yields `input:{}` and a `tool_use` is still emitted with the correct name — Claude Code then executes the tool with NO arguments (a Read with no `file_path`), producing a failed/garbage call. No warn, no telemetry, no repair. (`sanitizeToolUseResponse` keeps the nameful empty-input block, so it proceeds.)
- **Fix (baseline):** `console.warn` with the tool name on parse failure (observability) + a regression test. **Follow-up (design choice):** lenient repair (trim trailing commas / balance braces) OR drop the `tool_use` and append a text note so the model retries — both preferable to silent `{}`.

### M4. Streaming has no malformed-JSON-arg recovery (partial_json forwarded raw)
- **File:** `providers/openai.mjs` streaming tool_calls (~316-323) vs the non-streaming guard (139).
- **Problem:** The streaming path forwards each `tc.function.arguments` fragment verbatim as `input_json_delta.partial_json` with no parse/validation. Anthropic's contract requires concatenated `partial_json` to be valid JSON (the client runs the final parse). If a local model streams invalid argument JSON, the client-side parse throws and the call is lost — with NO `{}`-fallback equivalent to the non-streaming guard. (The existing SSE try/catch only protects against a malformed SSE *envelope*, not malformed argument *content*.)
- **Fix (sound core):** buffer per-`tc.index` argument fragments (requires the H1 per-index map), `JSON.parse` on `content_block_stop` for that tool; on failure emit `'{}'` so the block is at least well-formed (matching non-streaming). Note this defers arg streaming to stop-time — a deliberate behavioral change; do NOT also forward raw fragments or the client sees them twice.
- **Risky element to AVOID:** the originally-proposed single→double-quote / aggressive "repair" pass corrupts legitimate apostrophes/quotes inside string values and can turn bad JSON into *different-but-wrong* JSON that parses to wrong arguments — worse than the `{}`-fallback. Ship buffer + parse + `{}`-fallback; treat regex repair with skepticism.

### M5. (security) Proxy binds all interfaces (`0.0.0.0`) by default with auth disabled
- **File:** `proxy.mjs` `server.listen(tryPort, ...)` (~939, no host arg); `checkAuth` returns true when no `--token` (~821-825).
- **Problem:** `server.listen(port, cb)` with no host binds all interfaces, not loopback. With no `--token` (the default), the proxy is reachable from the LAN with no auth: anyone can POST `/v1/messages` to consume the user's cloud credits or drive the local GPU. Per-IP rate limiting (rpm=60) throttles a single attacker but still allows abuse/DoS. *(UNVERIFIED in this session due to the output-delivery lag — see Verification Status. Internally coherent and matches Node behavior; confirm `server.listen` has no host arg and `checkAuth` allows on no-token before acting.)*
- **Fix:** Default `server.listen(tryPort, process.env.ANYMODEL_HOST || '127.0.0.1', ...)`. Require explicit `ANYMODEL_HOST=0.0.0.0` / `--host` to expose; when non-loopback and no `--token`, print a loud warning or refuse to start.

### M6. (security) 401/403 passthrough suppression fabricates a fake 200 success body
- **File:** `proxy.mjs` `proxyToAnthropic` (~790-795) — on passthrough 401/403, responds 200 `{type:'message',content:[]}`.
- **Problem:** Returning a Messages-API success envelope for ALL passthrough 401/403s (not just the auth probes, which are already separately mocked) masks genuine account problems and can be read as a real empty assistant turn or a "feature available" capability probe. The `/v1/messages` path already does the right thing (HTTP 4xx + `{type:'error',error:{...}}`).
- **Fix:** Stop fabricating a 200 for everything. For passthrough 401/403, forward a proper Anthropic error shape. If a specific empty-but-OK shape is genuinely required for one known capability endpoint, special-case that exact URL.

### M7. (security) Unbounded request/response buffering — no max body size
- **File:** `proxy.mjs` inbound (~225-228), count_tokens (~872-876), upstream error bodies (~475-478, 543-546), non-streaming response bodies (~683-686, 720-722) — plus uncited siblings at ~567-569, 627-629, 580, 646.
- **Problem:** Every buffered path uses `chunks.push` + `Buffer.concat` with no cap, then `.toString()` (Buffer + UTF-16 string co-resident → ~doubled peak). A large body OOMs the proxy; combined with the `0.0.0.0` bind it's a trivial LAN DoS. Streaming paths are fine (piped with backpressure).
- **Fix:** A single `readCappedBody(stream, limit)` helper enforcing `ANYMODEL_MAX_BODY_BYTES` (default ~64MB): inbound exceed → 413 (Anthropic error shape); upstream exceed → 502; fail fast on a `Content-Length` already over the cap. Apply to ALL buffered sites (including the uncited ones).

### M8. (security) Inconsistent error envelope — six sites use flat `{error:{...}}`, not Anthropic `{type:"error",error:{...}}`
- **File:** `proxy.mjs` flat sites: invalid-JSON 400 (234-236), free-only 403 (245-248), connection-error 502 (754-755), unhandled 502 (888-889), token auth 401 (854-855), rate-limit 429 (862-863). Canonical sites already correct: 604-611, 653-660.
- **Problem:** Claude Code keys error handling off the Anthropic shape; a flat-shape 429 may not be recognized as retryable, degrading recovery. The inner `error.type` strings are also non-canonical (`invalid_request` vs `invalid_request_error`, `rate_limit` vs `rate_limit_error`).
- **Fix:** One `sendError(res, status, type, message)` helper emitting `{type:'error', error:{type:<anthropic type>, message}}` with documented type strings (`invalid_request_error`, `authentication_error`, `rate_limit_error`, `api_error`, `overloaded_error`); route all sites (including the two already-canonical ones) through it.

### M9. (security) Unguarded JSON.parse on upstream response in two branches
- **File:** `proxy.mjs:686` (non-streaming transform branch) and `:631` (402 `:free` fallback). The verbatim non-streaming branch IS guarded (724-728).
- **Problem:** Local servers can return truncated/non-JSON 200 bodies (HTML error page, partial body on reset). At 686 an unhandled throw bubbles to the retry-loop catch → generic 502 (and a spurious retry+sleep on non-final attempts), discarding the real content. At 631 the surrounding try mis-reports a malformed free response as "no free variant" (arguably worse). Inconsistent guarding is the smell.
- **Fix:** Wrap both parses; on failure log a redacted truncated snippet and return an Anthropic `api_error` explaining the upstream returned a non-JSON body.

### M10. (local) `thinking`/reasoning stripped for all local providers but preserved for OpenRouter (input-side parity gap)
- **File:** `proxy.mjs` — local branch `delete parsed.thinking` (~312-318, before `transformRequest` at ~460); `sanitizeBody` keeps `thinking` for all providers (~54-61).
- **Problem:** OpenRouter passes `thinking` through; the local path deletes it before translation, so a client can never pass reasoning config to a local model the way it can to OpenRouter. Response-side reasoning IS translated (`reasoning_content` → `thinking` block), so the asymmetry is input-only.
- **Severity:** Low/medium and arguably the *right* default — local OpenAI-compatible servers do NOT accept Anthropic's `{type:"enabled",budget_tokens}` schema; passing it through would waste output tokens / error. Make the behavior intentional and documented.
- **Fix:** Document the divergence in `LOCAL_SETUP.md`. If a future local server accepts a reasoning param, **translate the schema** in `translateRequest` (do not pass Anthropic's `thinking` through raw). Add a test pinning the strip.

### M11. (local) `openai-local` path never forwards `top_p`, `stop_sequences`, or `max_output_tokens`
- **File:** `providers/openai.mjs` `translateRequest` (copies only `max_tokens` (10) + `temperature` (112)); Ollama mirror `ollama.mjs` (261-267, no `options.stop`/`options.top_p`).
- **Problem:** `top_p`, `stop_sequences`, and the newer `max_output_tokens` field are never mapped. Dropped `stop_sequences` is the real-world bite: a local Qwen loop relying on stop tokens over-generates. OpenRouter (native passthrough) keeps all of these — a genuine parity regression.
- **Fix:** In `translateRequest`:
  ```js
  if (a.top_p !== undefined) body.top_p = a.top_p;
  if (Array.isArray(a.stop_sequences) && a.stop_sequences.length) body.stop = a.stop_sequences;
  body.max_tokens = a.max_tokens ?? a.max_output_tokens;
  ```
  Mirror `stop`/`top_p` into `ollama.mjs` `options`. (`max_output_tokens` fallback only fires when `max_tokens` is undefined — harmless even if `sanitizeBody` already normalizes it; that normalization claim is UNVERIFIED — a 1-line grep confirms.)
- **Test:** `test/openai.test.mjs` — assert `body.stop` / `body.top_p` mapping.

### M12. (tool-fidelity) Tool-capability fallback cannot detect text-channel failure, and is Ollama-only
- **File:** `providers/ollama-tools.mjs` (`isToolError`, `shouldSendTools`, `cacheToolResult`); `proxy.mjs` no-tools retry (~549-559) and the `provider.name==='ollama'`-gated `tool_choice` strip (~280); `providers/openai-local.mjs` (does NOT import the tool-capability helpers).
- **Problem:** The no-tools retry / capability cache only engages on an explicit upstream **error**. The dominant Qwen failure (200 OK + prose tool call + zero structured `tool_calls`) produces no error, so the safety net never fires. Worse, the cache + the `tool_choice` strip are **Ollama-only**; LM Studio / llama.cpp get neither the error-based fallback nor any text-channel detection (verified: `openai-local.mjs` imports none of the helpers).
- **Fix:** (1) Treat "tools sent + zero structured `tool_calls` + text contains tool-call syntax" as a *soft* tool-failure signal feeding the same cache (presupposes the C2 text-channel detector). (2) Wire `shouldSendTools`/`cacheToolResult` into the `openai-local` factory and generalize the `tool_choice` strip beyond Ollama. Keep the signal soft (per-model "tool reliability is prompt-dependent"), not a hard off.
- **Test:** assert the lmstudio provider participates in tool-capability caching.

### M13. (local) System-prompt condense budget is a flat 4000 chars — does not scale to the model window
- **File:** `proxy.mjs` system condense gate (~325-361; flat `MAX_SYSTEM_CHARS` default 4000 at ~326).
- **Problem:** The message-drop budget already scales to `num_ctx` (`Math.max(4000, numCtx*3)` ~395) and is env-tunable (`LOCAL_MAX_MSG_CHARS`), and all the local transforms ARE size-gated (NOT unconditional — see false-positives). But the **system** budget is a flat 4000 chars: on a large-window local model (Qwen3-Coder, 256K ctx, 128GB box) the system prompt is still condensed once it exceeds 4000 chars even though it would fit, throwing away instructions the model could use.
- **Fix:** Default `MAX_SYSTEM_CHARS` to a fraction of `numCtx` (mirror the message-budget formula at ~395), still overridable via `LOCAL_MAX_SYSTEM_CHARS`.

---

## LOW / NIT

- **L1 — Streaming `input_tokens` always 0** (`openai.mjs:257` message_start; 206 message_delta carries only `output_tokens`). Non-streaming forwards `prompt_tokens` correctly. Under-reports prompt tokens for all streamed turns (the default mode), making `/context` budgets unreliable. Fix: accumulate `usage.prompt_tokens` and include `input_tokens` in the `message_delta`; optionally add `stream_options:{include_usage:true}` in `translateRequest`.
- **L2 — No ping/heartbeat during long TTFT** (`openai.mjs:247` message_start only on first delta; headers flushed at `proxy.mjs:698` but body empty until first token). For 80B `qwen3-coder-next` on a big prompt, TTFT can be tens of seconds; an idle-timeout in the path can drop the connection before `message_start`. Fix: emit `event: ping` on a 15s interval after `proxy.mjs:698` until first real event; `clearInterval` on end/error/close (all three handlers exist) and on first translated write; guard with `if (!res.writableEnded)`.
- **L3 — Base-URL join brittle on trailing slash** (`openai-local.mjs:42` string concat). `LMSTUDIO_BASE_URL=…/v1/` → `//chat/completions`; omitting `/v1` → wrong path. Most servers tolerate `//` but LiteLLM/vLLM routers may 404. Fix: `const base = (envUrl||defaultUrl).replace(/\/+$/, '')` then `${base}/chat/completions`; optionally auto-append `/v1`.
- **L4 — Inbound-body reads have no `req.on('error')`** in `handleMessages` (~226-227) and count_tokens (~873-874); `proxyToAnthropic` does handle it (inconsistent). Client abort mid-upload can leak a pending await. Fix: add `req.on('error', …)`.
- **L5 — Auth token compare is non-constant-time** (`proxy.mjs:821-825` `===`). Weak timing oracle in remote mode. Fix: `crypto.timingSafeEqual` over equal-length buffers after a length check.
- **L6 — Retry/non-200 paths forward raw upstream headers** (~530-532, 664 `res.writeHead(upstream.statusCode, upstream.headers)`). Leaks provider identity (`cf-ray`, `x-request-id`, `openrouter-*`). Fix: forward an allowlist (content-type, retry-after, `anthropic-*`).
- **L7 — `loadEnv` auto-loads `./.env` from cwd and injects every key** (`proxy.mjs:186-207`). Running `npx anymodel proxy` in an untrusted repo silently loads a hostile `OPENAI_BASE_URL`/`LMSTUDIO_BASE_URL` → SSRF/exfil of all traffic. Fix: opt-in (`--env`/`ANYMODEL_LOAD_ENV`), log which path/keys (names only) were loaded, validate base-URL env vars are http(s) and loopback for local providers.
- **L8 — Rate-limit keyed by spoofable `X-Forwarded-For`** (`proxy.mjs:859`) and the window map grows unbounded under varied spoofed IPs (~812-817). Fix: trust XFF only behind `ANYMODEL_TRUST_PROXY`; otherwise key off `req.socket.remoteAddress`; cap/prune the map (two-bucket current/previous minute).
- **L9 — Ollama `think:false` hardcoded** (`ollama.mjs:257`) disables reasoning even for reasoning-capable Qwen on Ollama. Fix: `OLLAMA_THINK=on|off` (default off); response-side already has a thinking-block path.
- **L10 — llama.cpp / generic OpenAI-compat has no model-existence validation** (`openai-local.mjs`; `v0Probe=true` only for LM Studio). A wrong `--model` surfaces as an opaque first-call error. Fix: best-effort `GET /v1/models` at startup, warn if absent.
- **NIT — `sanitizeToolUseResponse` generates collision-prone tool_use ids** (`proxy.mjs:42` `toolu_${Date.now()}_${Math.random()…slice(2,8)}`). Two parallel tool calls in the same ms can collide, breaking tool_use/tool_result correlation. Fix: `crypto.randomUUID()` (Node builtin).
- **NIT — dead `tool_choice` string branch** (`openai.mjs:101-102`): `sanitizeBody` pre-normalizes string → `{type}`, so the string branch never fires for proxied traffic. Fix: delete it or comment it as a direct/unit-test defensive path.

---

## Adjudicated FALSE-POSITIVES (do NOT re-investigate)

1. **"`translateRequest` mutates the caller's `input_schema` in place — breaks idempotency across retries"** — FALSE. Line 72 shallow-clones the top-level schema; `translateRequest` mutates only top-level keys of that copy and never recurses into nested objects. The no-tools retry deletes `tools` before re-translation; the `:free` fallback spreads the already-translated body (does not re-invoke `transformRequest`). `translateRequest` is effectively pure w.r.t. observable caller state. The only actual in-place nested mutator is `sanitizeBody`'s `fixNested`, which runs once and is idempotent. `structuredClone` would be unnecessary hot-path overhead for zero behavior change. At most a style nit on `fixNested`, not a medium finding.

2. **"Ollama `num_ctx` hardcoded to 32768, no env override"** — FALSE on every load-bearing claim. `ollama.mjs` reads `num_ctx: numCtx` where `numCtx = parseInt(process.env.OLLAMA_NUM_CTX,10) || DEFAULT_NUM_CTX`; `DEFAULT_NUM_CTX = 8192` (line 11). No literal `32768` exists (grep → 0). The exact env knob the "fix" proposes already exists and is honored in all four code paths. The only residual (weaker) point is whether 8192 is too low a *default* for agentic use — a tuning preference, not the described bug.

3. **"Local request mutation applied unconditionally / no env knobs / no scaling to window"** — FALSE as written. Each lossy transform is behind a fit check (`if (fullSystem.length > MAX_SYSTEM_CHARS)`, `if (totalChars > MAX_MSG_CHARS)`, tool budget-gated); when content fits it is NOT condensed. Env knobs already exist (`LOCAL_MAX_SYSTEM_CHARS`/`OLLAMA_MAX_SYSTEM_CHARS`, `LOCAL_MAX_MSG_CHARS`/`OLLAMA_MAX_MSG_CHARS` default `Math.max(4000, numCtx*3)` — already scaled to the window, `LOCAL_NUM_CTX`, `LOCAL_MAX_TOOLS`, `LOCAL_MAX_TOOL_DESC`, `LOCAL_TOOL_BUDGET_PCT`). The ONE genuine narrow defect — the flat 4000-char *system* budget not scaling to the window — is captured as **M13** above. (Also: there is no `src/transform/` dir; system/message logic is inline in `proxy.mjs`, only tool compression lives in `providers/tool-compressor.mjs`.)

4. **"No upper clamp on `max_tokens`/`num_predict` → unsatisfiable/stall"** — PARTIALLY real but mischaracterized; downgraded to low. The literal "no upper clamp, copied raw" is true (`sanitizeBody` clamps up to ≥16, no upper bound; `openai.mjs:10` and `ollama.mjs:261` copy raw). But the supporting "num_ctx hardcoded 32K" claim is false (see #2 — 8192, env-overridable), `num_predict` is a generation cap not a KV pre-allocation (so a large value does not by itself make a request "unsatisfiable" or force a refusal), and "stall/refuse/unsatisfiable" are worst-case framings. Genuine narrow concern: an output budget larger than `(window - prompt)` on a small local ctx wastes the window and can truncate tool calls. If pursued, clamp the effective output to `(num_ctx - prompt_estimate)` with a floor and/or expose `ANYMODEL_MAX_OUTPUT_TOKENS` — keyed off `DEFAULT_NUM_CTX`/`OLLAMA_NUM_CTX`, not an imagined 32K.

---

## Verification Status (output-delivery lag caveat)

During this review-writing session the Bash and Read tools returned empty output (the same transient "output-delivery lag" flagged in the baseline run). The findings above are taken from the **adjudicated verdicts** in the supplied multi-pass code review, where each finding was independently re-read against source by a verifier. Two items remain explicitly **UNVERIFIED in this session** and should be re-confirmed with a 1-line check before acting:

- **M5** (`0.0.0.0` bind + no-token auth-allow): confirm `server.listen` has no host arg and `checkAuth` returns true on no-token.
- **M11** secondary claim: confirm whether `sanitizeBody` already normalizes `max_output_tokens` into `max_tokens` (affects only whether the fallback is redundant, not the core fix).

All other findings rest on directly-read source per the adjudication notes.
