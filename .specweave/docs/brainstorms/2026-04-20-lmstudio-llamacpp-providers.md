# Brainstorm: Dedicated LMStudio & llama.cpp Providers for AnyModel

**Date**: 2026-04-20 | **Depth**: deep | **Lenses**: UX, technical-differentiation, marketing, maintenance, contrarian, portability | **Status**: complete

---

## Problem Frame

**Statement**: AnyModel's OpenAI provider already handles LMStudio (`:1234/v1`), llama-server (`:8080/v1`), vLLM, Azure, Together, and Groq via `OPENAI_BASE_URL`. The Ollama provider is dedicated only because Ollama's *native* `/api/chat` endpoint is required to set `think:false`, inject `num_ctx`, and hold the model in GPU with `keep_alive`. Should AnyModel add dedicated `lmstudio` and `llamacpp` providers, or keep routing them through OpenAI?

**5W1H**

| Dim | Answer |
|---|---|
| **Who** | Local-first developers running GGUF models on their own hardware (M-series Macs, RTX GPUs). Secondary: "pure proxy mode" users from increment 0005. |
| **What** | Decide between three provider-surface shapes: (A) keep OpenAI-as-universal; (B) add thin wrappers for discoverability; (C) add full dedicated providers with native endpoints and backend-specific knobs. |
| **When** | Before the next release cycle — the repo just shipped pure-proxy mode (0005) and prefix-aware caching (0004); provider surface is in flux. |
| **Where** | `providers/*.mjs`, `cli.mjs::detectProvider()`, README "Local" section, preset table in `--help`. |
| **Why** | Ollama has 200K+ installs but LMStudio and llama.cpp have overlapping audiences. Discoverability claim ("AnyModel supports LMStudio") materially changes marketing surface. Also, do these backends *technically* need special knobs the way Ollama does? |
| **How** | One of the six approaches below — evaluated across UX, tech, marketing, maintenance, portability. |

**Clarifications resolved from codebase**:
- Ollama's dedicated provider exists because `/v1/chat/completions` drops `think:false`, burning qwen3/deepseek output on hidden CoT → **the reason is a real product bug, not cosmetic**.
- LMStudio exposes `/v1/chat/completions` natively (llama.cpp engine under the hood) — no equivalent reasoning-suppression bug on the OpenAI path.
- llama-server (`llama.cpp`) exposes `/v1/chat/completions` and a native `/completion` — the OpenAI surface is complete.
- Tool-compressor runs **upstream** of provider translation, so all three backends get the 50K-token MCP tool strip for free.

---

## Approaches

### Approach A: Status Quo — OpenAI Provider Only

**Source**: Contrarian lens + maintenance-cost lens
**Summary**: Do nothing new. Document the `OPENAI_BASE_URL=http://localhost:1234/v1` pattern more prominently in README. Add a one-liner preset like `anymodel proxy --lmstudio` that is pure sugar (sets `OPENAI_BASE_URL` and calls the OpenAI provider).

**Key steps**:
1. Expand README "Local" section with copy-paste LMStudio & llama-server recipes.
2. Add `--lmstudio` / `--llamacpp` flags in `cli.mjs` that set `OPENAI_BASE_URL` defaults (`:1234/v1` and `:8080/v1`).
3. Extend `detectProvider()` to probe `:1234` and `:8080` after Ollama and return `'openai'` with preset base URL.
4. Update `--help` and `displayInfo()` to show the detected backend name.

**Strengths**:
- Zero new code paths to maintain; one translator.
- Model portability is maximal — same GGUF, identical OpenAI-format requests.
- Matches the README story already in place ("llama.cpp is the engine behind Ollama and LM Studio").

**Risks**:
- Users searching for "anymodel lmstudio" on GitHub may not see a dedicated provider and assume lack of support.
- If LMStudio ever ships a non-OpenAI quirk (e.g., a reasoning mode like Ollama), we have no home for the fix.

**Effort**: Low (1 day)

---

### Approach B: Thin Aliases (Discoverability Wrappers)

