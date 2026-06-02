# Implementation Plan — 0010 Local Skill-Fidelity

## Overview

Replace the blanket destruction of the Claude Code skill catalog on local providers with a **capture → compress → re-inject** pipeline that lands a small, deterministic, name-sorted block in `parsed.system` (the KV-cacheable prefix region). Gated behind a `LOCAL_FIDELITY` dial whose default (`balanced`) restores skills out of the box, with `lean` preserving today's exact behavior. All new logic lives in a pure, unit-testable module; `proxy.mjs` only wires it in.

## Architecture

### Components
- **`providers/skill-catalog.mjs`** (NEW, pure / no I/O):
  - `harvestSkillCatalog(messages)` → `{lines, rawCount}` — regex-capture the `"The following skills are available for use with the Skill tool:"` block from message text/blocks, split to `- name: desc` lines, drop the ` - whenToUse` tail, clamp desc to `LOCAL_SKILL_DESC_CHARS`.
  - `selectSkills(lines, {budgetChars, query, fidelity})` → `{block, kept, dropped}` — keep `sw:*` + project skills first, score the rest by keyword overlap with the latest user message, cap to budget, degrade to names-only under pressure, **sort by name**, prepend the BLOCKING-REQUIREMENT header.
  - `buildBehavioralCore(fidelity)` → string — curated ~600-900 token CC rules incl. the call-Skill-FIRST blocking rule verbatim.
- **`proxy.mjs`** — orchestration only: harvest before strip; re-inject into system in both the condense branch and a new else-branch; widen the prefix-cache gate; log `[FIDELITY]`.
- **`providers/tool-compressor.mjs`** — never-evict guard for `Skill` + `ToolSearch`.
- **`cli.mjs`** — `--local-fidelity` flag → `LOCAL_FIDELITY` env export to the proxy child.

### Data flow (local provider request)
```
incoming /v1/messages (Anthropic)
  → sanitizeBody / tool translate (203-259)   [UNCHANGED]
  → harvestSkillCatalog(messages)              [NEW, before strip @544]
  → strip <system-reminder> from messages      [UNCHANGED @544-565]
  → condense system + APPEND behavioralCore + selectSkills().block to parsed.system
      (both >cap branch @512 AND new ≤cap else-branch)   [NEW @502-538]
  → prefix-cache getOrStore (isLocal, was ollama-only)   [WIDENED @622]
  → dispatch to backend (lmstudio/ollama/llamacpp)
```

## Technology Stack
- Language: ESM JavaScript (`.mjs`), zero new dependencies (matches AnyModel's zero-dep ethos).
- Tests: Vitest (`.test.mjs`).

## Architecture Decisions

- **Harvest from the live request, not from disk.** The request already carries the authoritative merged catalog (bundled + plugin + project `.claude/skills`). Reading `SKILL.md` frontmatter from disk would miss bundled/plugin skills and create a second source of truth. (ADR-style: rejected disk-read.)
- **Re-inject into `system`, not messages.** Messages are the volatile region — a catalog there re-prefills every turn. System is the stable prefix → KV reuse → one-time cost. (Rejected: keep-in-message.)
- **Curated re-injection, not full un-trim.** The full CC prompt is 12-25K tokens — exactly the regime the trim avoids. Curated ~2-2.5K tokens captures ~95% of the auto-trigger benefit at <10% of the cost. (Rejected: restore-full-prompt.)
- **`balanced` is the default, `lean` is opt-out.** Measured cost (+0.7-1.3s cold, ~0ms warm) is small enough that working skills should be on by default. (Rejected: off-by-default.)
- **Additive budget.** Effective system cap = `LOCAL_MAX_SYSTEM_CHARS + skillBudgetChars` so the skill index doesn't steal from CLAUDE.md.

## Implementation Phases

### Phase 1: Pure module (TDD foundation)
- `skill-catalog.mjs` + `test/skill-catalog.test.mjs` — harvest, select, behavioral-core. RED → GREEN → REFACTOR.

### Phase 2: Proxy wiring
- harvest-before-strip; re-inject into system (both branches); env knobs; `[FIDELITY]` log.
- widen prefix-cache to `isLocal` + ensure lmstudio/llamacpp `transformResponse`/`createStreamTranslator` accept `prefixCacheResult`.

### Phase 3: Guards, CLI, docs, eval
- tool-compressor never-evict; `cli.mjs --local-fidelity`; `LOCAL_SETUP.md`; live capability eval (AC-US6-01).

## Testing Strategy
- Unit (`test/skill-catalog.test.mjs`): pure-function coverage of harvest/select/core.
- Integration (`test/proxy-fidelity.test.mjs`): per-tier output, 3× byte-identical system via `computePrefixHash`, Skill stays in tools, raw system-reminder still stripped, `LOCAL_SKILL_INDEX=off` no-op, lmstudio `getOrStore` hit.
- Live eval: AC-US6-01 against LM Studio MLX qwen3-coder-30b on :1234 through the proxy.

## Technical Challenges

### Challenge 1: Prefix-cache determinism
**Solution**: name-sort the index, date-free behavioral core, additive budget so content doesn't shift.
**Risk**: any drift = silent per-turn re-prefill → hard-gated by AC-US3-01 (3-turn hash equality).

### Challenge 2: Widening prefix-cache to MLX path
**Solution**: change the gate to `isLocal`; confirm lmstudio/llamacpp response/stream transforms accept `prefixCacheResult` (currently only ollama exercises it).
**Risk**: MLX implicit KV keys may differ from llama.cpp — validate with real two-turn TTFT, not just synthetic metrics.

### Challenge 3: Unbounded catalog (200+ plugin skills)
**Solution**: char-budget cap + `sw:*`/project-first relevance filter + names-only degradation (AC-US4-01).
