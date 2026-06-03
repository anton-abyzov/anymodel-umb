All key claims verified against source: the loader seam, env injection, brand-patch manifest, and skill-catalog harvest all match the grounding report. I have enough to write the design.

The grounding report, brand audit (43 strings), and 5 verified skill-standard research blocks give me everything needed. Let me produce the implementation-ready design.

---

# anymodel: Reproducible Branding + Universal Skill Loader — Design

This is the ADR + increment-spec source. All file paths absolute. Code seams verified against `cli.mjs`, `scripts/brand-patch.mjs`, `providers/skill-catalog.mjs`, and `claude-code/skills/loadSkillsDir.ts`.

---

## PART A — REPRODUCIBLE BRANDING SYSTEM

### A.1 Why hand-patching the 13MB minified bundle is unmaintainable

`cli.js` is a 13,047,069-byte minified blob (verified) that anymodel ships verbatim — anymodel does not build it, it re-brands a prebuilt Claude Code TUI. Hand-editing this blob fails on three axes, all confirmed in-tree:

1. **Total loss on upstream bump.** Every `cli.js` refresh re-minifies from new source. Identifier names, string concatenation boundaries, and React `createElement` call shapes all change. Hand edits are silently overwritten; there is no merge. The `cli.js.prebrand-backup` (13,046,932 bytes) sitting next to `cli.js` is itself evidence of the reapply-and-pray cycle.
2. **Incomplete coverage — proven.** `scripts/brand-patch.mjs:9-12` documents that the "Opus now defaults to 1M context" promo and the "Claude is now exploring…" plan-mode line *both survived ~10 hand patches and shipped to users running qwen*. The current manifest covers only **2** strings. The brand audit supplied with this task found **43** user-visible vendor strings still leaking (welcome banners, login/auth flow, billing copy, `/help` command descriptions, OS notifications, error messages). Whack-a-mole does not converge.
3. **No verifiability for omission.** The current applier (`brand-patch.mjs:91-134`) asserts occurrence counts for the *2 patches it knows about*, but nothing tells you a *new* Anthropic string appeared. A bundle can be "fully patched" per the manifest and still say "Welcome to Claude Code".

The current `brand-patch.mjs` is the **right skeleton** (declarative manifest, count-assert, `node --check`, idempotent) but has the wrong **coverage** and no **anti-regression sweep**. Part A extends it, it does not replace it.

### A.2 Declarative brand-patch layer (extends the existing manifest)

Keep the exact entry shape already in `BRAND_PATCHES` (`{id, category, adaptive, from, to, expect}`) and the applier semantics (assert `expect`, idempotent no-op when `from` gone + `to` present, refuse on drift, `node --check` after write). Three changes:

**(1) Externalize the manifest to a versioned data file** so patches are reviewable as data, not code, and carry the upstream version they were authored against:

`/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/scripts/brand-patches.json`
```json
{
  "upstreamVersion": "1.x.y",
  "patches": [
    { "id": "welcome-banner-color", "category": "welcome-onboarding", "adaptive": false,
      "from": "\"claude\"},\"Welcome to Claude Code\",\" \"",
      "to":   "\"claude\"},\"Welcome to anymodel\",\" \"",
      "expect": 2, "replaceAll": true },
    { "id": "plan-mode-exploring", "category": "plan-mode", "adaptive": true,
      "from": "\"Claude is now exploring and designing an implementation approach.\"",
      "to":   "((process.env.ANYMODEL_MODEL||\"anymodel\")+\" is now exploring and designing an implementation approach.\")",
      "expect": 1 }
  ]
}
```

Load all 43 audited strings here. The audit already supplies `oldString`, `proposedReplacement`, `uniqueOccurrences` (→ `expect`), `adaptive`, and `category` for each — they map 1:1 onto this schema. Entries flagged in the audit as "DELIBERATELY UNCHANGED" (e.g. `availability:["claude-ai"]` gate key, "Continue the current session in Claude Desktop") are **omitted** from the manifest and recorded in a sibling `brand-patches.excluded.json` with the rationale, so the decision is auditable and the CI sweep (below) can whitelist them.

**(2) Add `replaceAll` support.** Several audited strings occur 2× (the `color:"claude"` welcome banner, the logout confirmation, `/plugin` description). The current applier's `src.split(from).join(to)` already replaces all — but `expect` must then be the real count and the idempotency check at `:100` must compare against `expect`, not `0`. Patch the applier so `replaceAll:true` entries assert `fromCount === expect` and on re-run treat `fromCount === 0 && toCount === expect` as the idempotent state.

