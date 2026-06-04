# Tasks: Claude Code Surface Audit and Prune

## US-001: Runtime surface classification

### T-001: Audit and classify Claude-derived surfaces
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01 | **Status**: [x] completed
**Test Plan**: Given source-wide searches for Claude, `.claude`, `cli.js`, `output_config`, `FREE_MODELS`, and `effort` -> When findings are classified in `plan.md` -> Then each kept/pruned/fixed surface has a recorded disposition.

### T-002: Prune stale client discovery fallbacks
**User Story**: US-001 | **Satisfies ACs**: AC-US1-02, AC-US1-03 | **Status**: [x] completed
**Test Plan**: Given no bundled/local/explicit client -> When global `claude` exists -> Then AnyModel can still launch via global fallback. Given docs mention client discovery -> Then only current discovery paths are listed.

## US-002: Effort handling

### T-003: Preserve effort internally while stripping output_config
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01 | **Status**: [x] completed
**Test Plan**: Given a body with `output_config.effort` -> When `sanitizeBody` runs -> Then `output_config` is removed from enumerable payload and effort is retained on the internal non-enumerable field.

### T-004: Map compatible effort to OpenAI reasoning_effort
**User Story**: US-002 | **Satisfies ACs**: AC-US2-02, AC-US2-03, AC-US2-04 | **Status**: [x] completed
**Test Plan**: Given preserved efforts low/medium/high/max -> When OpenAI provider translates a compatible model -> Then `reasoning_effort` is low/medium/high/high. Given local provider translation -> Then no `reasoning_effort` is emitted by default.

## US-003: Worker parity

### T-005: Remove Worker free-model allowlist
**User Story**: US-003 | **Satisfies ACs**: AC-US3-01, AC-US3-02 | **Status**: [x] completed
**Test Plan**: Given any model ending in `:free` -> When Worker free-only mode checks it -> Then it is allowed. Given a paid model -> Then it is blocked. Given `openrouter/free` -> Then it is allowed.

### T-006: Include Worker tests in normal test command
**User Story**: US-003 | **Satisfies ACs**: AC-US3-03 | **Status**: [x] completed
**Test Plan**: Given `npm test` -> When it runs -> Then both `test/*.test.mjs` and `worker/test/*.test.mjs` execute.

## US-004: Setup docs

### T-007: Update README, LOCAL_SETUP, KNOWLEDGE-BASE, and skill docs
**User Story**: US-004 | **Satisfies ACs**: AC-US4-01, AC-US4-02, AC-US4-03 | **Status**: [x] completed
**Test Plan**: Given docs are searched for `claude-code-anymodel`, `FREE_MODELS`, `_unused` placeholder claims, and old `output_config` stripping -> Then stale claims are removed or replaced with current behavior.

## Closure

### T-008: Verification
**Status**: [x] completed
**Test Plan**: Run `npm test`, `node --check cli.mjs proxy.mjs providers/*.mjs worker/*.mjs`, and `npm pack --dry-run`.