**Source**: UX/discoverability lens
**Summary**: Create `providers/lmstudio.mjs` and `providers/llamacpp.mjs` as **50-line re-exports** of the OpenAI provider that override `detect()`, `displayInfo()`, and default base URL. No new translation logic.

**Key steps**:
1. `providers/lmstudio.mjs` exports the OpenAI provider shape with `detect()` probing `:1234/v1/models` and `displayInfo()` returning `(model @ LM Studio :1234)`.
2. Same for `providers/llamacpp.mjs` probing `:8080/v1/models` or `:8080/health`.
3. `detectProvider()` priority: openrouter → openai(env) → ollama → lmstudio → llamacpp.
4. Add banner: "Detected LM Studio at localhost:1234 — using model <auto-selected>".
5. Add to preset table and `--help`.

**Strengths**:
- Marketing surface grows without code duplication ("Supports: OpenAI, Anthropic, OpenRouter, Ollama, LM Studio, llama.cpp").
- Future-proof: if LMStudio introduces a quirk, the provider file already exists as a landing spot.
- Auto-detect UX feels magical — user launches LMStudio, runs `anymodel`, it "just works".

**Risks**:
- Sprawl perception: 3 provider files that delegate to one may confuse contributors.
- Detection order can misfire if a user has multiple local servers running (resolution: prompt or explicit flag).

**Effort**: Low-Medium (2 days)

---

### Approach C: Full Dedicated Providers (Ollama-style treatment)

**Source**: Technical-differentiation lens
**Summary**: Build `lmstudio.mjs` and `llamacpp.mjs` with their own `transformRequest`/`transformResponse`, hitting each backend's *native* endpoints where they exist (LMStudio has none unique; llama-server has `/completion` and `/props`) and exposing backend-specific knobs.

**Key steps**:
1. LMStudio: stay on `/v1/chat/completions` but add `LMSTUDIO_TTL` (auto-unload control), and probe `/api/v0/models` for model list.
2. llama-server: add `LLAMACPP_N_GPU_LAYERS`, `LLAMACPP_N_CTX`, `LLAMACPP_CACHE_PROMPT=true` (prompt-cache re-use is the killer feature).
3. Warmup path for each (preload via 1-token request).
4. Tests: provider-level contract tests mirroring `providers/ollama.mjs` test coverage.
5. Update docs, presets, help.

**Strengths**:
- Real technical leverage: `cache_prompt` on llama-server is a **massive** win and only reachable via provider-specific config.
- Positions AnyModel as "the best client for local models", not just "a client that happens to work".
- Each backend becomes a first-class surface for its own quirks.

**Risks**:
- Two more providers to maintain as backends evolve (llama.cpp ships weekly).
- Most users won't tune `N_GPU_LAYERS` — complexity tax borne by the 80% to serve the 20%.
- Divergent code for similar translations (DRY violation risk).

**Effort**: Medium-High (1 week)

---

### Approach D: Hybrid — Aliases Now, Knobs Later

**Source**: Hybrid / Adjacent Possible
**Summary**: Ship Approach B (thin aliases) immediately for discoverability. Add a **capability probe** at proxy-start that inspects the backend's `/v1/models` metadata (LMStudio exposes `context_length`, `quantization`) and displays it in the banner. When a user files a feature request for a backend-specific knob (e.g., "can anymodel set llama.cpp's cache_prompt?"), promote that provider's file from alias to dedicated in-place with no API change.

**Key steps**:
1. Implement Approach B exactly.
2. Add `probeCapabilities(baseUrl)` that hits `/v1/models` and extracts context length, quant, architecture; use it for the banner and warn if num_ctx exceeds model's window.
3. Document the promotion path in `CONTRIBUTING.md`: "To add backend-specific knobs to LMStudio, replace `export default openai` with a full provider module."
4. Add `ANYMODEL_LOCAL_PORT_PROBE=false` escape hatch for users with strict networking.

**Strengths**:
- Low-risk short-term, high-leverage long-term.
- Banner with model metadata is a genuine UX upgrade for local users (surfaces "you are running Q4_K_M at 8K ctx").
- Aligns with pure-proxy-mode ethos (0005): less magic, more transparency.

