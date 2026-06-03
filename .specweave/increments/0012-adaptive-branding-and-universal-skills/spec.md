# Spec: Adaptive Branding + Universal Skill Loader

**Increment**: 0011 | **ADR**: [0003](../../docs/internal/architecture/adr/0003-adaptive-branding-and-universal-skill-loader.md)
**Target repo**: `repositories/antonoly/anymodel`

## Problem

anymodel re-brands a bundled 13MB minified Claude Code TUI (`cli.js`) and routes to
any model (default `qwen/qwen3-coder`). Two gaps:

1. **Vendor branding leaks.** The first-run tip says *"Opus now defaults to 1M
   context…"* and plan mode says *"Claude is now exploring…"* — wrong product, wrong
   model. Branding was hand-edited into the minified blob (~10 ad-hoc edits, 50+
   strings still leaking, no reproducibility, no anti-regression check).
2. **Skills load from one ecosystem.** Only `.claude/skills/<name>/SKILL.md` is
   discovered. Goal: support skills from all ecosystems by default.

## US-001 — Reproducible, model-adaptive branding  ✅ DONE

As a user running anymodel with any model, I see anymodel/the-loaded-model in the
UI, never Anthropic-specific branding, and the maintainer can re-apply branding
deterministically on every upstream bundle refresh.

**Acceptance Criteria**
- [x] **AC-US1-01**: No user-visible Anthropic vendor string (Opus/Sonnet/Haiku promo,
  "Claude is …", "Welcome to Claude Code", "Log in to Claude", Anthropic-account/
  billing copy, "(Claude Code)" version suffix, CLI `--help` descriptions) appears in
  the shipped `cli.js`. **66 strings** rebranded (incl. capitalizing pre-existing
  lowercase "anymodel" → **"AnyModel"** per the skill brand rule; the package/command/
  URL/env identifiers stay lowercase).
- [x] **AC-US1-02**: First-run tip and plan-mode/status lines are **model-adaptive** —
  they render `process.env.ANYMODEL_MODEL` (the actually-loaded model), falling back
  to "AnyModel". (10 adaptive entries.)
- [x] **AC-US1-03**: Branding is applied by a **declarative manifest**
  (`scripts/brand-patches.json`) + an **idempotent applier** (`scripts/brand-patch.mjs`)
  that asserts occurrence counts, re-parses via `node --check`, and is a safe no-op
  on re-run.
- [x] **AC-US1-04**: A `--check` CI gate fails if any known vendor string reappears
  (anti-regression). A manifest-driven test suite verifies apply + idempotency + the
  live bundle.
- [x] **AC-US1-05**: Internal strings are **never** changed — model IDs, API hostnames,
  `claude-code` config name, system-prompt/identity text, LLM prompt templates,
  CLAUDE.md guidance, MCP client_name, `Claude Desktop`, Claude-only features. The
  excluded set is documented in the manifest generator and the ADR.
- [x] **AC-US1-06**: The full anymodel test suite (430 tests) still passes; the patched
  bundle boots (`--version` → `1.14.1 (anymodel)`).

## US-002 — Universal multi-root SKILL.md discovery  ➡️ IMPLEMENTED in increment [0014](../0014-universal-skill-loader/spec.md)

> Design retained here for reference; the launch-time skill bridge is built and tested in 0014.


As a user, skills authored for Claude Code, OpenAI/Codex, or Gemini/Antigravity load
in anymodel automatically, because they all use the same `SKILL.md` open standard.

**Acceptance Criteria**
- [ ] **AC-US2-01**: anymodel discovers skills under non-Claude conventional roots —
  `.agents/skills/`, `.codex/skills/`, `.gemini/skills/`, `.agent/skills/` (project +
  user scope) — in addition to `.claude/skills/`.
- [ ] **AC-US2-02**: All discovered skills normalize to the existing loader's
  `{frontmatter, markdownContent, skillName}` triple; progressive disclosure and the
  skill registry are reused unchanged (no format-translation layer).
- [ ] **AC-US2-03**: Codex `agents/openai.yaml` sidecars are parsed-or-ignored
  (UI metadata + `policy.allow_implicit_invocation`); a missing/invalid sidecar never
  blocks the skill.
- [ ] **AC-US2-04**: Discovery roots are configurable/overridable via
  `ANYMODEL_SKILL_ROOTS` (env/config), so best-effort Gemini/Antigravity paths can be
  corrected without a code change.
- [ ] **AC-US2-05**: Duplicate skills (same `name` from multiple roots) resolve by a
  defined precedence (project > user > managed; first-root-wins within scope) and the
  shadowed copies are logged, not silently dropped.
- [ ] **AC-US2-06**: Works under both the bundled-client path (patchable) and pure-proxy
  mode (roots injected via `--add-dir`/settings, since stock `cli.js` can't be patched).

## Out of scope
- Translating non-SKILL.md artifacts (Antigravity `.agent/workflows/*.md` step lists).
- Re-branding under pure-proxy mode (stock client is unmodified by design — ADR-0002).