**(3) Categorize for partial application + reporting.** `category` already exists; emit a per-category applied/drifted summary so a reviewer sees "all 7 login-auth strings applied, 1 billing string drifted" at a glance.

The applier stays in `scripts/brand-patch.mjs`; only the data moves out. CLI surface is unchanged: `node scripts/brand-patch.mjs` (apply), `--check` (CI gate).

### A.3 How model-adaptive strings work at runtime

The runtime contract already exists and is verified:

- **Launcher injects the model name.** `cli.mjs:473` sets `ANYMODEL_MODEL` in the spawned TUI's env to the real backend model id (e.g. `qwen3-coder`), inside the `connectToProxy` spawn (`cli.mjs:463-475`).
- **Adaptive patches read it at render time.** A patch with `adaptive:true` replaces a string *literal* with a JS *expression* in the same argument slot, e.g. the audited plan-mode line becomes `` `${process.env.ANYMODEL_MODEL||"anymodel"} is now exploring…` ``. The TUI evaluates `process.env.ANYMODEL_MODEL` each render, so the UI shows the actually-loaded model. Falls back to the literal `"anymodel"` when the env var is unset.

**Close the documented degradation gap.** The grounding report flags that `launchClaude()` (`cli.mjs:367`) spawns with plain `process.env` and never sets `ANYMODEL_MODEL`, so adaptive strings silently fall back to "anymodel" on that path. Fix: hoist the env-decoration into a shared helper used by **both** spawn sites:

