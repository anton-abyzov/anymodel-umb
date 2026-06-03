# Spec: Universal multi-ecosystem SKILL.md loader

**Increment**: 0013 | **ADR**: [0003](../../docs/internal/architecture/adr/0003-adaptive-branding-and-universal-skill-loader.md) | **Parent**: 0012

## Problem

AnyModel routes any model through a re-branded Claude Code client, which only discovers
skills under `.claude/skills/<name>/SKILL.md`. Verified research (incr 0012) found that
**`SKILL.md` is a single shared open standard** — OpenAI/Codex, Google Gemini/Antigravity,
Cursor, Copilot, and Goose all use the identical format; only the **discovery path** differs.
So a user with `.agents/skills/`, `.codex/skills/`, or `.gemini/skills/` skills gets nothing
in AnyModel today. The fix is multi-root discovery, not format translation.

## Approach

A **launch-time skill bridge** in `cli.mjs` (the bundled/stock client's loader is not
modified): scan foreign roots, symlink each discovered `…/skills/<name>/SKILL.md` into a
per-session temp `T/.claude/skills/<name>` shadow, and pass `--add-dir T`. The client
already scans the `.claude/skills` of every `--add-dir` directory, so its native SKILL.md
reader + progressive disclosure + registry handle everything. Works for the bundled client
AND pure-proxy stock `claude`.

## US-001 — Discover and bridge foreign-ecosystem skills

As an AnyModel user with skills authored for OpenAI/Codex or Gemini, those skills load and
auto-trigger in my session without any conversion.

**Acceptance Criteria**
- [x] **AC-US1-01**: `.agents/skills/`, `.codex/skills/`, `.gemini/skills/`, `.agent/skills/`
  (project cwd + `$HOME`) are scanned for `<name>/SKILL.md` directories.
- [x] **AC-US1-02**: Each discovered skill is symlinked into a per-session temp
  `T/.claude/skills/<name>` and `--add-dir T` is passed to the client; nothing is copied or
  translated.
- [x] **AC-US1-03**: A project-local `.claude/skills/<name>` takes precedence — a foreign
  skill with the same `name` is **shadowed and logged**, never silently overriding.
- [x] **AC-US1-04**: Among foreign roots, the first root in precedence order wins on a `name`
  collision; the loser is logged.
- [x] **AC-US1-05**: `ANYMODEL_SKILL_ROOTS` (colon-separated) adds/overrides roots, so the
  best-effort Gemini/Antigravity paths are correctable without a code change.
- [x] **AC-US1-06**: Codex `agents/openai.yaml` sidecars are detected and carried through the
  symlink (the skill dir is linked whole); a missing/invalid sidecar never blocks the skill.
- [x] **AC-US1-07**: Discovery is best-effort and non-fatal — any fs error (missing root,
  unreadable dir, unlinkable target) is swallowed and never blocks client launch.
- [x] **AC-US1-08**: The temp bridge dir is removed on client exit and on SIGINT.
- [x] **AC-US1-09**: Bridging runs for BOTH launch paths (`connectToProxy` and `launchClaude`)
  and for all providers (cloud + local).

## Out of scope
- Translating non-SKILL.md artifacts (Antigravity `.agent/workflows/*.md`).
- Parsing/acting on `openai.yaml` fields beyond carrying the file through (future).
- Modifying the bundled client's `loadSkillsDir.ts`.

## Known limitations (from review — see reports/code-review-report.json)
- **gitignore**: the bridge does not replicate the client's git-check-ignore skip for
  foreign skills. Acceptable — foreign roots are user-curated skill dirs, not dep trees.
- **realpath dedup**: planning de-dups by `name`; the client additionally de-dups by
  realpath, so two roots symlinking the same physical skill collapse harmlessly.
- **enterprise policy**: a `strictPluginOnlyCustomization` / restricted-setting-sources
  policy can suppress `--add-dir` skills; AnyModel cannot override it.
- **$HOME scope**: home-scope foreign skills load by default (mirrors Claude Code's own
  `~/.claude/skills` user scope); `ANYMODEL_SKILL_ROOTS` overrides, and contributing
  skills are listed in the launch log.
- **Windows**: uses directory junctions (no privilege needed); any residual link failure
  is reported via the "could not be linked" log, never silently dropped.
