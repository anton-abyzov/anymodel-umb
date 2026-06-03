# Tasks: Universal multi-ecosystem SKILL.md loader

**Increment**: 0014 | **Spec**: [spec.md](spec.md) | TDD: RED → GREEN → REFACTOR

### T-001: Root resolution + foreign-skill discovery (pure)
**ACs**: AC-US1-01, AC-US1-05, AC-US1-06 | **Status**: [x] completed
**Test**: Given foreign roots with `.agents/skills/foo/SKILL.md` (+ `agents/openai.yaml`) →
When `discoverForeignSkills` runs with injectable fs → Then `foo` is found with its
skillMdPath and sidecarPath; `ANYMODEL_SKILL_ROOTS` adds extra roots; non-dirs / dirs
without SKILL.md are skipped.

### T-002: Bridge planning — precedence + shadowing (pure)
**ACs**: AC-US1-03, AC-US1-04 | **Status**: [x] completed
**Test**: Given a project skill `foo` and foreign skills `foo` (two roots) + `bar` →
When `planSkillBridge` runs → Then `bar` + the first `foo`-root are linked appropriately,
project `foo` wins (foreign `foo` shadowed), the duplicate foreign `foo` is shadowed, and
both shadow reasons are recorded.

### T-003: Materialize symlink shadow + cleanup (I/O)
**ACs**: AC-US1-02, AC-US1-07, AC-US1-08 | **Status**: [x] completed
**Test**: Given a plan with 2 links → When `materializeSkillBridge` runs on a real temp dir →
Then `T/.claude/skills/<name>` symlinks resolve to the skill dirs and `SKILL.md` is readable
through them; an unlinkable entry is skipped, not thrown; the dir is removable.

### T-004: Wire bridge into both launch paths
**ACs**: AC-US1-09 | **Status**: [x] completed
**Test**: Given `buildSkillBridge` yields links → When `connectToProxy`/`launchClaude` spawn →
Then `--add-dir <bridgeDir>` is in the client args and a cleanup runs on exit/SIGINT.
(Verified via exported pure helper + integration test; manual smoke for spawn.)

### T-005: Integration / E2E
**ACs**: all | **Status**: [x] completed
**Test**: Given a temp project containing `.agents/skills/demo/SKILL.md` → When the bridge is
built → Then a `.claude/skills/demo/SKILL.md` is resolvable under the bridge dir (proving the
client would discover it), and `--add-dir` points at it.
