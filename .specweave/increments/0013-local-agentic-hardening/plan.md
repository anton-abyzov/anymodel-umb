# Implementation Plan: Local agentic reliability hardening (post-1.15.0)

## Architecture context

All work is in `repositories/antonoly/anymodel`. The proxy is a single-process Anthropic↔OpenAI
translation server (`proxy.mjs`) with per-provider modules under `providers/`. No new dependencies, no
schema/DB. Test stack: `node --test test/*.test.mjs` (currently 444/444 green). Every change must keep
the 444 passing and add a negative-path test.

Key files and the exact seams this increment touches (from the diagnosis, verify line numbers before editing):
- `proxy.mjs` — system-prompt condensing (~497-538), `<system-reminder>` stripping (~545), message-history
  condenser (~580-588), provider wiring. Owner of US-001 (self-check), US-004 (refusal retry), US-005 (condenser).
- `providers/skill-catalog.mjs` — `harvestSkillCatalog` (~52), `buildBehavioralCore` (~186-192). Owner of US-001.
- `providers/openai.mjs` — text-channel recovery regexes (~274), `extractToolResultParts` (~108-120),
  `translateRequest` (image parts). Owner of US-002, US-003.
- `cli.mjs` — local-provider arg injection (`--strict-mcp-config`, ~446). Owner of US-006.
- `LOCAL_SETUP.md` — user-facing docs. Owner of US-006.

## Approach per story

### US-001 — Session-scoped skill-catalog cache + self-check
The current harvest reads the turn-1 `<system-reminder>`; turns 2+ have none, so the catalog is lost and
`buildBehavioralCore` still references a "listed below" block. Add a small in-process LRU keyed by a stable
session signature (hash of the first user message + tool-name set, since the proxy is stateless across HTTP
requests). On turn 1: harvest + cache. On turn 2+ with no catalog in the request: re-inject from cache. If
no cache entry and no catalog: drop the dangling reference (US1-02). Self-check (US1-03): on the first
request per session, if a Skill tool + catalog are present but the re-injection module is disabled/absent,
emit one `console.warn` naming the trim-without-restore condition. Keep the cache bounded (TTL/size) to
avoid leaks across many sessions.

### US-002 — Paren-variant text-channel parse
Extend the Qwen-XML parser. Current `/<function=([^>\s]+)\s*>/` greedily captures `name(args...)`. Add a
branch: if the captured name contains `(`, split at the first `(`, take the bare name, and parse the
`key="value"`/`key=value` pairs inside the parens into `input{}`. Also tolerate an unclosed `<tool_call>`
wrapper. Preserve the existing canonical-XML and Hermes branches and the false-positive guard (require a
plausible call structure, not a prose mention).

### US-003 — tool_result multimodal markers
`extractToolResultParts` reads only `block.text`. Iterate all blocks: text→text; image→`[image omitted:
N bytes, mime]` (or forward as an image part when the target model is vision-capable, detected via the
provider capability info); document→`[document omitted]`. Never emit silent `''`. Mirror the existing
`is_error` prefix behavior.

### US-004 — Opt-in refusal retry
After translating a local-provider response, if `LOCAL_REFUSAL_RETRY=on` AND the response is a
capability-disclaimer refusal (regex on known markers) AND `stop_reason==end_turn` AND the request carried
a non-empty `tools[]`, re-issue the upstream call once with an extra system line. Hard cap one retry per
turn; never for cloud providers; default off so behavior is unchanged.

### US-005 — Plan-state-aware condenser + regression gate
The condenser drops middle turns and inserts empty filler. Change: (1) mark and never drop the turn that
established plan mode (detect `EnterPlanMode`/plan-mode tool_use or the plan-mode system marker) and the
most recent `ExitPlanMode`-relevant assistant turn; (2) replace the empty filler with a one-line structured
summary of the dropped span (turn count + tool names touched). Add a scripted multi-turn harness test that
asserts the regression gate (turn-2+ skill-trigger ≥60%, plan re-entry ≤1).

### US-006 — Local-agentic preset + docs
Add a `--local-agentic` preset (or documented env profile) that, for local providers, surfaces guidance to
relax mandatory plan-mode / blocking SKILL-FIRST hooks and prefer `--full-mcp` when the project depends on
the Skill tool. Document the full recipe in `LOCAL_SETUP.md` (mirrors the diagnosis doc's recipe). Default
behavior unchanged unless opted in.

## Sequencing / risk
1. US-002 (S, isolated parser + tests) and US-003 (M, isolated) — low risk, land first.
2. US-001 (M) — the highest-value functional fix; needs the session-cache abstraction.
3. US-005 (L) — touches condenser index logic; strongest tests required; do after US-001 so the cache exists.
4. US-004 (M) — additive, flag-gated.
5. US-006 (S) — docs + preset, last.

## Testing
- TDD: red→green per AC. Add tests under `test/text-toolcall-recovery.test.mjs` (US-002),
  `test/openai.test.mjs` (US-003), `test/skill-catalog.test.mjs` (US-001), a new
  `test/local-refusal-retry.test.mjs` (US-004), and a new `test/multiturn-plan-state.test.mjs` (US-005).
- After each story: full `npm test` must stay green + the new negative-path tests pass.
- For US-002/US-005, prefer at least one real LM Studio probe (`qwen3-coder-30b` and `qwen3-coder-next`).

## ADR
No new ADR required; this hardens behavior introduced by 0008/0009/0010. Reference
`docs/2026-06-02-qwen-local-agentic-diagnosis.md` as the decision record.
