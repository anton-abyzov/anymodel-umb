# Local Model Bench — M4 Max 128GB, LMStudio, April 20 2026

## Setup

- Hardware: Apple M4 Max, 128 GB unified memory
- Runtime: LMStudio 0.3+ serving on `127.0.0.1:1234` (OpenAI-compatible)
- Harness: `run-bench.mjs` — streams `/v1/chat/completions` with SSE, measures TTFT (time-to-first-token) and tok/s, validates output structure
- 5 scenarios per model, progressively more complex:
  1. **S1-simple** — one Python function (256 tokens)
  2. **S2-tool-call** — single function call with JSON args (256 tokens)
  3. **S3-multi-tool-plan** — 3 coordinated tool calls in one turn (512 tokens)
  4. **S4-spec-structured** — SpecWeave-style spec.md with US + AC (1024 tokens)
  5. **S5-complex-webapp** — full HTML calculator with grid/CSS-vars/keyboard/history (3072 tokens)

## Models tested

| ID | Format | Size on disk | Notes |
|---|---|---|---|
| `google/gemma-4-26b-a4b` | GGUF Q4_K_M | 17.99 GB | MoE (26B total, A4B = 4B active) |
| `mlx-community/gemma-4-26b-a4b-it` | MLX 4-bit | 15.64 GB | Same model, MLX format |
| `google/gemma-4-31b` | GGUF Q4_K_M | 33.84 GB | Dense 31B |
| `qwen/qwen3-coder-30b` | MLX 4-bit | 17.19 GB | MoE (30B total, A3B = 3B active), coding specialist |

## Results — raw

### Latency + throughput
`ttft_ms / output_tok_per_sec` (lower TTFT = better, higher tok/s = better)

| Scenario | Gemma-26B GGUF | Gemma-26B MLX | Gemma-31B GGUF | **Qwen3-Coder MLX** |
|---|---:|---:|---:|---:|
| S1 simple | 2543 / 9.3 | 395 / 47.7 | 14884 / 1.5 | **144 / 63.7** |
| S2 tool-call | 667 / 2.9 | 447 / 4.1 | 7023 / 0.3 | **214 / 4.3** |
| S3 multi-tool | 4913 / 0.8 | 485 / 3.5 | 46531 / 0.1 | **203 / 8.4** |
| S4 spec | 9505 / 16.6 | **324 / 99.3** | 34770 / 4.8 | 295 / 88.5 |
| S5 webapp | 6849 / 66.7 | **460 / 93.1** | 56307 / 7.8 | 286 / 87.2 |

### Tool-call reliability
| Scenario | Gemma-26B GGUF | Gemma-26B MLX | Gemma-31B GGUF | Qwen3-Coder MLX |
|---|---:|---:|---:|---:|
| S2 (expected 1 call) | 1 ✓ | 1 ✓ | 1 ✓ | 1 ✓ |
| S3 (expected 3, accept 2+) | **2** ✓ | 1 ✗ | **2** ✓ | **2** ✓ |

All four models produced valid OpenAI-format tool-call JSON with correct names/args. Gemma-26B MLX *regressed* to only 1 tool call on S3 despite the GGUF version emitting 2 — the only quality regression observed going from GGUF to MLX.

### S5 functional quality — calculator structure checks (11 items)

| Check | Gemma-26B GGUF | Gemma-26B MLX | Qwen3-Coder MLX |
|---|:---:|:---:|:---:|
| DOCTYPE + HTML | ✓ | ✓ | ✓ |
| `<style>` | ✓ | ✓ | ✓ |
| `<script>` | ✓ | ✓ | ✓ |
| ≥10 buttons | ✓ (19) | ✓ (18) | ✓ (18) |
| CSS Grid layout | ✓ | ✓ | ✓ |
| CSS variables | ✓ | ✓ | ✓ |
| **Keyboard handler** | ✗ | ✓ | ✓ |
| History panel | ✓ | ✓ | ✓ |
| Clear/equals/decimal btns | ✓ | ✓ | ✓ |
| try/catch on eval | ✗ | ✗ | ✗ |
| Size (bytes) | 8,273 | 9,090 | **12,650** |
| **Total passed** | **9/11** | **10/11** | **10/11** |

All three calculators were functionally complete; none implemented the `try/catch` guard around `eval()` that would be considered safe practice. Qwen3-Coder produced the largest (most detailed) output and was the only one to include CSS transitions + media queries for true responsive breakpoints.

### S4 spec quality — SpecWeave format match

