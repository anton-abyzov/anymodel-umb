# Tasks: Adaptive Branding + Universal Skill Loader

**Increment**: 0011 | **Spec**: [spec.md](spec.md)

## US-001 — Reproducible, model-adaptive branding (DONE)

### T-001: Declarative brand-patch applier
**User Story**: US-001 | **Satisfies ACs**: AC-US1-03, AC-US1-04 | **Status**: [x] completed
**Test**: Given a fixture bundle with vendor strings → When `applyBrandPatches` runs →
Then every `from` is replaced, re-run is a no-op, and `--check` flags drift.
Implemented in `scripts/brand-patch.mjs`; loads manifest from `scripts/brand-patches.json`.

### T-002: Audit + curate the user-visible brand-string manifest
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01, AC-US1-05 | **Status**: [x] completed
**Test**: Given the pristine bundle → When the manifest is generated → Then all 61
anchors exist with the asserted `expect` counts, and zero internal/excluded strings
are included. 16-agent workflow audit → deduped/conflict-resolved → `brand-patches.json`.

### T-003: Model-adaptive entries via ANYMODEL_MODEL
**User Story**: US-001 | **Satisfies ACs**: AC-US1-02 | **Status**: [x] completed
**Test**: Given `ANYMODEL_MODEL=qwen/...` → When plan mode / first-run tip renders →
Then it names the loaded model, not "Opus"/"Claude". 10 adaptive entries inject
`process.env.ANYMODEL_MODEL` expressions.

### T-004: Manifest-driven tests + CI gate
**User Story**: US-001 | **Satisfies ACs**: AC-US1-04, AC-US1-06 | **Status**: [x] completed
**Test**: Given the manifest → When `node --test test/brand-patch.test.mjs` → Then
4/4 pass incl. live-bundle drift gate; full suite 430/430; `node --check cli.js` OK;
`--version` → `1.14.1 (anymodel)`.

## US-002 — Universal multi-root SKILL.md discovery (DESIGNED — NEXT)

### T-005: Add non-Claude discovery roots to the skill scanner
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-02 | **Status**: [ ] pending
**Test Plan**: Given a `.agents/skills/foo/SKILL.md` in cwd → When anymodel starts →
Then skill `foo` is registered with its description, identical to a `.claude/skills` skill.
Seam: launch-time bridge in `cli.mjs` — symlink foreign-root skills into a temp
`T/.claude/skills/` shadow and pass `--add-dir T`; reuse the bundled SKILL.md reader.
(NOT the minified `getSkillDirCommands`; NOT `providers/skill-catalog.mjs`, which only
re-injects an already-harvested catalog for local models.)

### T-006: Codex `agents/openai.yaml` sidecar (parse-or-ignore)
**User Story**: US-002 | **Satisfies ACs**: AC-US2-03 | **Status**: [ ] pending
**Test Plan**: Given a Codex skill with a valid sidecar → Then UI metadata +
`allow_implicit_invocation` apply. Given a missing/invalid sidecar → Then the skill
still loads from `SKILL.md` alone.

### T-007: Configurable roots + duplicate precedence
**User Story**: US-002 | **Satisfies ACs**: AC-US2-04, AC-US2-05 | **Status**: [ ] pending
**Test Plan**: Given `ANYMODEL_SKILL_ROOTS=/custom` → Then `/custom` is scanned.
Given the same skill `name` in project and user scope → Then project wins and the
shadowed copy is logged.

### T-008: Pure-proxy-mode root injection
**User Story**: US-002 | **Satisfies ACs**: AC-US2-06 | **Status**: [ ] pending
**Test Plan**: Given pure-proxy mode (stock `claude`) → When anymodel launches →
Then extra roots are passed via `--add-dir`/settings (no bundle patch required).
