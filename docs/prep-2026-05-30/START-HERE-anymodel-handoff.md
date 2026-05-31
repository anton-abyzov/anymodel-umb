# START HERE — AnyModel × local Qwen3-Coder handoff

**This is the single entry point.** Read this top to bottom; it is self-contained enough to start work. Three companion docs in this same folder hold the depth — open them as referenced:

- `anymodel-improvement-plan.md` — the prioritized task list (Tier 0/1/2, with exact files + tests). **This is what you implement.**
- `anymodel-code-review.md` — full verified findings (severity, `path:line`, fixes, adjudicated false-positives).
- `anymodel-baseline-test.md` — the live before-state + exact repro commands.
- `HANDOVER-qwen3-openai-tools-mcp.md` — reference: Qwen3 tool-calling, Anthropic↔OpenAI translation table, MCP, pitfalls.

---

## Mission
Make **AnyModel** (anton-abyzov's npm `anymodel@1.12.0`, an Anthropic↔OpenAI translation proxy) a rock-solid bridge so **Claude Code drives a LOCAL Qwen3-Coder** served by LM Studio, with reliable tool calling, MCP, and shell/SSH. The user wants to evaluate how good local agentic coding can be.

## Environment (verified)
- MacBook Pro **M4 Max, 128 GB**, macOS 26.5.
- **LM Studio** MLX server running at `http://localhost:1234` (OpenAI-compatible `/v1` **and** a native Anthropic `/v1/messages`). Models loaded: `qwen/qwen3-coder-30b` (qwen3_moe, 30B/3B-active, 256K ctx, **MLX 4-bit and 8-bit both on disk**), `qwen/qwen3-coder-next` (80B), gemma-4 variants, llama-3.2-3b, nomic-embed.
- **AnyModel source (authoritative, = npm 1.12.0):** `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel`
  - `proxy.mjs` (~960 LOC) — HTTP proxy, routing, sanitize, retry, error handling, SSE wiring.
  - `providers/openai.mjs` (~396 LOC) — **the Anthropic↔OpenAI translation** (`translateRequest`/`translateResponse`/`createStreamTranslator`). Reused by the `openai-local` factory for LM Studio + llama.cpp.
  - `providers/openai-local.mjs`, `providers/ollama.mjs`, `providers/ollama-tools.mjs`, `providers/tool-compressor.mjs`.
  - `test/*.test.mjs` — run with `npm test` (`node --test`).
  - Ignore the sibling `repositories/antonoly/claude-code` (a CC fork) and the 13 MB bundled `cli.js`.

## Ground truth — what works vs what's broken (code-verified)
**GREEN today** (live baseline passed — do NOT regress): plain chat, tool-call elicitation (`tool_calls`→`tool_use`, faithful id), SSE streaming of text, multi-turn `tool_result`. Launch that proved it:
```bash
cd /Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel
unset OPENROUTER_API_KEY OPENAI_API_KEY
LMSTUDIO_BASE_URL=http://localhost:1234/v1 \
  node cli.mjs proxy lmstudio --model qwen/qwen3-coder-30b --port 9099
# probe: POST http://localhost:9099/v1/messages  (x-api-key: anymodel-proxy, anthropic-version: 2023-06-01)
```
**It passed only because LM Studio happened to send `[DONE]` and only sequential single tool calls were exercised.** The real defects below are untriggered by the happy path.

## The 3 MUST-FIX (Tier 0 — the loop hangs/dead-ends without these)
1. **P0.1 — Flush stream translator on upstream `end`** (`proxy.mjs:707`). `flush()` exists (`openai.mjs:346`) but is never called; when the server closes without `data: [DONE]`, no `message_stop` → **every such turn hangs**. Idempotent, ~5 lines, highest leverage. Land first, re-run the streaming baseline.
2. **P0.2 — Recover text-channel tool calls** (`openai.mjs` + `ollama.mjs`). When Qwen emits a call as Hermes `<tool_call>` / Qwen `<function=…>` XML / fenced JSON instead of structured `tool_calls`, AnyModel forwards it as prose with `end_turn` → Claude Code executes nothing, silently. Add a gated post-translation parser (`ANYMODEL_PARSE_TEXT_TOOLCALLS=auto`, local-only). Dominant local-Qwen failure.
3. **P0.3 — Upstream socket/idle timeout** (`proxy.mjs` `sendRequest`). No timeout today → a stalled 30B/80B hangs forever and retries never fire. Add `timeout` + `upstream.setTimeout`, surface a 504 (uses P1.6's `sendError`).

Then HIGH: per-`tc.index` map for parallel streamed tool calls (`openai.mjs:321`), image/document translation (`openai.mjs` `translateRequest`), `tool_result.is_error` preservation, security defaults (loopback bind, key-leak passthrough). Full list + tests: `anymodel-improvement-plan.md`.

## Rules of engagement
- **Spec-driven:** this is a SpecWeave repo (`.specweave/`), increment **0007 "lean-anymodel-simplification"** is the active line. Continue it (or open the next increment) rather than ad-hoc edits.
- **Test discipline:** after each Tier-0 fix run `npm test` AND re-run the 4-case live baseline from `anymodel-baseline-test.md` (all must still PASS), plus a new negative-path test for that fix.
- **Confirm-before-acting:** 3 items are flagged UNVERIFIED in the plan (`P1.7` listen-host, `P1.4` max_output_tokens, `P1.1` the false "ollama uses per-index map" claim) — verify with a 1-line grep before relying on them.
- **Don't** review the bundled `cli.js`; **don't** break the OpenRouter/Ollama paths while improving the local one.
- Suggested order: P0.1 → (P0.3 + P1.6) → P1.1 → P0.2 → batch the independent mediums → security defaults.

## How to verify end-to-end (the real goal)
After Tier 0, point Claude Code at the proxy and drive a real coding task on local Qwen:
```bash
ANTHROPIC_BASE_URL=http://localhost:9099 ANTHROPIC_AUTH_TOKEN=anymodel-proxy \
CLAUDE_CODE_ATTRIBUTION_HEADER=0 claude
```
Confirm multi-step tool loops, an MCP server (filesystem/git), and a `ssh <alias> '<cmd>'` call all work through the proxy without hangs.
