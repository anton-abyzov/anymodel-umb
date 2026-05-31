# Increment 0008 — Adversarial Review Report

**Method:** 18-agent workflow (10 per-fix adversarial reviewers → independent verifiers → 3 assessment agents: protocol-compliance, competitive-value, completeness-critic). 1.22M subagent tokens. Each finding re-verified against the actually-landed source before acceptance.

**Gate status at review time:** `npm test` = 346/346 pass (now 351/351 after follow-ups). Live LM Studio baseline (qwen/qwen3-coder-30b): 5/5 incl. exactly-one `message_stop`.

## Confirmed-real findings → all fixed

| # | Fix | Sev | Finding | Resolution (commit) |
|---|-----|-----|---------|---------------------|
| 1 | P1.6 | HIGH | Retry-exhaustion 429/5xx path forwarded the raw upstream (OpenAI/LM-Studio-shaped) error body verbatim, bypassing the canonical envelope on the exact path Claude Code keys retry/backoff off `error.type`. | `26bca36` — routed through `sendError` (429→`rate_limit_error`, 5xx→`overloaded_error`, retry-after preserved); remaining non-200 → canonical by status; added `extractUpstreamErrorMessage`. |
| 2 | P1.1 | MED | Streamed tool block was opened on first sighting with `name: ''`; if a server streamed an args fragment before the name chunk, the name was permanently lost (empty-name `tool_use` = undispatchable). Dormant vs real servers (they send name first) but a protocol-shape bug. | `26bca36` — defer `content_block_start` until name known, buffering early args (`toolPending`); `flushPendingTools` synthesizes a name on a name-less tail + warns. |
| 3 | P1.2 | MED | `document` blocks inside a `tool_result` were dropped with no marker (violates the never-drop contract). | `26bca36` — `[document omitted]` marker added in `extractToolResultParts`. |
| 4 | P1.9 | MED | The `/v1/messages/count_tokens` mock still did an unbounded `chunks.push`+`Buffer.concat` (the one remaining LAN-DoS surface). | `26bca36` — routed through `readCappedBody` → 413 on overflow. |
| 5 | P1.6 | LOW | `sendError` guarded `writableEnded` but not `headersSent`; a post-stream throw → `ERR_HTTP_HEADERS_SENT`. | `d4be87b` — `headersSent` guard closes cleanly. |

## Adjudicated NOT-a-bug

- **"Non-streaming recovery half-wired" (RANK 2):** false. `lmstudio`/`llamacpp` get text-channel recovery via the `openai-local` factory (`translateResponse(body,{localProvider:true})`); the bare cloud `openai` provider correctly does NOT (cloud untouched under `auto`).

## Known gaps deferred to a follow-up increment (out of 0008 scope)

1. **(RANK 1) Streaming text-channel tool-call recovery** — `createStreamTranslator` does not run `extractTextToolCalls`; P0.2 recovery is non-streaming-only. This is the "hard part" the prep plan explicitly deferred (needs buffering streamed text or forcing non-streaming when `tools` present). Low real impact for the tested target: qwen3-coder-30b under LM Studio emits **structured** `tool_calls` (recovery is a fallback for a misconfigured parser), and structured calls already stream correctly via P1.1. Still the #1 robustness follow-up for weaker local models / wrong `--tool-call-parser`.
2. **P1.10** capability-cache + `tool_choice` strip generalized beyond Ollama to lmstudio/llamacpp.
3. **P2.3** streaming malformed-arg `{}`-fallback (per-index buffer + parse at stop).
4. Minor parity: `message_start.usage.input_tokens` still 0 (P2.1 fixed `message_delta` only); ollama streaming `message_delta` omits `input_tokens`; `event: ping` can precede `message_start` (clients tolerate it).

## Compliance verdict (assessment agent)

Materially improved; happy path intact. Wins: single-`message_stop` streaming order, per-`tc.index` routing, unified `mapFinishReason` with `content_filter`→`refusal` (a valid Anthropic stop_reason), canonical error envelope, multimodal no-silent-drop, streamed `input_tokens`. All changes additive or local-gated — no OpenRouter/cloud regression.

## Value verdict (assessment agent)

Ship-quality. After 0008 AnyModel is a credible drop-in to run Claude Code **fully local/offline** on Qwen3-Coder: no Claude subscription (relevant post Apr-2026 third-party cutoff), zero token cost, full privacy, Anthropic protocol intact so MCP/tools/skills keep working — a niche Codex CLI (OpenAI-native, no MCP/skills surface) structurally can't serve, and one it now handles more robustly than generic routers (CCR/LiteLLM) for *local* failure modes specifically (missing-`[DONE]` flush, text-channel recovery, per-model tool caching, schema compression). Honest downsides vs cloud Claude: weaker raw model quality, best-effort (not guaranteed) text-channel tool recovery, smaller practical context, tens-of-seconds TTFT on 30–80B, silent `input:{}` on truncated args under `max_tokens` pressure.
