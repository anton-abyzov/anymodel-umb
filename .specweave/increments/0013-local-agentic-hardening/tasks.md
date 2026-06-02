# Tasks: Local agentic reliability hardening (post-1.15.0)

> Source of truth for execution. TDD: write the test (red), implement (green), refactor.
> Verify the cited line numbers against current `repositories/antonoly/anymodel` before editing.

### T-001: Paren-variant text-channel tool-call parse
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-02, AC-US2-03 | **Status**: [x] completed
**Files**: `providers/openai.mjs` (~274), `test/text-toolcall-recovery.test.mjs`
**Test Plan**:
- Given a text channel containing `<function=web_fetch(url="https://x")>...</function>` (and an unclosed `<tool_call>` wrapper) → When recovered → Then a `tool_use` block with name `web_fetch` and `input{url:"https://x"}`.
- Given canonical `<function=name><parameter=...>` and Hermes `<tool_call>{json}</tool_call>` → When recovered → Then unchanged (no regression).
- Given prose `"call the <function=foo> helper"` with no valid structure → When evaluated → Then NOT converted.

### T-002: tool_result image/document markers (no silent drop)
**User Story**: US-003 | **Satisfies ACs**: AC-US3-01, AC-US3-02, AC-US3-03 | **Status**: [x] completed
**Files**: `providers/openai.mjs` `extractToolResultParts` (~108-120) + `translateRequest`, `test/openai.test.mjs`
**Test Plan**:
- Given a `tool_result` with an image block, non-vision backend → When translated → Then text contains `[image omitted: <N> bytes, <mime>]`, never `''`.
- Given a vision-capable backend → When translated → Then the image is forwarded as an image part.
- Given a document block → When translated → Then `[document omitted]` marker present; `is_error` prefix still applied when set.

### T-003: Session-scoped skill-catalog cache + turn-2+ re-injection
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01, AC-US1-02 | **Status**: [ ] pending
**Files**: `providers/skill-catalog.mjs` (`harvestSkillCatalog` ~52, `buildBehavioralCore` ~186-192), `proxy.mjs`, `test/skill-catalog.test.mjs`
**Test Plan**:
- Given turn 1 with a `<system-reminder>` catalog then turn 2 without one (same session signature) → When processed → Then turn 2's upstream system re-injects the cached catalog.
- Given no cache entry and no catalog for a turn → When `buildBehavioralCore` runs → Then no dangling "listed below" reference is emitted.
- Given many distinct sessions → Then the cache stays bounded (TTL/size cap, no unbounded growth).

### T-004: Trim-without-restore startup self-check warning
**User Story**: US-001 | **Satisfies ACs**: AC-US1-03 | **Status**: [ ] pending
**Files**: `proxy.mjs`, `test/skill-catalog.test.mjs`
**Test Plan**:
- Given a first request that contains a Skill tool + skill catalog while re-injection is disabled/absent → When processed → Then exactly one `console.warn` fires naming the condition + fix.
- Given re-injection active → Then no warning.

### T-005: Opt-in local refusal-recovery retry
**User Story**: US-004 | **Satisfies ACs**: AC-US4-01, AC-US4-02 | **Status**: [ ] pending
**Files**: `proxy.mjs` / `providers/openai.mjs`, new `test/local-refusal-retry.test.mjs`
**Test Plan**:
- Given `LOCAL_REFUSAL_RETRY=on`, a local response matching capability-disclaimer markers + `stop_reason:end_turn` + tools attached → When handled → Then exactly one re-issue with the injected "use your tools" system line.
- Given the flag unset → Then no retry (current behavior). Given a cloud provider → Then never retries. Retry cap = 1/turn enforced.

### T-006: Plan-state-aware history condenser
**User Story**: US-005 | **Satisfies ACs**: AC-US5-01, AC-US5-02 | **Status**: [ ] pending
**Files**: `proxy.mjs` (~580-588), new `test/multiturn-plan-state.test.mjs`
**Test Plan**:
- Given a conversation exceeding `MAX_MSG_CHARS` where turn 1 established plan mode → When condensed → Then the plan-mode turn and the latest `ExitPlanMode`-relevant assistant turn are retained.
- Given dropped middle turns → Then a one-line structured summary (count + tool names) replaces the empty `[Earlier conversation condensed]` filler.

### T-007: Multi-turn regression gate (skill-trigger + plan re-entry)
**User Story**: US-005 | **Satisfies ACs**: AC-US5-03 | **Status**: [ ] pending
**Files**: new `test/multiturn-plan-state.test.mjs` (scripted 10-turn harness)
**Test Plan**:
- Given a scripted 10-turn agentic task replayed through the proxy → When measured → Then turn-2+ skill-trigger rate ≥ 60% AND plan-mode re-entry count ≤ 1.

### T-008: Local-agentic preset + LOCAL_SETUP.md docs
**User Story**: US-006 | **Satisfies ACs**: AC-US6-01, AC-US6-02 | **Status**: [ ] pending
**Files**: `cli.mjs` (~446), `LOCAL_SETUP.md`, `test/cli.test.mjs`
**Test Plan**:
- Given `--local-agentic` (or documented env profile) → When launched for a local provider → Then guidance to relax mandatory plan-mode / blocking SKILL-FIRST and prefer `--full-mcp` is surfaced; default unchanged without the flag.
- `LOCAL_SETUP.md` documents the full recipe from the diagnosis doc.

## Verification
- `npm test` green (444 baseline + new tests) after every task.
- Re-run the live LM Studio baseline for T-001 (both 30B and 80B) and T-006/T-007.
- Close via `sw:done 0013` (code-review + simplify + grill + judge-llm gates).
