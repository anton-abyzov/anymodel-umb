# 0011 — Tasks

### T-001: Ollama native image translation
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01, AC-US1-02, AC-US1-03, AC-US1-04 | **Status**: [x] completed
**Test**: Given an Anthropic user message with a base64 image → When `ollama.transformRequest` runs → Then the native body has `message.images:[rawBase64]` and string `content`.

### T-002: Responses input_image → Chat image_url
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-02, AC-US2-03, AC-US2-04 | **Status**: [x] completed
**Test**: Given a Responses user message with an `input_image` → When `responsesToChat` runs → Then the chat user message carries a `{type:"image_url", image_url:{url}}` part.

### T-003: Tool-result image hoist
**User Story**: US-002 | **Satisfies ACs**: AC-US2-05 | **Status**: [x] completed
**Test**: Given a `function_call_output` containing an image → When `responsesToChat` runs → Then the `tool` message holds the text and a following `user` message holds the image part.

### T-004: Test suite + release
**User Story**: US-001, US-002 | **Satisfies ACs**: all | **Status**: [x] completed
**Test**: Given the full `node --test test/*.test.mjs` suite → When run → Then 441/441 pass (11 new, 0 regressions). Version bumped 1.14.1 → 1.15.0.
