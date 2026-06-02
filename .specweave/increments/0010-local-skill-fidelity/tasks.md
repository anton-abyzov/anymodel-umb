# Tasks — 0010 Local Skill-Fidelity

TDD mode: each task is RED → GREEN → REFACTOR. Run `npm test` (node --test, the repo's zero-dep runner) after every task. Implementation in `repositories/antonoly/anymodel`.

## Phase 1: Pure module (`providers/skill-catalog.mjs`)

### T-001: harvestSkillCatalog()
**User Story**: US-001 | **AC**: AC-US1-02, AC-US1-04 | **Status**: [x] completed
**Description**: New pure fn — regex-capture the `"The following skills are available for use with the Skill tool:"` block from a messages array (string content + text blocks), split into `- name: desc` lines, drop the ` - whenToUse` tail, clamp each desc to `LOCAL_SKILL_DESC_CHARS` (140). Returns `{lines, rawCount}`. Empty/absent → `{lines:[], rawCount:0}` (no throw).
**Test**: Given a user message containing the system-reminder skill block → When `harvestSkillCatalog(messages)` → Then returns the name:desc lines with whenToUse dropped and descriptions clamped; absent block → empty result.

### T-002: selectSkills()
**User Story**: US-004 | **AC**: AC-US4-01, AC-US1-01 | **Status**: [x] completed
**Description**: Pure fn `selectSkills(lines, {budgetChars, query, fidelity})` → `{block, kept, dropped}`. Keep `sw:*` + project skills first; score the rest by keyword overlap with `query` (latest user msg); cap total chars to `budgetChars`; degrade to names-only under pressure; **sort by name**; prepend header `"Available skills (call the Skill tool when a request matches — matching is a BLOCKING REQUIREMENT, call Skill FIRST):"`. `full` fidelity retains whenToUse + higher clamp.
**Test**: Given 200 harvested lines and a small budget → When `selectSkills(...)` → Then sw:*/project lines retained first, total chars ≤ budget, overflow degraded to names-only, output name-sorted (deterministic).

### T-003: buildBehavioralCore()
**User Story**: US-004 | **AC**: AC-US4-02 | **Status**: [x] completed
**Description**: Pure fn returning a curated ≤900-token CC behavioral core (terse-output, tool-use discipline, plan-before-act, satisfy-deps-first) that **verbatim** includes the "when a request matches a skill, call the Skill tool FIRST — this is a BLOCKING REQUIREMENT" rule. Date-free (determinism). `lean` → empty string.
**Test**: Given fidelity=balanced → When `buildBehavioralCore('balanced')` → Then returns a ≤900-token string containing the blocking-Skill rule; fidelity=lean → ''.

## Phase 2: Proxy wiring (`proxy.mjs`)

### T-004: Harvest before strip
**User Story**: US-001 | **AC**: AC-US1-04 | **Status**: [x] completed
**Description**: At ~`proxy.mjs:544`, before the `xmlTagPattern` strip loop, when `isLocal && LOCAL_SKILL_INDEX!=='off'`, call `harvestSkillCatalog(parsed.messages)` and stash. Leave the existing strip unchanged (it removes the now-harvested verbose block). Log a warning when `isLocal && Skill in body.tools` but harvest is empty (header drift).
**Test**: Given a local request with the skill system-reminder → When the transform runs → Then the catalog is harvested AND the raw `<system-reminder>` is still removed from `parsed.messages` (no duplication).

### T-005: Re-inject into parsed.system (both branches) + env knobs + log
**User Story**: US-001, US-005 | **AC**: AC-US1-01, AC-US5-01 | **Status**: [x] completed
**Description**: At ~`proxy.mjs:502-538`, read `LOCAL_FIDELITY` / `LOCAL_SKILL_INDEX` / `LOCAL_MAX_SYSTEM_PCT` / `LOCAL_SKILL_DESC_CHARS`; compute `skillBudgetChars` (from `LOCAL_MAX_SYSTEM_PCT * numCtx`, clamped); raise effective cap to `MAX_SYSTEM_CHARS + skillBudgetChars`; append `buildBehavioralCore(fidelity)` + `selectSkills(...).block` to `parsed.system` in **both** the `>cap` condense branch AND a new `≤cap` else-branch. Add log `[FIDELITY] tier=… re-injected N skills (~T tok), system X→Y chars`.
**Test**: Given balanced tier and a request whose system is already ≤ cap → When the transform runs → Then the skill block + behavioral core are still appended to `parsed.system` (AC-US5-01), and the `Available skills` header is present (AC-US1-01).

### T-006: Fidelity dial gating
**User Story**: US-002 | **AC**: AC-US2-01, AC-US2-02 | **Status**: [x] completed
**Description**: Implement `lean` (no re-injection — byte-identical to pre-change output), `balanced` (default), `full` (richer index). `LOCAL_SKILL_INDEX=off` short-circuits harvest/re-inject entirely regardless of tier.
**Test**: Given `LOCAL_FIDELITY=lean` → When transform runs → Then `parsed.system` equals current condensed output exactly (no skill block). Given `LOCAL_SKILL_INDEX=off` → Then `harvestSkillCatalog` never called.

### T-007: Widen prefix-cache to all local providers
**User Story**: US-003 | **AC**: AC-US3-01, AC-US3-02 | **Status**: [x] completed
**Description**: Change `proxy.mjs:622` `if (provider.name === 'ollama')` → `if (isLocal)`. Ensure lmstudio/llamacpp `transformResponse`/`createStreamTranslator` accept the now-non-null `prefixCacheResult` (parity with the ollama path at 881/891). Confirm `prefix-cache.mjs:normalizeForHash` keeps the new block byte-stable (date-free, name-sorted — no logic change expected).
**Test**: Given two identical lmstudio requests → When transform runs both → Then `getOrStore` is invoked for lmstudio and returns `hit=true` on the 2nd; `computePrefixHash(parsed.system, parsed.tools)` is equal across 3 identical requests (AC-US3-01).

## Phase 3: Guards, CLI, docs, eval

### T-008: Never-evict guard for Skill + ToolSearch
**User Story**: US-001 | **AC**: AC-US1-03 | **Status**: [x] completed
**Description**: In `tool-compressor.mjs` selection loop (~136-143), guarantee `Skill` + `ToolSearch` are always included even under a tiny budget (currently tier-1 IMPORTANT can be evicted when the loop `break`s). Force-include them before the budget loop.
**Test**: Given a tool list with Skill + 90 others and a tiny `budgetPct` → When `optimizeTools` runs → Then `Skill` (and `ToolSearch`) are still present in the output.

### T-009: cli.mjs --local-fidelity flag
**User Story**: US-005 | **AC**: AC-US5-02 | **Status**: [x] completed
**Description**: Parse `--local-fidelity <lean|balanced|full>` (+ `ANYMODEL_LOCAL_FIDELITY`), default `balanced`; export `LOCAL_FIDELITY` to the proxy child env in the same block that handles `--full-mcp`. Add to help text. Must not alter MCP suppression.
**Test**: Given `anymodel proxy lmstudio --local-fidelity full` → When the proxy child starts → Then `LOCAL_FIDELITY=full` is in its env and produces a richer index than balanced; MCP suppression unchanged.

### T-010: Integration test suite
**User Story**: US-001, US-002, US-003, US-005 | **AC**: AC-US1-01, AC-US1-04, AC-US2-01, AC-US2-02, AC-US3-01, AC-US3-02 | **Status**: [x] completed
**Description**: NEW `test/proxy-fidelity.test.mjs` — feed a realistic parsed request (CC system + a user message with the skill system-reminder + Skill in body.tools) through the local transform; assert per-tier output, 3× byte-identical `parsed.system`, Skill stays in tools, raw system-reminder stripped, `LOCAL_SKILL_INDEX=off` no-op, lmstudio `getOrStore` hit.
**Test**: Given the fixture request across tiers → When the transform pipeline runs → Then all per-tier + determinism + cache assertions pass.

### T-011: Docs — LOCAL_SETUP.md
**User Story**: US-002, US-005 | **AC**: (doc) | **Status**: [x] completed
**Description**: Document `LOCAL_FIDELITY`, `LOCAL_SKILL_INDEX`, `LOCAL_MAX_SYSTEM_PCT`, `LOCAL_SKILL_DESC_CHARS`, the `--local-fidelity` flag, and the per-tier latency trade-off.
**Test**: Given a reader → When they read LOCAL_SETUP.md → Then all four knobs + the flag + the trade-off table are present.

### T-012: Capability eval (regression gate)
**User Story**: US-006 | **AC**: AC-US6-01 | **Status**: [x] completed
**Description**: Curate 10-20 prompts each matching a known skill; run them through the proxy against live LM Studio MLX qwen3-coder-30b (:1234) with `LOCAL_FIDELITY=balanced`; record the Skill-tool-call rate. Gate ≥60%. Capture as a standalone harness (not a CI-blocking unit test — live model required).
**Test**: Given 10-20 skill-matching prompts → When run through the proxy at balanced → Then qwen3-coder-30b calls the Skill tool with a valid skill name on ≥60%.

## Verification (DONE)
- `npm test` — full suite **430/430 green** (23 new 0010 tests added; no regressions).
- Live (M4 Max, qwen3-coder-30b MLX): `[FIDELITY] tier=balanced re-injected 13 skills (~363 tok)` logged; skill-trigger eval **balanced 9/12 (75%) vs lean 0/12 (0%)** — AC-US6-01 PASS.