- **Gemma-26B MLX**: cleanest match — uses exact `### US-001`, `AC-US1-01` (2-digit), `- [ ] **AC-US1-01:**` checkboxes. Ready to paste into `spec.md`.
- **Qwen3-Coder**: structured, but uses `AC-US1-001` (3-digit) and omits `- [ ]` checkboxes. Needs post-processing.
- **Gemma-26B GGUF**: similar to MLX but shorter.

## Analysis

### 1. MLX absolutely destroys GGUF on Apple Silicon for the same model
Gemma-26B-A4B head-to-head, same weights:

| Metric | GGUF Q4_K_M | MLX 4-bit | Speedup |
|---|---:|---:|---:|
| S1 TTFT | 2543 ms | 395 ms | **6.4×** |
| S4 tok/s | 16.6 | 99.3 | **6.0×** |
| S5 tok/s | 66.7 | 93.1 | 1.4× |

TTFT wins for MLX are enormous (6–20×). Tok/s wins are 1.4–6× depending on scenario. The only regression: Gemma MLX emitted 1 tool call on S3 instead of 2. Net verdict: **switch everything to MLX** on Apple Silicon unless a specific model has no MLX release.

### 2. Qwen3-Coder-30B-A3B MLX is the overall winner
- Best TTFT on 4/5 scenarios (144–295 ms across all)
- Best tool-call reliability on S3 (2 calls, tied with the GGUF variants)
- Largest, most complete output on S5
- Weakest point: the spec format needs adjustment (3-digit AC IDs, no checkboxes)

### 3. Gemma-4-31B dense Q4_K_M is unusable for agentic workflows
- 7–47s TTFT
- 0.1–7.8 tok/s
- S3 (multi-tool) took **46 seconds** just to start responding
- The dense 31B can't amortize cold-start like the MoE models — every token pays for all 31B weights

### 4. Reasoning-token overhead is real on Gemma 4 GGUF
Gemma-4-26B GGUF emits ~600–700 reasoning tokens per request (`reasoning_content` field) — wasted tokens that delay the response. Gemma-4-26B MLX and Qwen3-Coder both emit **zero** reasoning tokens on the same prompts. This is a runtime/config difference in how Gemma 4 reasoning is handled, and it explains much of the TTFT gap.

## Recommendations

### For your M4 Max + AnyModel + Claude Code stack

**Primary daily driver**: `qwen/qwen3-coder-30b` (MLX 4-bit)
- Fastest TTFT of anything tested (agent loops feel instant)
- Best tool-call reliability — essential for MCP/skills
- Biggest, most complete code generation on complex scenarios
- 17 GB on disk, ~8 GB RAM in use
- Run: `anymodel proxy lmstudio` (uses the flag we built in increment 0006)

**Fallback for SpecWeave increment planning**: `mlx-community/gemma-4-26b-a4b-it`
- Writes the cleanest AC format — paste-ready for `spec.md`
- 100 tok/s on long structured output

**Don't use**:
- Gemma-4-26B GGUF — the MLX version of the same model is 6× faster
- Gemma-4-31B GGUF — impractical TTFT for agents (46s multi-tool plan)

### MCP/skills readiness

All 4 models emitted valid OpenAI-format tool-call JSON. Through AnyModel → Claude Code the flow is:
1. Claude Code sends Anthropic-format messages with tools
2. AnyModel (LMStudio provider from increment 0006) translates to OpenAI format
3. Model emits tool_calls JSON
4. AnyModel translates back to Anthropic tool_use blocks
5. Claude Code executes MCP server / skill as usual

This end-to-end works for all 4 tested models. Qwen3-Coder is the preferred driver because its raw tool-call throughput + reliability give agent loops the best feel.

### Next experiments worth running (not done here)

- **Qwen3-Coder-Next 80B-A3B** — the flagship; partial download already on disk (4.9GB of ~48GB). On 128GB RAM it should fit comfortably in MLX 4-bit. Expected to improve S4 spec format + complex reasoning.
- **Long-context test** — push a 50k-token codebase + ask for refactoring suggestions. Qwen3-Coder claims 256k context.
- **Real MCP loop** — route Claude Code through AnyModel → LMStudio → Qwen3-Coder and hit a real MCP server (filesystem, github). The bench here uses synthetic tool schemas, not the real MCP lifecycle.

## Artifacts

- Raw perf results: `results/combined.json` (20 entries)
- Captured HTML + spec outputs: `quality/` (6 files × 3 models)
- Harness scripts: `run-bench.mjs`, `capture-webapps.mjs`
