# Tasks: Project-scoped local skill index

TDD (`node --test`). Isolated to `providers/skill-catalog.mjs` + `proxy.mjs` + tests + docs. No `cli.mjs`, no `tool-compressor.mjs`.

### T-001: readProjectSkillNames (memoized) + WORKFLOW_CORE
**User Story**: US-003 | **AC**: AC-US3-01 | **Status**: [x] completed
**Description**: In `skill-catalog.mjs`, add `readProjectSkillNames(dir)` → array of subdir names under `<dir>/.claude/skills/` that contain `SKILL.md`; memoize by dir in a module Map; return `[]` on missing/unreadable (no throw). Add `WORKFLOW_CORE` const (sw:* essentials) + `defaultAlways()` reading `LOCAL_SKILL_ALWAYS`.
**Test**: Given a temp dir with `.claude/skills/foo/SKILL.md` → readProjectSkillNames → `['foo']`; missing dir → `[]`; second call hits memo.

### T-002: scope filter in buildFidelityAddition
**User Story**: US-001, US-002 | **AC**: AC-US1-01, AC-US1-02, AC-US2-01 | **Status**: [x] completed
**Description**: Extend `buildFidelityAddition(messages, {scope, projectDir, alwaysInclude, ...})`. When `scope==='project'`: filter harvested skills to `name ∈ (readProjectSkillNames(projectDir) ∪ alwaysInclude)`, pass `query=''` (stable) and a tighter `budgetChars` (~1500). When `scope==='all'`: unchanged 0010 path.
**Test**: Given a catalog of sw:do + 50 global skills, scope=project (no projectDir match) → only sw:* essentials kept; scope=all → full set. Two different queries in project scope → identical addition.

### T-003: proxy wiring
**User Story**: US-003 | **AC**: AC-US3-02 | **Status**: [x] completed
**Description**: In `proxy.mjs` (the 0010 block), derive `scope` (`LOCAL_SKILL_SCOPE` env, else `project` for balanced / `all` for full) and `projectDir` (`LOCAL_PROJECT_DIR` || `process.cwd()`); pass to `buildFidelityAddition`. No other change.
**Test**: integration — balanced request → forwarded body contains only project/workflow skills; full → full catalog.

### T-004: update 0010 integration tests for the new default
**User Story**: US-001, US-004 | **AC**: AC-US1-02, AC-US4-01 | **Status**: [x] completed
**Description**: Update `test/proxy-fidelity.test.mjs` so balanced asserts project-scoped (small) and a new `full`-tier assertion covers the whole-catalog (0010 regression). Keep lean no-op + Skill-retained + raw-strip assertions.
**Test**: suite green.

### T-005: bench + live verification
**User Story**: US-001 | **AC**: AC-US1-03, AC-US4-02 | **Status**: [x] completed
**Description**: Run `test/context-budget-bench.mjs` (balanced project-scope vs full) → record token + TTFT drop. Run `test/skill-trigger-eval.mjs` in project scope → ≥60% for in-scope skills.
**Test**: balanced skill tokens ≤ ~500 (vs ~1147 full); trigger ≥60%.

### T-006: docs
**User Story**: US-001 | **AC**: (doc) | **Status**: [x] completed
**Description**: `LOCAL_SETUP.md` — document scope tiers, `LOCAL_PROJECT_DIR`/`LOCAL_SKILL_SCOPE`/`LOCAL_SKILL_ALWAYS`, and the measured finding that **tool schemas are the dominant local context cost (79%)** with the existing tool-budget knobs.

## Verification
- `npm test` green (full suite incl. parallel sessions' tests).
- Live: balanced project-scope token/TTFT drop vs full; ≥60% trigger.
- Stability: `git diff` touches ONLY skill-catalog.mjs, proxy.mjs, the two test files, LOCAL_SETUP.md.