**Risks**:
- Probe failures on restrictive LMStudio builds need graceful fallback.
- "Promotion path" is a soft commitment — someone has to actually do it when the time comes.

**Effort**: Low-Medium (3 days)

---

### Approach E: Unified "Local OpenAI-Compat" Meta-Provider

**Source**: SCAMPER — "Combine"
**Summary**: Replace the idea of per-backend providers with a single `providers/local-openai.mjs` that auto-detects which backend is running (LMStudio, llama-server, vLLM, Text Generation WebUI) via health/fingerprint endpoints and tags the banner accordingly. No backend aliases exposed as separate provider names — just one "local" mode.

**Key steps**:
1. `providers/local.mjs` delegates to OpenAI translator but runs a fingerprint probe at startup (LMStudio has `/api/v0/models`, llama-server has `/props`, vLLM has `/version`).
2. `anymodel proxy local --port 1234` — one command, detects and labels backend.
3. Banner: "Local backend: LM Studio (v0.3.5, llama.cpp b4200, ctx=8K, q=Q4_K_M)".
4. README simplifies to "Local: one command, any backend".

**Strengths**:
- Minimal cognitive load for users ("local = local, don't make me pick").
- Naturally extensible: new backend = new fingerprint, no new provider.
- Story compresses well for marketing ("AnyModel auto-detects your local runtime").

**Risks**:
- Loses backend-specific knob surface entirely (can't set llama-server's `cache_prompt`).
- Over-abstracts: some users *want* to say "I'm using LMStudio" explicitly.
- Fingerprint probing adds startup latency and failure modes.

**Effort**: Medium (4 days)

---

### Approach F: Do Nothing + Sharpen Docs

**Source**: Contrarian — "Eliminate"
**Summary**: Add zero code. Rewrite README "Local" section with a matrix showing every backend (Ollama, LMStudio, llama-server, vLLM) with exact commands, port, and known quirks. Add FAQ: "Why no LMStudio provider? Because it doesn't need one."

**Key steps**:
1. README matrix with 4 backends × 4 columns (command, port, env var, notes).
2. FAQ entry explaining the `OPENAI_BASE_URL` model.
3. Add search-optimized terms to README (LM Studio, llama.cpp, MLX via LMStudio).
4. Marketing tweet: "AnyModel supports every local runtime with one provider — here's why that's the point."

