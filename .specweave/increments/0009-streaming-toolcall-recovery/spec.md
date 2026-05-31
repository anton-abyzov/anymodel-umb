# Increment 0009 — Streaming text-channel tool-call recovery + local capability cache

## Problem

Follow-up to 0008 (commit range fffc770..d4be87b). The 18-agent adversarial review of 0008
(see `.specweave/increments/0008-anymodel-local-model-reliability/reports/review-report.md`)
confirmed two real, out-of-scope gaps in the AnyModel proxy
(`repositories/antonoly/anymodel`, anymodel@1.12.0):

1. **Streaming text-channel tool-call recovery is missing.** The P0.2 recovery
   (`extractTextToolCalls` — Hermes `<tool_call>`, Qwen `<function=>` XML, fenced ```json)
   only runs in the NON-streaming `translateResponse`. `createStreamTranslator()` never calls
   it. Claude Code defaults to `stream:true`, so when a local model with a misconfigured
   tool-call parser parks a tool call in the text channel during a streamed turn, it is
   forwarded as plain text + `end_turn` and the agentic loop silently dead-ends. The prep
   plan (`docs/prep-2026-05-30/anymodel-improvement-plan.md`, P0.2 "Streaming caveat")
   flagged this as the hard part (cannot reclassify already-streamed text). Real impact is a
   robustness fallback: qwen3-coder-30b under LM Studio currently emits STRUCTURED tool_calls.

2. **P1.10 — tool-capability cache is Ollama-only.** `shouldSendTools` (read) already applies
   to all local providers, but `cacheToolResult` (write) and the `tool_choice` strip are
   gated on `provider.name==='ollama'`, so lmstudio/llamacpp never learn a model lacks tools
   and re-probe every request.

Baseline before this increment: **351 pass / 0 fail** (`node --test test/*.test.mjs`).

## User stories & acceptance criteria

### US-1 — Streamed text-channel tool calls are recovered (local-only)
As Claude Code streaming against a local model, when the model parks a tool call in the text
channel, the proxy still surfaces a real `tool_use` block + `stop_reason:'tool_use'`.
- [x] AC-US1-01 — `createStreamTranslator({ localProvider })` buffers text deltas for local
  providers when `ANYMODEL_PARSE_TEXT_TOOLCALLS` is enabled (auto = local), then runs
  `extractTextToolCalls` at end-of-message.
- [x] AC-US1-02 — Qwen-XML and Hermes tool calls in a streamed text channel → recovered
  `tool_use` block(s) + `stop_reason:'tool_use'`; cleaned text emitted as a text block.
- [x] AC-US1-03 — false-positive guard: prose merely mentioning `<tool_call>` is NOT converted.
- [x] AC-US1-04 — no regression: cloud (`localProvider:false`) streams incrementally as before;
  structured streamed tool_calls still stream; exactly one `message_stop`.
- [x] AC-US1-05 — when structured tool_calls ARE present, buffered text is flushed as a text
  block before the tool blocks (correct order, no recovery double-emit).

### US-2 — Local tool-capability cache covers lmstudio/llamacpp (P1.10)
- [x] AC-US2-01 — `cacheToolResult(model, true/false)` is written for ALL local providers
  (success + no-tool-support paths), not just Ollama.
- [x] AC-US2-02 — the `tool_choice` strip stays **Ollama-only** (revised per 0009 review:
  LM Studio / llama.cpp are OpenAI-compatible and honor `tool_choice`, so stripping it would
  drop a forced selection — only the capability *cache* is generalized to all local providers).

### US-3 — Streaming usage parity (minor)
- [x] AC-US3-01 — Ollama streaming `message_delta` carries `input_tokens` from
  `prompt_eval_count` (was omitted; openai got it in 0008 P2.1).

## Definition of done
- Every AC has a test under `test/`; `npm test` green (≥351 pass / 0 fail).
- Live baseline (`test/live-baseline.mjs`) still 5/5 incl. exactly one `message_stop`;
  streaming structured tool calls not regressed.
