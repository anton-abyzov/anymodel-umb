# Plan: Adaptive Branding + Universal Skill Loader

Full architecture in **ADR [0003](../../docs/internal/architecture/adr/0003-adaptive-branding-and-universal-skill-loader.md)**. Summary below.

## Part A — Branding (implemented)

```
scripts/brand-patches.json   ← declarative manifest {id,category,adaptive,from,to,expect}
scripts/brand-patch.mjs      ← applier: assert expect → replace → node --check → idempotent; --check = CI gate
test/brand-patch.test.mjs    ← manifest-driven; live-bundle drift gate
cli.js                       ← the 13MB bundle patched in place (61 strings)
```

Adaptive strings inject `process.env.ANYMODEL_MODEL` (already provided by `cli.mjs`
when it spawns the client). Re-applying after an upstream bundle bump = restore
pristine → regenerate `expect` counts → `node scripts/brand-patch.mjs`. Drift fails loudly.

## Part B — Universal skill loader (designed, next)

**The format is already universal** (`SKILL.md` per agentskills.io — shared by Claude,
OpenAI/Codex, Gemini/Antigravity). Work = multi-root discovery via a **launch-time
bridge in `cli.mjs`**, not adapters and not touching the bundled loader:

1. At startup scan cwd + user scope for foreign roots (`.agents/skills/`,
   `.codex/skills/`, `.gemini/skills/`, `.agent/skills/`).
2. Symlink each `…/skills/<name>/SKILL.md` into a per-session temp shadow
   `T/.claude/skills/<name>`; pass `--add-dir T`. Claude Code already scans the
   `.claude/skills` of every `--add-dir` dir, so its existing SKILL.md reader +
   progressive disclosure + registry handle everything (the `{frontmatter,
   markdownContent, skillName}` triple) — zero format-translation code.
3. Codex `agents/openai.yaml` sidecar: copy alongside, parse-or-ignore.
4. `ANYMODEL_SKILL_ROOTS` config for override (Gemini/Antigravity paths best-effort).
5. Duplicate `name` precedence: project `.claude/skills` > foreign roots; log shadowed.
6. Works for bundled client AND pure-proxy stock `claude` (`--add-dir` is public) —
   no bundle patch. NB: `providers/skill-catalog.mjs` (incr 0010) only *re-injects* an
   already-harvested catalog for local models; it is not the discovery seam.

## Verification

- Part A: `node --test test/*.test.mjs` (430), `node scripts/brand-patch.mjs --check`,
  `node --check cli.js`, boot smoke (`--version`).
- Part B: per-task BDD in [tasks.md](tasks.md); E2E = author a `.agents/skills/<x>/SKILL.md`
  and confirm it triggers.