```js
// cli.mjs — single source of truth for the TUI's branded env
function brandedEnv({ port, modelName } = {}) {
  return {
    ...process.env,
    ...(port ? { ANTHROPIC_BASE_URL: `http://localhost:${port}`,
                 ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'anymodel-proxy' } : {}),
    ...(modelName && !process.env.ANTHROPIC_MODEL ? { ANTHROPIC_MODEL: modelName } : {}),
    ANYMODEL_MODEL: modelName || process.env.ANYMODEL_MODEL || 'anymodel',
  };
}
```

Always defining `ANYMODEL_MODEL` (defaulting to `'anymodel'`) means adaptive strings are correct even when no model is resolved, on every launch path — removing the implicit two-system contract.

### A.4 Test strategy — fail CI when an upstream bundle reintroduces vendor branding

Three layers, all runnable in CI before publish. New test file: `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/test/brand-patch.test.mjs` (Vitest, matching the project's `npx vitest run` stack).

**Layer 1 — Manifest integrity (unit, no bundle).** For each patch: assert `from !== to`; assert adaptive `to` parses as a JS expression (wrap in `(0, ...)` and `new Function`); assert `expect >= 1`; assert no two patches share a `from` that is a substring of another (ordering hazard).

**Layer 2 — Applier correctness + idempotency (integration, synthetic bundle).** Build a tiny fixture string containing each `from`, run `applyBrandPatches`, assert every `from` is gone and every `to` present, assert running it twice is a no-op (the idempotent path), and assert a deliberately drifted fixture returns a non-empty `drift[]` and exits non-zero.

**Layer 3 — Anti-regression vendor sweep on the REAL post-patch bundle (the CI gate that catches new upstream branding).** This is the layer that did not exist and is the whole point:

```js
// After `node scripts/brand-patch.mjs` runs in CI, scan the branded cli.js.
const FORBIDDEN = [
  /Welcome to Claude Code/, /Log in to Claude/, /Anthropic account/,
  /Claude is (now |waiting|using|done)/, /Opus|Sonnet|Haiku/,
  /Claude Code/, /Claude can make mistakes/,
];
const ALLOWLIST = require('./brand-patches.excluded.json'); // intentional residue
```

For each forbidden pattern, grep the branded `cli.js`; subtract occurrences accounted for by `ALLOWLIST` (internal theme keys like `color:"claude"`, the `availability:["claude-ai"]` gate, the deliberate "Claude Desktop" hand-off). **Any unaccounted match fails CI.** When upstream bumps and introduces a new "Welcome to Claude Code" in a new code path, the sweep catches it even though no manifest entry drifted — the exact failure mode that shipped to qwen users.

CI wiring (`.github/`): on bundle change or release, run `node scripts/brand-patch.mjs` then `npx vitest run test/brand-patch.test.mjs`. The `--check` mode stays the fast pre-commit gate (verifies known patches applied); the vendor sweep is the comprehensive release gate (verifies nothing *unknown* leaked).

**Maintenance loop for upstream bumps:** (a) drop new `cli.js`, (b) run apply → drifted patches list exactly which `from` strings upstream rewrote, (c) run sweep → lists any new vendor strings, (d) update manifest `from` values + `upstreamVersion`, repeat until both green. Bounded, mechanical, no guessing.

---

## PART B — UNIVERSAL SKILL LOADER

### B.0 The single most important finding from the verified research

**Every shipped "skill format" across Anthropic, OpenAI, Google, Cursor, Copilot, Gemini CLI, Codex, Goose, etc. is the SAME format: `SKILL.md`** (a directory with YAML frontmatter `name`+`description` + Markdown body + optional `scripts/`/`references/`/`assets/`). This is confirmed verbatim against `agentskills.io/specification` in all five research blocks with **zero hallucination risk**. There is **no** competing OpenAI skill schema, **no** competing Google skill schema. The only real divergences are:

- **Discovery paths differ:** `.claude/skills/`, `.agents/skills/` (cross-tool interop convention), `.codex/skills/`, `.gemini/skills/`, `.agent/skills/` (Antigravity, singular — the one path the Google research got wrong and the verification corrected).
- **Optional vendor sidecars:** Codex's `agents/openai.yaml` (UI metadata + `policy.allow_implicit_invocation` + `dependencies.tools`). Parse-or-ignore.
- **Antigravity Workflows:** `.agent/workflows/*.md` (YAML frontmatter + steps, `/name` slash command, `// turbo` auto-run) — a *different* artifact class, not a skill.

**Architectural consequence:** the "universal loader" is **95% a discovery/path problem, 5% a sidecar-metadata problem, and 0% a format-translation problem.** anymodel already inherits a conforming `SKILL.md` reader inside `cli.js`. So the universal-loader work is **not** "write N adapters for N formats" — it is "make the existing reader see skills that live under non-Claude paths and carry non-Claude sidecars." This drastically shrinks the increment.

### B.1 Normalized internal Skill model

```ts
interface NormalizedSkill {
  name: string;            // 1-64, lowercase a-z/0-9/hyphen, no lead/trail/double hyphen
  description: string;     // 1-1024, "what + when", trigger keywords
  trigger: {
    auto: boolean;         // model-driven activation via description match (default true)
    explicit: string;      // "/skill-name" invocation token
    allowImplicit?: boolean; // from openai.yaml policy.allow_implicit_invocation
  };
  body: string;            // Markdown instructions (the SKILL.md body, frontmatter stripped)
  tools: {
    allowed?: string[];    // allowed-tools (EXPERIMENTAL in spec) ∪ openai.yaml dependencies.tools
  };
  resources: {
    scripts?: string[];    // relative paths under scripts/ — loaded on demand, never eager
    references?: string[]; // references/ — on demand
    assets?: string[];     // assets/ — on demand
  };
  provenance: {
    adapter: 'claude' | 'agents-dir' | 'codex' | 'gemini' | 'mcp-prompt';
    sourcePath: string;    // absolute path to SKILL.md (or MCP server id)
    scope: 'managed' | 'user' | 'project';
    sidecar?: Record<string, unknown>; // raw openai.yaml etc., preserved losslessly
  };
  metadata?: Record<string, string>; // spec metadata map (author, version under metadata.version)
}
```

This maps cleanly onto the `Command` shape the existing loader produces (`parseSkillFrontmatterFields` → `description`, `whenToUse`, `displayName`, `allowed-tools`, `paths`, etc., per `loadSkillsDir.ts:185-265`). `body` → `markdownContent`; `tools.allowed` → `allowed-tools`; `trigger.explicit` → `user-invocable`. The normalized model is the **`{frontmatter, markdownContent, skillName}` triple** the grounding report identified as the real architectural seam — every adapter must emit exactly that triple.

### B.2 Adapters — only what is REAL/shipped per verified research

| Adapter | Real format? | What it does | Status |
|---|---|---|---|
| **ClaudeSkillAdapter** | Yes — native `SKILL.md` | No-op identity. Already handled by `loadSkillsDir.ts`. | Native |
| **AgentsDirAdapter** | Yes — same `SKILL.md`, different path (`.agents/skills/`, `~/.agents/skills/`) | Scan the cross-tool interop dir; emit identical triple. This single adapter delivers OpenAI Codex, Gemini CLI, Cursor, Copilot, Goose interop, because they **all write the same `SKILL.md` here**. | New, trivial |
| **CodexSidecarAdapter** | Partially — `SKILL.md` + optional `agents/openai.yaml` | Reuse the `SKILL.md` read; additionally parse-or-ignore `agents/openai.yaml`, mapping `policy.allow_implicit_invocation`→`trigger.allowImplicit`, `dependencies.tools`→`tools.allowed`, `interface.*`→`metadata`. Skill still loads if sidecar absent/unparseable. | New, thin |
| **GeminiPathAdapter** | Yes — same `SKILL.md` | Scan `~/.gemini/skills/`, `.gemini/skills/`. Pure path addition; no new parsing. Antigravity native skills at `.agent/skills/` (singular) + `~/.gemini/antigravity/skills/` (global) — per the verification correction, **not** `.agents/skills`. | New, trivial |
| **GemsAdapter** | **NO shipped file format** | Gemini "Gems" are app-UI config objects with no documented export/import format (confirmed). **Do not invent one.** | **Stub** |
| **AntigravityWorkflowAdapter** | Real but **not a skill** (`.agent/workflows/*.md`) | Different artifact class (executable step lists, `/name` slash commands). **Out of scope** for the skill loader; note as forward-compat. | **Stub / separate** |
| **A2A AgentSkill** | Real but **not a skill bundle** | A2A `AgentSkill` (id/name/description/tags) is a remote-agent capability advertisement, maps to the *tool/MCP plane*, not the skill plane. **Out of scope.** | **Stub / separate** |

**Forward-compatible stub design:** `GemsAdapter`, `AntigravityWorkflowAdapter`, and `A2AAdapter` ship as registered-but-disabled adapters that return `[]` and carry a one-line comment citing the verified research reason. This documents *why* they're empty (so a future maintainer doesn't "re-discover" the gap) and gives a registration slot if those ecosystems later ship a real, conforming file format.

**Do not build:** function-calling JSON schemas, MCP tool descriptors, OpenAPI GPT Actions, A2A AgentCards — the research is explicit these are the **execution/tool layer**, orthogonal to skills. anymodel already has an MCP client; skills *reference* tools via `allowed-tools`, they don't define them.

### B.3 Discovery layer — "all skills by default"

A new pre-launch materializer module, `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/providers/skill-loader.mjs`, runs in `cli.mjs` **before** spawning the TUI. Because anymodel cannot edit `loadSkillsDir.ts` inside the sealed `cli.js` bundle (confirmed — anymodel only spawns the prebuilt blob), the only durable seams anymodel controls are (a) bundle patching, (b) **materializing skills onto disk where the inherited loader already looks**, (c) proxy-level system-prompt re-injection. The loader uses **(b)** as primary and **(c)** as the local-model reinforcement.

**Algorithm:**
1. **Scan roots** (project + user scope), each via its adapter:
   - `~/.claude/skills`, `.claude/skills` (+ ancestors to repo root) — native, no-op.
   - `~/.agents/skills`, `.agents/skills` — `AgentsDirAdapter` (the interop win).
   - `~/.gemini/skills`, `.gemini/skills`, `~/.gemini/antigravity/skills`, `.agent/skills` — `GeminiPathAdapter`.
   - `.codex/skills` and any dir containing `agents/openai.yaml` — `CodexSidecarAdapter`.
   - Configurable extra roots via `ANYMODEL_SKILL_ROOTS` (colon-separated) + a `skills.roots` key in anymodel config.
   - Scan rules per spec: skip `.git`/`node_modules`, optional `.gitignore` respect, bounded depth (~4-6), dir count cap (~2000).
2. **Normalize** each found skill to `NormalizedSkill` via its adapter, using **lenient parsing** exactly as the research prescribes: split on `---`; warn-but-load on name/dir mismatch or over-length; **skip only** on missing/empty `description` or unparseable YAML; include the **quote-and-retry fallback** for cross-client unquoted-colon descriptions (`description: Use when: ...`).
3. **Resolve collisions** with the universal convention: **project overrides user overrides managed**; `.agents/skills` (interop) takes precedence over vendor-specific within the same scope; log a warning on shadowing. **Trust-gate** project-scope skills from untrusted repos (prompt-injection surface).
4. **Materialize → feed the inherited registry.** For any skill **not** already in Claude-native `SKILL.md` form at a path the bundle scans, write a normalized `SKILL.md` into a managed staging dir the bundle already reads — e.g. `<claudeConfigHome>/skills/<name>/SKILL.md` — with frontmatter (`name`, `description`, `allowed-tools`, plus `metadata` carrying provenance) + the original body, and copy `scripts/`/`references/`/`assets/` alongside. This is the **(b)** seam: the existing `loadSkillsFromSkillsDir` then discovers them with zero bundle changes. The materializer is idempotent (content-hash guard) and namespaces foreign skills (e.g. `codex:my-skill`) to avoid colliding with native ones.

This is what makes anymodel "support all skills by default": a Codex/Gemini/Cursor user's existing `.agents/skills` tree becomes visible to the anymodel-launched TUI with no per-skill action.

### B.4 MCP-prompts and AGENTS.md as portability bridges

- **MCP prompts → pseudo-skills (optional, lossy).** Per research, an MCP `prompt` (name/description/arguments, via `prompts/list`/`prompts/get`) is the closest protocol analog to a skill. anymodel already speaks MCP. A `McpPromptAdapter` can surface each MCP prompt as a `NormalizedSkill` (`provenance.adapter='mcp-prompt'`, `body`=templated message content). **Flagged lossy:** MCP prompts return only message content — no `scripts/`, no on-demand `references/`. Ship behind a `skills.includeMcpPrompts` flag, default off. No official Skill↔MCP-prompt bridge exists, so this is a custom convenience, not a standard.
- **AGENTS.md → project-instructions, NOT a skill.** Every research block is emphatic: `AGENTS.md` (and `CLAUDE.md`/`GEMINI.md`) is a project-context instruction file, a different artifact class. The skill loader **must not** ingest it as a skill. Handle it (if at all) as a **separate** project-instructions ingester that prepends to the system prefix — architecturally distinct from `skill-loader.mjs`. Keep it out of B.3 entirely.

### B.5 The exact insertion seam

Two seams, depending on whether anymodel can touch the bundle:

**Primary (anymodel-controlled, no bundle edit) — pre-launch materializer in `cli.mjs`.** Call `skill-loader.mjs` inside `connectToProxy` (`cli.mjs:394-475`), **before** the `spawn(client.cmd, ...)` at `:463`, and after model resolution so provenance can be logged. It writes normalized `SKILL.md`s into the staging dir; the spawned bundle then loads them through its own untouched `loadSkillsFromSkillsDir`. This requires **zero** changes to `loadSkillsDir.ts`.

**Secondary (local-model reinforcement) — the existing harvest path.** For local providers that strip the catalog `<system-reminder>`, extend `providers/skill-catalog.mjs`: `harvestSkillCatalog` (`skill-catalog.mjs:52`) currently re-derives the index from the bundle's own injected block. Add the materialized foreign skills into `buildFidelityAddition` (`skill-catalog.mjs:148`) so local models also see the now-expanded catalog. This is the proxy-level **(c)** seam the grounding report identified.

**If the bundle were ever forkable**, the canonical seam is the one the grounding report names: relax the dir-only gate (`loadSkillsDir.ts:425`) and the hardcoded `SKILL.md` filename (`:431`) into a format-probe, then hand the normalized `{frontmatter, markdownContent, skillName}` triple to the already-shared `parseSkillFrontmatterFields` (`:185`) + `createSkillCommand` (`:270`). Documented as the future-state seam; **not** the path for the sealed bundle.

---

## PART C — PHASED PLAN

### Increment 1 — Brand audit fix (quick win) `[branding]`
Apply all 43 audited strings via the existing applier. Mechanical; no new infrastructure.
- **AC-1.1:** All 43 audited `oldString`→`proposedReplacement` entries are in `brand-patches.json`; intentionally-unchanged entries are in `brand-patches.excluded.json` with rationale.
- **AC-1.2:** `node scripts/brand-patch.mjs` applies all entries; `node --check cli.js` passes.
- **AC-1.3:** Adaptive strings render the resolved model name when `ANYMODEL_MODEL` is set, `"anymodel"` when unset.
- **AC-1.4:** A fresh launch shows "Welcome to anymodel", "Log in to anymodel", no "Opus/Sonnet/Haiku" in user-visible chrome.

### Increment 2 — Reproducible patch system + anti-regression CI `[branding-infra]`
Harden the applier and add the vendor sweep.
- **AC-2.1:** Manifest externalized to `brand-patches.json` with `upstreamVersion`; applier supports `replaceAll` with correct `expect`/idempotency semantics.
- **AC-2.2:** `cli.mjs` `brandedEnv()` helper used by **both** `connectToProxy` and `launchClaude`; `ANYMODEL_MODEL` always defined (defaults `"anymodel"`).
- **AC-2.3:** `test/brand-patch.test.mjs` covers Layer 1 (manifest integrity), Layer 2 (apply + idempotency + drift→non-zero), Layer 3 (vendor sweep on real branded bundle minus allowlist).
- **AC-2.4:** CI runs apply → sweep on bundle change/release; an injected "Welcome to Claude Code" in a new code path fails CI.
- **AC-2.5:** `--check` mode stays green as the fast pre-commit gate.

### Increment 3 — Universal skill loader (discovery + materializer) `[skills]`
The core feature. Depends on nothing in 1-2.
- **AC-3.1:** `providers/skill-loader.mjs` scans `.claude/skills`, `.agents/skills` (+ user scope), `.gemini/skills`, `.codex/skills`, `.agent/skills`, and `ANYMODEL_SKILL_ROOTS`, with bounded depth/count and `.git`/`node_modules` skip.
- **AC-3.2:** `AgentsDirAdapter`, `CodexSidecarAdapter` (`agents/openai.yaml` parse-or-ignore), `GeminiPathAdapter` normalize every found skill to `NormalizedSkill`; lenient parsing (quote-and-retry, warn-but-load, skip only on missing description/unparseable YAML).
- **AC-3.3:** Collision precedence project>user>managed with shadowing warnings; project-scope trust gate.
- **AC-3.4:** Materializer writes idempotent, namespaced `SKILL.md`s (+ resource dirs) into the bundle's scan dir; the anymodel-launched TUI lists a Codex/Gemini-authored skill with no per-skill action.
- **AC-3.5:** `skill-catalog.mjs` `buildFidelityAddition` includes materialized foreign skills for local providers.
- **AC-3.6:** `GemsAdapter`/`AntigravityWorkflowAdapter`/`A2AAdapter` ship as no-op stubs with cited rationale.
- **AC-3.7:** Insertion is in `cli.mjs:connectToProxy` before the spawn at `:463`; `loadSkillsDir.ts` unchanged.

### Increment 4 (optional/forward-compat) — MCP-prompt bridge + AGENTS.md ingester `[skills-bridges]`
- **AC-4.1:** `McpPromptAdapter` surfaces MCP prompts as pseudo-skills behind `skills.includeMcpPrompts` (default off), marked lossy.
- **AC-4.2:** AGENTS.md handled by a **separate** project-instructions ingester (prepends to system prefix), explicitly **not** registered as a skill adapter.

---

### Key facts for the ADR
- `SKILL.md` is the single shipped cross-vendor skill format (verified, zero hallucination). The loader is a path+sidecar problem, not a translation problem.
- anymodel cannot edit the sealed `cli.js` loader; the durable seam is **materialize foreign skills onto disk** (`cli.mjs:463` pre-spawn) + **proxy re-injection** (`skill-catalog.mjs`), not a bundle fork.
- Branding fragility is two-system coupling (static patch reads `ANYMODEL_MODEL`, runtime injection sets it) + manual allowlist coverage; the fix is `brandedEnv()` unification + a vendor-sweep CI gate that catches *unknown* new strings, not just drift in known ones.
- Stub-don't-invent for Gemini Gems, Antigravity Workflows, A2A — no shipped conforming skill file format.

Load-bearing files: `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/cli.mjs` (env seam `:463-475`, dual spawn `:367`/`:394`), `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/scripts/brand-patch.mjs` (applier to extend), `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/providers/skill-catalog.mjs` (harvest seam `:52`/`:148`), `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/claude-code/skills/loadSkillsDir.ts` (sealed-bundle loader, future-state seam `:425`/`:431`/`:185`/`:270`).