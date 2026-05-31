# Plan — 0009 Streaming text-channel tool-call recovery + local capability cache

## Approach (US-1) — buffer-until-flush (prep-doc default)
Cannot reclassify already-streamed text, so for local providers with recovery enabled we
BUFFER the text channel (`delta.content`) instead of emitting it incrementally, then decide at
end-of-message. Chosen over "force non-streaming upstream" because it preserves incremental
streaming of *structured* tool calls and thinking, and reuses the existing `extractTextToolCalls`.

- `createStreamTranslator(opts)` gains `{ localProvider }`; `recoverText = textChannelParsingEnabled(localProvider)`.
  Guard `opts || {}` — the proxy calls `createStreamTranslator(prefixCacheResult)` with `null` for
  non-ollama, so destructuring must not throw on null.
- `openai-local.mjs` wraps: `createStreamTranslator: () => createStreamTranslator({ localProvider: true })`.
- In the `delta.content` branch: if `recoverText`, append to `bufferedText` (don't emit); else
  existing incremental path (cloud unchanged).
- `emitBufferedText(output, allowRecovery)` — single consume (idempotent via `bufferConsumed`):
  text block first (cleaned or full), then recovered `tool_use` blocks (full-JSON `input_json_delta`),
  set `accumulatedStopReason='tool_use'` when calls found.
- When structured `delta.tool_calls` arrive: flush buffered text first with `allowRecovery=false`
  (structured present → no recovery, keep text-before-tool order), then the tool loop runs.
- `emitStop`: `emitBufferedText(output, true)` (recovery if not already consumed) → flushPendingTools → closeOpenBlocks.

## US-2 (P1.10) — proxy.mjs
- Generalize the success-cache and no-tool-support-cache writes from `provider.name==='ollama'`
  to `isLocal`. Generalize the `tool_choice` strip to `isLocal`.
- Cache is model-keyed (provider-agnostic), so this is safe.

## US-3 — ollama.mjs
- Add `input_tokens: parsed.prompt_eval_count || 0` to the streaming `message_delta` usage.

## Testing constraint (carried from 0008)
Do NOT start the full proxy inside a `node --test` file (keep-alive agents wedge the runner).
Test `createStreamTranslator` directly; prove end-to-end via the standalone `test/live-baseline.mjs`.

## Risks
- Buffering changes local streaming UX (text appears at end of message for local turns). Gated
  to local + recovery-enabled; documented. Incremental-flush optimization noted as future work.
- Index ordering: text block must precede recovered/structured tool blocks. Covered by tests.
