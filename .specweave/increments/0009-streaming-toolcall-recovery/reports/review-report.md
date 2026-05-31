# Increment 0009 — Adversarial Review Report

**Method:** 11-agent focused workflow (4 reviewers on buffer-correctness / regression-risk /
edge-cases / P1.10 → independent verifiers). 669K subagent tokens. Each finding re-verified
(and several empirically reproduced) against the landed source before acceptance.

**Gate at review time:** 361/361 unit; live LM Studio 6/6 (incl. streaming-with-tools). No
review agent edited the working tree.

## Confirmed-real findings → all fixed (commit ffd3524)

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | HIGH | **Post-tool text data loss (local):** once a structured tool_call flushed the buffer and set `bufferConsumed`, later `delta.content` re-appended to the dead buffer and `emitStop` early-returned → trailing narration silently dropped (cloud preserved it → divergence). | `delta.content` buffers only while `!bufferConsumed`; post-consume text falls through to a fresh incremental text block. Regression test added. |
| 2 | MED | **stop_reason stayed `end_turn`** for a streamed `tool_use` when the server omitted a `finish_reason:tool_calls` chunk (pre-existing; 0009 exposed it on the default streaming path). | `emitStop` defaults `stop_reason:'tool_use'` when any structured tool block opened, without clobbering `max_tokens`/`refusal`. |
| 3 | HIGH | **Fenced ```json false-positive:** recovery now runs on the streaming default path, so a coding model printing a `{name,arguments}`-shaped ```json example would be misclassified as a tool call (text stripped + phantom tool_use). | The ambiguous fenced pattern is gated to explicit `ANYMODEL_PARSE_TEXT_TOOLCALLS=on`; under `auto` only the unambiguous Hermes/Qwen-XML spans recover. `extractTextToolCalls(text,{allowFenced})`. |
| 4 | LOW | **`tool_choice` strip over-generalized:** P1.10 generalized the Ollama-only strip to all local providers, but LM Studio / llama.cpp are OpenAI-compatible and DO honor `tool_choice` — stripping silently dropped a forced selection. | Reverted: strip stays Ollama-only. The capability **cache** generalization (the valuable part of P1.10) is kept. |

## Adjudicated trade-off (not a bug, documented)
- **Buffer-until-flush delays local streamed text to end-of-message.** This is the prep-plan's
  prescribed approach (clean output — tool-call syntax stripped). After fix #1, only *pre-tool*
  and *pure-text* segments buffer; post-tool narration streams incrementally. For the target
  (qwen3-coder-30b emits structured tool calls; text answers are short) the impact is minor.
  Disable with `ANYMODEL_PARSE_TEXT_TOOLCALLS=off`. An incremental "stream-until-marker"
  optimization is noted as future work.

## Verification after fixes
- Unit: **366/366** (+5 regression tests for findings #1–#3).
- Live LM Studio: **6/6** incl. streaming-with-tools (one `message_stop`, tool_use survives).