**Strengths**:
- Zero maintenance tax.
- Respects engineering taste (abstraction that already works shouldn't be split).
- Honest marketing: we don't claim support we don't have.

**Risks**:
- Loses the UX magic of auto-detection.
- SEO/GitHub-search problem: "anymodel lmstudio" returns nothing distinctive.
- Ignores the real friction: users copy-pasting `OPENAI_BASE_URL=http://localhost:1234/v1` every time.

**Effort**: Very Low (half day)

---

## Evaluation Matrix

Criteria picked from **engineering + product marketing** (hybrid set):

- **Complexity** (1=trivial, 5=hard)
- **Time to ship** (1=hours, 5=week+)
- **UX win** (1=invisible, 5=delightful)
- **Marketing surface** (1=none, 5=strong support-claim story)
- **Maintenance cost** (1=free, 5=ongoing burden) — *lower is better*
- **Tech leverage** (1=none, 5=unlocks real capability like cache_prompt)

| Criterion | A: Status Quo | B: Aliases | C: Full Dedicated | D: Hybrid | E: Unified Local | F: Docs Only |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Complexity (lower=better) | 1/5 | 2/5 | 4/5 | 3/5 | 3/5 | 1/5 |
| Time (lower=better) | 1/5 | 2/5 | 4/5 | 2/5 | 3/5 | 1/5 |
| UX win | 2/5 | 4/5 | 4/5 | 5/5 | 4/5 | 2/5 |
| Marketing surface | 2/5 | 4/5 | 5/5 | 4/5 | 3/5 | 2/5 |
| Maintenance (lower=better) | 1/5 | 2/5 | 4/5 | 2/5 | 3/5 | 1/5 |
| Tech leverage | 1/5 | 1/5 | 5/5 | 3/5 | 2/5 | 1/5 |
| **Weighted score** (UX+Marketing+Leverage − Complexity−Time−Maint) | **+2** | **+7** | **+6** | **+10** | **+3** | **+2** |

---

## Recommendation

**Selected: Approach D — Hybrid (Aliases Now, Knobs Later)**

**Rationale**:
1. **Technical honesty**: LMStudio and llama-server don't currently have Ollama-style quirks (no `think:false` trap, no forced `num_ctx` default pain). A full dedicated provider would be ~90% duplicate OpenAI translation code chasing a problem that doesn't exist *yet*.
2. **Marketing leverage is real**: "Detected LM Studio, model Q4_K_M at 8K ctx" in the banner is the kind of polish that turns a proxy into a tool users recommend. Aliases buy this with <200 lines.
3. **Optionality**: Thin-alias files become natural landing spots when (not if) a backend ships a quirk — llama-server's `cache_prompt` is the obvious first one. Promotion from alias to full is a pure-internal change, no breaking UX.
4. **Model portability stays perfect**: one translator, one surface, same GGUF runs everywhere. Users see backend *metadata* differ (quant, ctx) but request/response contracts are identical.
5. **Aligns with pure-proxy-mode (0005)**: minimal magic, explicit backend selection via flag or auto-detect, transparent banner.

**Caveats**:
- Port-probe auto-detection can misfire when multiple local servers run simultaneously. Resolution: explicit `--lmstudio` / `--llamacpp` flags always override; banner names the detected backend so the user catches the wrong pick immediately.
- `probeCapabilities()` must degrade gracefully — if `/v1/models` returns 404 on an old LMStudio build, skip the banner enrichment and log once at debug level.
- Rejecting Approach C means saying "no" to `LLAMACPP_CACHE_PROMPT` today. That's a deliberate bet that the hybrid structure makes it cheap to add in a follow-up increment.

---

## Deep Analysis

### Abstraction Ladder

- **Zoom OUT**: The real question isn't "add two providers?" It's "what is AnyModel's relationship to backend heterogeneity?" Is it a *thin universal proxy* (OpenAI-compat router) or *the best client for each backend* (per-backend optimizer)? Today it's the former for remote, latter for Ollama — an inconsistency. D keeps the inconsistency contained: Ollama stays special because its quirks earned it; others are thin until they earn it too.
- **Current level**: Hybrid provides discoverability + extensibility with ~200 LOC.
- **Zoom IN — first 3 concrete steps**:
  1. Create `providers/lmstudio.mjs` (~60 lines): `import openai from './openai.mjs'` → export object that delegates all handlers but overrides `name`, `detect()` (probe `:1234/v1/models`), `displayInfo()`, and default base URL.
  2. Add `detectProvider()` priority after ollama: lmstudio (`:1234`) → llamacpp (`:8080`).
  3. Add `--lmstudio` and `--llamacpp` CLI flags that force provider selection and preset base URL.

### Analogies

1. **`git` remotes (HTTP/HTTPS/SSH)**: git has one transport logic but distinct remote "helpers" (`git-remote-http`, `git-remote-s3`) that exist mostly as discoverability + extension points. Same pattern: one core engine, multiple labeled entry points.
2. **Terraform providers for cloud variants**: AWS GovCloud vs AWS Commercial use the same provider binary but identify themselves separately in logs/state for operator clarity. Users get the "we support GovCloud" claim without duplicate code.
3. **FFmpeg demuxers**: many container formats (mov, mp4, m4a, 3gp) share 95% of code but are exposed as separate demuxers so users/tools can target them by name. The *name* is the product surface; the *implementation* can share.

### Hidden Assumptions

| Assumption | If inverted... |
|---|---|
| "OpenAI-compat is stable across backends" | If LMStudio ships a new tool-calling format variant, aliases would need divergence sooner. *Fragile assumption — watch closely.* |
| "Port 1234 / 8080 are stable defaults" | Both are configurable in LMStudio/llama-server. Auto-detection needs to tolerate common alternatives (5000, 8081) via env var `ANYMODEL_LOCAL_PORTS`. |
| "Users want auto-detection" | Some pure-proxy-mode (0005) users explicitly want *no* magic. Gate probing behind `ANYMODEL_NO_PROBE=1`. |
| "Model portability means identical outputs" | Same GGUF can produce different outputs across backends due to different default samplers/temperature/top-k. Document that portability = API shape, not token-level determinism. |
| "llama-server is primarily used via `/v1/chat/completions`" | Advanced users use raw `/completion` with custom grammars. Aliases miss this audience — but that audience is a tiny slice of coding-assistant users. |

### Pre-Mortem

Imagine 6 months from now: AnyModel added aliases in 0006, but the effort is considered a flop. What went wrong?

| Failure Mode | Likelihood | Impact | Mitigation |
|---|:-:|:-:|---|
| Port probe causes startup lag or firewall prompts | Med | Med | 500ms timeout; `ANYMODEL_NO_PROBE=1` escape hatch; probe only on `anymodel proxy` with no explicit provider |
| Auto-detect picks wrong backend when user runs both LMStudio and Ollama | Med | Low | Banner always names the pick; `--lmstudio`/`--ollama` override; warn "multiple local backends detected" and pick by user preference order env var |
| LMStudio ships a breaking `/v1/models` change | Low | Low | Probe is optional enrichment; missing metadata degrades to generic banner |
| Users demand `cache_prompt` for llama.cpp and "thin alias" becomes the bottleneck | High | Med | Promotion path is documented and designed for; a single follow-up PR converts alias to full provider without API break |
| Maintainers (you) regret the sprawl and want to revert | Low | High | Keep aliases to <80 LOC each; if abandoned, they collapse back to README mentions + single provider with minimal diff |
| "Model portability" marketing claim produces bug reports ("same GGUF gives different answers on LMStudio vs Ollama") | Med | Low | Document the sampler-defaults caveat explicitly; provide `--temperature` / `--top-k` CLI overrides that normalize across backends |

---

## Idea Tree

```
lmstudio & llama.cpp provider decision
├── A. Status Quo (OpenAI provider only)
│   └── variant: add --lmstudio/--llamacpp CLI sugar (abandoned — subsumed by B/D)
├── B. Thin Aliases for discoverability
│   └── extended in D with capability probe
├── C. Full Dedicated Providers (Ollama-style)
│   ├── variant: LMStudio-only dedicated (abandoned — no real quirk)
│   └── future path: promote from D when cache_prompt or similar lands
├── D. Hybrid — Aliases Now, Knobs Later  ← SELECTED
│   ├── Phase 1: lmstudio.mjs + llamacpp.mjs as thin delegators
│   ├── Phase 2: capability probe in banner
│   └── Phase 3: promotion to full provider when backend-specific knob lands
├── E. Unified "Local" meta-provider (abandoned — loses backend-specific surface)
└── F. Docs only (abandoned — leaves UX friction on the table)
```

---

## Next Steps

**Recommended**: Create increment `0006-local-backend-providers` implementing Approach D.

**Scope sketch** (for the increment):
- **US-001**: As a local dev, running `anymodel` while LMStudio is live on `:1234` should auto-detect and display "LM Studio (model, ctx)".
- **US-002**: `anymodel proxy --lmstudio --model <id>` and `--llamacpp` flags force selection with preset base URL.
- **US-003**: Banner shows backend fingerprint (name, version if available, quant, ctx) via `/v1/models` probe.
- **US-004**: `ANYMODEL_NO_PROBE=1` disables capability probing (pure-proxy-mode friendliness).
- **US-005**: CONTRIBUTING.md documents the alias→full provider promotion path.
- **Out of scope**: `cache_prompt`, `n_gpu_layers`, and other llama.cpp knobs (deferred to a follow-up increment when a concrete user request lands).

**Alternative paths**:
- `sw:brainstorm "local backend providers" --resume --depth deep --lens triz` — run constraint inversion if you want to stress-test the "no quirks" assumption before committing.
- Park for later if the pure-proxy-mode rollout (0005) needs stabilization first.
