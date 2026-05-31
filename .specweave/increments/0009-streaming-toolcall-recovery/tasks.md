# Tasks — 0009 Streaming text-channel tool-call recovery + local capability cache

Baseline before increment: 351 pass / 0 fail.

### T-001: createStreamTranslator buffers + recovers text-channel tool calls (local)
**User Story**: US-1 | **Satisfies ACs**: AC-US1-01..05 | **Status**: [x] completed
**Test**: Given a streamed Qwen-XML / Hermes tool call in the text channel + localProvider →
When translated → Then a `tool_use` block + `stop_reason:'tool_use'`; prose mentioning the tag
is NOT converted; cloud (localProvider:false) streams incrementally; exactly one `message_stop`.

### T-002: openai-local passes localProvider:true to the stream translator
**User Story**: US-1 | **Satisfies ACs**: AC-US1-01 | **Status**: [x] completed
**Test**: Given the lmstudio/llamacpp factory → When createStreamTranslator built → Then it
recovers text-channel tool calls under auto.

### T-003: Generalize tool-capability cache + tool_choice strip to all local providers (P1.10)
**User Story**: US-2 | **Satisfies ACs**: AC-US2-01, AC-US2-02 | **Status**: [x] completed
**Test**: Given a local provider (lmstudio) → When a tool turn succeeds/fails → Then
`cacheToolResult` is written for it; `tool_choice` is stripped.

### T-004: Ollama streaming message_delta carries input_tokens (P2.1 parity)
**User Story**: US-3 | **Satisfies ACs**: AC-US3-01 | **Status**: [x] completed
**Test**: Given an Ollama stream with `prompt_eval_count` → When the final chunk is translated →
Then `message_delta.usage.input_tokens` is populated.
