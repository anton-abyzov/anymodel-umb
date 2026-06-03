# 0003: Adaptive Branding Patch Layer + Universal Skill Loader

**Date**: 2026-06-02
**Status**: Accepted (Part A implemented, Part B designed)
**Increment**: 0012-adaptive-branding-and-universal-skills (Part A); 0014-universal-skill-loader (Part B impl)
**Target**: `repositories/antonoly/anymodel`

## Context

anymodel ships a 13MB **minified** `cli.js` — a re-branded Claude Code TUI that the
package does **not** build (it patches a prebuilt upstream blob). Two problems
surfaced:

1. **Vendor branding leaks to users.** The first-run banner promotes *"Opus now
   defaults to 1M context · 5x more room, same pricing"* and plan mode says
   *"Claude is now exploring…"* — even though anymodel defaults to `qwen/qwen3-coder`
   and routes to any model. Branding had been applied by **hand-editing the minified
   blob**; ~10 such edits had landed, yet an audit found **50+ user-visible vendor
   strings still leaking** (welcome/login/billing/help/version/CLI/status chrome).
   Hand-patching does not converge, has no anti-regression check, and is wiped on
   every upstream bundle refresh.

2. **Skills load from one ecosystem only.** Skill discovery is inherited verbatim
   from the bundled Claude Code loader (`loadSkillsDir.ts`), which scans only
   `.claude/skills/<name>/SKILL.md`. The project goal is to "support all skills by
   default" — Claude Code, OpenAI/Codex, Gemini/Antigravity, etc.

Strategic note: ADR-0002 (pure-proxy mode) aims to eventually run **stock** `claude`
via `ANTHROPIC_BASE_URL` instead of the bundled fork. Branding only applies to the
**bundled-client path**, which remains the primary shipping path in v1.14.1. Under
pure-proxy mode the client is unmodified and is not (and need not be) re-branded.

## Decision

### PART A — Reproducible, model-adaptive branding patch layer (IMPLEMENTED)

Replace hand-editing with a **declarative manifest + idempotent applier**:

- **`scripts/brand-patches.json`** — versioned data manifest. Each entry:
  `{ id, category, adaptive, from, to, expect }`. `from` is the exact substring in
  the minified bundle; `expect` is its occurrence count in a pristine bundle.
- **`scripts/brand-patch.mjs`** — applier that (1) asserts each `from` occurs exactly
  `expect` times before touching anything (drift ⇒ fail loudly, never corrupt),
  (2) replaces, (3) re-parses with `node --check` (never ship an unparseable bundle),
  (4) is **idempotent** (re-run is a no-op once `from` gone + `to` present),
  (5) `--check` mode is a **CI anti-regression gate** that fails if any known vendor
  string reappears.
- **Model-adaptive entries** (`adaptive: true`) replace a static string *literal*
  with a JS *expression* reading `process.env.ANYMODEL_MODEL` (already injected by
  `cli.mjs` into the spawned client). So plan-mode/status/tip lines reflect the
  **actually-loaded model** (qwen), not a hardcoded Anthropic constant.
- **Test**: `test/brand-patch.test.mjs` is manifest-driven (coverage grows with the
  manifest) and includes a live-bundle drift gate.

**Surgical boundary — what is NEVER patched** (would break routing/behavior):
model IDs (`claude-opus-*`, `claude-sonnet-*`), API hostnames (`api.anthropic.com`),
config/package name (`claude-code`), `.claude/` paths, the model system-prompt /
identity text ("You are an agent for Claude Code…"), LLM prompt templates
(`Analyze this … session`), CLAUDE.md guidance, MCP `client_name`, `ISSUES_EXPLAINER`
URLs. Also intentionally **not** re-branded: `Claude Desktop` (real external app),
and Claude-only features anymodel doesn't replicate (web sessions, Claude-API-key
login) — rebranding those would imply features that don't exist.

Coverage at acceptance: **61 user-visible strings** (10 adaptive, 51 static) across
welcome-onboarding, login-auth, plan-mode, status-spinner, announcement-tip,
cost-billing, help-text, slash-command, error-message, version, and CLI-commander
layers.

### PART B — Universal skill loader (DESIGNED)

