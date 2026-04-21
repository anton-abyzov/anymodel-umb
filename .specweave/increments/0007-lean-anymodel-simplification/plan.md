# Plan: Lean AnyModel — 1.12.0

**Design provided by**: `sw:sw-architect` agent (2026-04-20) — full report in session transcript.
**Companion**: user-approved plan at `/Users/antonabyzov/.claude/plans/temporal-churning-scott.md`.

## Architecture overview

No structural changes to the proxy model. Three refactoring moves + one new capability:

```
BEFORE (1.11.1)                         AFTER (1.12.0)
─────────────────                       ─────────────
proxy.mjs (963 LOC)                     proxy.mjs (~780 LOC)
  ├── handleMessages                      ├── handleMessages
  │    └── 180-line isLocal block  →     │    └── optimizeForLocal() call
  ├── sanitizeBody (+ _unused hack)       ├── sanitizeBody (clean empty schema)
  └── stripPlaceholders × 4 sites    →   (removed)

providers/lmstudio.mjs (116)            providers/lmstudio.mjs (~15, re-export)
providers/llamacpp.mjs (89)             providers/llamacpp.mjs (~15, re-export)
                                        providers/openai-local.mjs (~90, NEW factory)
                                        providers/local-optimizer.mjs (~200, NEW extracted)

providers/openai.mjs
  ├── translateRequest              (unchanged)
  ├── translateResponse             (-10 LOC placeholder cleanup)
  └── createStreamTranslator         (+10 LOC usage forwarding fix — US-006)
```

## Design decisions

### DD-1: Factory via `makeOpenAILocalProvider({...})` (US-001)

**Accepted** over inheritance/mixin or template-provider because:
- JS modules don't benefit from class hierarchies here
- One 90-LOC factory is easier to audit than two 100-LOC near-duplicates
- Preserves the existing provider contract (`name`, `buildRequest`, `transformRequest`, etc.) so `proxy.mjs` needs no changes

Signature:
```js
export function makeOpenAILocalProvider({ name, defaultPort, envVar, bearerStub, v0Probe = false })
```
`v0Probe = true` only for LMStudio (uses `/api/v0/models` for loaded-state detection).

### DD-2: Native Anthropic mode as provider capability (US-002)

**Accepted** over separate provider class or wrapper because:
- One flag (`provider.nativeAnthropic`) set at probe time cleanly gates 3 function calls
- Probe happens ONCE at startup, not per request
- Escape hatch (`LMSTUDIO_NATIVE=0`) respected at same decision point
- Local optimization passes (tool-compress, system-condense) still run — they operate on the body BEFORE translation, so skipping translation doesn't affect them

Probe algorithm:
1. POST `/v1/messages` with `{model, max_tokens:1, messages:[{role:"user",content:"hi"}]}` and 3s timeout
2. Parse response: if `type === "message"` AND `content[0].type === "text"` → native Anthropic confirmed
3. If probe times out or returns unexpected shape → fall back to translation path (1.11 behavior)

### DD-3: LocalOptimizer module boundary (US-003)

**Accepted** signature: `optimizeForLocal(parsed, ctx) → { parsed, telemetry }`

`parsed` is the Anthropic-format request body (mutated and returned for convenience).
`ctx` carries `providerName`, `numCtx`, plus env-override overrides for testability.
`telemetry` carries `{ toolsBefore, toolsAfter, systemCharsBefore, systemCharsAfter, xmlStripped, messagesBefore, messagesAfter }` so `proxy.mjs` can still log the same `[LMSTUDIO]` / `[OLLAMA]` banner lines.

