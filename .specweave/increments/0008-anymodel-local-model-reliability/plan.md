# Plan — 0008 AnyModel local-model reliability

## Architecture context
- `cli.mjs` boots → `createProxy()` in `proxy.mjs`; `/v1/messages` → provider, else passthrough.
- Translation lives in `providers/openai.mjs` (`translateRequest`/`translateResponse`/`createStreamTranslator`),
  reused by the `openai-local` factory (`providers/openai-local.mjs`) for LM Studio + llama.cpp.
- Zero runtime deps (Node builtins). Tests: `node --test test/*.test.mjs`.

## Testing constraint (learned in Tier 0 — do not repeat)
Do NOT start the full proxy with keep-alive agents inside a `node --test` file — the agent holds the
event loop open and wedges the runner on exit (caused an EXIT 124 hang). Test the *mechanism*
directly; prove end-to-end with a standalone script that calls `process.exit()`.

## Execution order (by leverage; each = test + npm test green + baseline re-run)
1. P1.1 per-`tc.index` streamed tool-call map (openai.mjs) — fix misroute + block-index inflation.
2. P1.6 `sendError` helper (proxy.mjs) — prerequisite for clean 504/error shapes.
3. P1.2 image/document translation (openai.mjs translateRequest).
4. P1.3 `tool_result.is_error` preservation (openai.mjs + gemini.mjs + ollama.mjs).
5. P1.4 forward `top_p`/`stop_sequences`/`max_output_tokens` (openai.mjs).
6. P1.5 unify finish_reason map; `content_filter`→`refusal` (openai.mjs).
7. P1.7 loopback bind, P1.8 no key passthrough on local, P1.9 body caps + parse guards (proxy.mjs).
8. Tier 2 (P2.x) if budget remains.

## Verify-before-acting (3 items flagged UNVERIFIED in the plan)
- P1.7: confirm `server.listen` has no host arg and `checkAuth` allows on no-token (1-line grep).
- P1.4: confirm whether `sanitizeBody` already normalizes `max_output_tokens` (redundancy only).
- P1.1: the claim "ollama.mjs uses a per-tc.index map" is FALSE — do not copy ollama as precedent.

## Risks
- P1.1 touches streaming index accounting → strongest test coverage (interleaved fragments,
  text-then-tool, single-tool regression).
- P1.2 changes user content from string to array → verify text-only turns still serialize/accepted.
- P1.7 is a behavior change for LAN users → opt-in flag + doc.