**Key finding (verified, zero hallucination risk across 5 research agents):**
every shipped "skill format" — Anthropic, OpenAI/Codex, Google Gemini/Antigravity,
Cursor, Copilot, Goose — is the **same `SKILL.md` open standard**
(`agentskills.io/specification`: a directory whose name matches `name`, a required
`SKILL.md` with YAML frontmatter `name`+`description` + Markdown body, optional
`scripts/`/`references/`/`assets/`). **There is no competing OpenAI or Google skill
schema.** The only real divergences:

- **Discovery paths differ**: `.claude/skills/`, `.agents/skills/` (cross-tool
  interop convention), `.codex/skills/`, `.gemini/skills/`, `.agent/skills/`
  (Antigravity, singular), plus user-scope `~/.gemini/skills/` etc.
- **Optional vendor sidecars**: Codex's `agents/openai.yaml` (UI metadata +
  `policy.allow_implicit_invocation` + `dependencies.tools`). Parse-or-ignore.
- **Antigravity Workflows** (`.agent/workflows/*.md`) are a *different artifact
  class* (slash-command step lists), not skills.

**Architectural consequence:** the universal loader is **~95% a discovery/path
problem, ~5% sidecar metadata, 0% format translation.** anymodel already inherits a
conforming `SKILL.md` reader. The work is: **make the existing reader scan non-Claude
roots and tolerate non-Claude sidecars.**

Design:
- **Normalized internal `NormalizedSkill`** = the `{frontmatter, markdownContent,
  skillName}` triple the existing loader already produces — every adapter emits it.
- **Adapters** (only what is REAL):
  - `ClaudeSkillAdapter` — native `.claude/skills/`. No-op (already works).
  - `AgentsDirAdapter` — scan `.agents/skills/` (+ user scope). One adapter delivers
    OpenAI/Codex/Gemini-CLI/Cursor/Copilot/Goose interop because they all write the
    **same `SKILL.md`** there.
  - `CodexSidecarAdapter` — reuse the `SKILL.md` read; additionally parse-or-ignore
    `agents/openai.yaml`.
  - `GeminiPathAdapter` — same reader, extra roots `.gemini/skills/`, `.agent/skills/`,
    `~/.gemini/skills/` (paths treated as configurable — research flagged low
    confidence on the exact Antigravity dir).
  - `McpPromptAdapter` (optional bridge) — expose MCP server "prompts" as skills.
- **Insertion seam — launch-time skill bridge in `cli.mjs`, NOT the bundled loader.**
  Skill *discovery* lives in `loadSkillsDir.ts` inside the **minified** `cli.js`, which
  anymodel ships but does not edit (and which must keep working under pure-proxy mode
  with a stock client). So the universal loader is implemented in the **launcher**:
  1. At startup, scan cwd (and user scope) for foreign roots — `.agents/skills/`,
     `.codex/skills/`, `.gemini/skills/`, `.agent/skills/`.
  2. For each discovered `…/skills/<name>/SKILL.md`, **symlink** it into a per-session
     temp shadow `T/.claude/skills/<name>` (Codex `agents/openai.yaml` sidecars copied
     alongside; project `.claude/skills` wins on name collision and the shadow is
     skipped for that name, then logged).
  3. Pass `--add-dir T` to the client. Claude Code already scans the `.claude/skills`
     of every `--add-dir` directory (`loadSkillsDir.ts:649,699-708`), so the existing
     SKILL.md reader, progressive disclosure, and registry handle everything unchanged
     — zero format-translation code.
  4. Clean up `T` on exit.
  This works identically for the bundled client and stock `claude` (pure-proxy mode),
  since `--add-dir` is a public flag. The earlier "extend `getSkillDirCommands`" idea
  is rejected: it would require patching the minified bundle and would not survive
  pure-proxy mode.
- **Config**: `ANYMODEL_SKILL_ROOTS` env / config to add or override roots (covers the
  best-effort Gemini/Antigravity paths without a code change).

## Consequences

- **Positive**: branding is reproducible, verifiable, anti-regressing, and re-appliable
  on upstream bumps; users see the model they actually loaded; "support all skills"
  collapses from "N format adapters" to "extra discovery roots."
- **Negative / risks**: the brand manifest's `from` anchors are upstream-version
  specific — a bundle refresh requires regenerating `expect` counts (the applier
  fails loudly when they drift, which is the intended signal). Gemini/Antigravity
  exact paths are best-effort (low research confidence) and must be configurable.
- **Follow-up**: align with ADR-0002 — if pure-proxy mode becomes primary, Part A
  becomes a legacy/bundled-only concern and Part B must deliver roots via settings.