The 5 passes:
1. Tool schema compression (via existing `tool-compressor.mjs`)
2. Strip `thinking: {enabled:true}`
3. Condense system prompt (Claude Code's 50-100KB → ~4KB)
4. Strip XML boilerplate from messages
5. Condense message history to fit context window

Ollama-only passes (capability-aware tool strip, prefix-cache) remain gated by `providerName === 'ollama'` *inside* the optimizer.

### DD-4: Empty-schema fix at source (US-004)

**Accepted** over deeper sanitization pass because:
- `{type:"object", additionalProperties:false}` is valid JSON Schema that every OpenAI-compat endpoint accepts (verified on OpenAI, Groq, Together, vLLM, LMStudio, Ollama)
- Removes 4 downstream "undo" sites that created latent corruption for tools legitimately named `_unused`

### DD-5: `:free` suffix trust (US-005)

**Accepted** because OpenRouter's documented convention uses `:free` as the canonical marker. Auto-router model `openrouter/free` stays special-cased.

### DD-6: SSE usage accumulator (US-006)

**Accepted** approach: accumulate `completion_tokens` across all chunks during the stream, emit in the final `message_delta` regardless of whether upstream provides it per-chunk or only at `[DONE]`.

## Critical files to modify

| File | LOC before | LOC after | Change | US |
|---|---:|---:|---|---|
| `cli.mjs` | 682 | ~665 | Remove FREE_MODELS array, add native-mode banner line | US-005, US-002 |
| `proxy.mjs` | 963 | ~780 | Extract optimizer block; add native-mode passthrough; remove placeholder strip; patch usage accumulator | US-003, US-002, US-004, US-006 |
| `providers/openai.mjs` | 362 | ~355 | Remove placeholder regex, add usage accumulator | US-004, US-006 |
| `providers/ollama.mjs` | 333 | ~325 | Remove placeholder strip from response translator | US-004 |
| `providers/lmstudio.mjs` | 116 | ~15 | Thin re-export of factory | US-001 |
| `providers/llamacpp.mjs` | 89 | ~15 | Thin re-export of factory | US-001 |
| `providers/openai-local.mjs` | — | ~90 | NEW factory | US-001 |
| `providers/local-optimizer.mjs` | — | ~200 | NEW extracted module | US-003 |
| `test/openai-local.test.mjs` | — | ~80 | NEW tests | US-001 |
| `test/local-optimizer.test.mjs` | — | ~150 | NEW unit tests for each pass | US-003 |
| `test/lmstudio.test.mjs` | existing | +15 | Native-mode probe tests | US-002 |
| `test/openai.test.mjs` | existing | +30 | Regression `_unused` tool, usage forwarding | US-004, US-006 |
| `test/cli.test.mjs` | existing | +20 | Free-tier detection by `:free` suffix | US-005 |
| **Totals** | **2,828** | **~2,568** | **−260 net, +2 new prod modules, +~295 test LOC** | |

## Functions / utilities to REUSE

| From | What | Used by |
|---|---|---|
| `providers/openai.mjs` | `translateRequest`, `translateResponse`, `createStreamTranslator` | `openai-local.mjs` (factory default), `proxy.mjs` (when `!nativeAnthropic`) |
| `providers/tool-compressor.mjs` | `optimizeTools` | `local-optimizer.mjs` |
| `providers/ollama-tools.mjs` | `shouldSendTools`, `ollamaToolMode` | `local-optimizer.mjs` (Ollama branch) |
| `providers/prefix-cache.mjs` | `getOrStore` | `local-optimizer.mjs` (Ollama branch) |

## TDD execution order (smallest → biggest refactor)

1. **US-005** (FREE_MODELS prune): trivial delete + test update — warms up the loop
2. **US-006** (output_tokens fix): isolated bug fix with clear regression test
3. **US-004** (`_unused` removal): multi-file delete, tested by regression
4. **US-001** (factory merge): creates new module, shrinks two existing ones
5. **US-003** (optimizer extract): bigger refactor, isolated by full-suite green
6. **US-002** (native mode): last — biggest new capability, requires US-003 extractions to be done so native-mode skipping is clean

Each US follows RED → GREEN → REFACTOR via `/sw:tdd-cycle`.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| LMStudio 0.3.x SSE quirks break native passthrough | Medium | Keep translation path; `LMSTUDIO_NATIVE=0` escape; probe validates shape |
| Optimizer extraction reorders passes → behavior change | Medium | Full 260-test suite must remain green (AC-US3-04) |
| `{type:"object", additionalProperties:false}` rejected by some endpoints | Low | Integration smoke matrix before land (AC-US4-04) |
| `output_tokens` still 0 on some providers (they don't emit usage at all) | Low | Graceful fallback — field stays 0, no throw (AC-US6-04) |
| Parallel work on 0004-prefix-aware-caching (shared proxy.mjs) | Low | 0004 is metadata-only placeholder; no code being written there |

## Verification

Same as approved master plan at `/Users/antonabyzov/.claude/plans/temporal-churning-scott.md` § Verification. Summary:

1. `npm test` → 260+ tests green
2. `node --check cli.mjs proxy.mjs providers/*.mjs` → syntax OK
3. Bench S5 via LMStudio native vs translation → native ≤ translation latency
4. `output_tokens` non-zero in streamed responses
5. Ollama / OpenRouter / OpenAI paths regression-free
6. `npm publish --dry-run` → valid 1.12.0 tarball
7. `/sw:done 0007` → all quality gates green
