# AnyModel Live Baseline Test — Claude Code → local Qwen3-Coder via LM Studio

**Date:** 2026-05-30
**Subject:** AnyModel v1.12.0 (matches npm `anymodel@1.12.0`)
**Source under test:** `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel`
**Target backend:** LM Studio MLX server at `http://localhost:1234`, model `qwen/qwen3-coder-30b` (qwen3_moe, 30.5B total / 3.3B active, 256K native ctx).
**Machine:** MacBook Pro M4 Max, 128GB unified RAM, macOS 26.5.

> No AnyModel source was modified during baseline capture. This is the *before* state.

---

## Verdict: BASELINE GREEN

| Protocol case | Result |
|---|---|
| Plain chat (`/v1/messages`) | **PASS** |
| Tool-call elicitation (`tools[]` → `tool_use`) | **PASS** |
| SSE streaming (`stream:true`) | **PASS** |
| Multi-turn `tool_result` round-trip | **PASS** |

The current, unmodified proxy correctly drives local Qwen3-Coder-30B through Claude Code's Anthropic `/v1/messages` protocol against LM Studio's OpenAI-compatible `/v1/chat/completions`. All four protocol cases passed twice (re-run to rule out the transient harness output-delivery lag that produced two earlier false negatives).

---

## Step 1 — LM Studio confirmed live

```bash
curl -s http://localhost:1234/v1/models
```

Returned JSON including `id: "qwen/qwen3-coder-30b"` (also present: `qwen/qwen3-coder-next` (80B), gemma-4 variants, llama-3.2-3b, text-embedding-nomic). Server live on `:1234`.

> Nuance worth recording: LM Studio surfaces *more* loaded models than just nomic embeddings — gemma-4 and llama-3.2-3b are also loaded. (This corrects the original brief, which implied only nomic embeddings besides the qwen pair.)

## Step 2 — Exact working launch flags

Derived from `cli.mjs --help`, `cli.mjs` `parseArgs`/`startProxyOnly`, and `LOCAL_SETUP.md`.

```bash
cd /Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel
unset OPENROUTER_API_KEY OPENAI_API_KEY        # else auto-detect prefers openrouter/openai
LMSTUDIO_BASE_URL=http://localhost:1234/v1 \
  nohup node cli.mjs proxy lmstudio --model qwen/qwen3-coder-30b --port 9099 \
  > /tmp/anymodel_baseline.log 2>&1 &
```

- subcommand `proxy`; provider `lmstudio`; `--model qwen/qwen3-coder-30b`; `--port 9099` (default 9090).
- env `LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234/v1`). No API key needed for local.
- With `--model` omitted, `cli.mjs` calls `provider.listModels()` and auto-picks a loaded coding model, preferring a `qwen3-coder` regex — so `node cli.mjs proxy lmstudio` alone selects `qwen/qwen3-coder-30b` when it is the loaded coder. For the 80B: `--model qwen/qwen3-coder-next`.

**Startup banner** (`/tmp/anymodel_baseline.log`, PID 38699):

```
anymodel v1.12.0
Proxy on :9099
/v1/messages -> lmstudio (qwen/qwen3-coder-30b @ http://localhost:1234/v1)
everything else -> passthrough
Retries: 3 with exponential backoff
Model override: qwen/qwen3-coder-30b
Rate limit: 60 req/min
```

**Health check:**

```bash
curl -s http://localhost:9099/health
# {"status":"ok","version":"1.12.0","provider":"lmstudio",
#  "model":"qwen/qwen3-coder-30b","uptime":26,...}
```

All probes used `http://localhost:9099/v1/messages` with headers
`x-api-key: anymodel-proxy` and `anthropic-version: 2023-06-01`.

## Step 3 — Raw response snippets

### (a) Plain chat — PASS

Request:
```json
{"model":"qwen/qwen3-coder-30b","max_tokens":128,
 "messages":[{"role":"user","content":"Reply with exactly: BASELINE_OK and nothing else."}]}
```
Response (HTTP 200):
```json
{"type":"message","role":"assistant",
 "content":[{"type":"text","text":"BASELINE_OK"}],
 "model":"qwen/qwen3-coder-30b","stop_reason":"end_turn","stop_sequence":null,
 "usage":{"input_tokens":19,"output_tokens":4}}
```
Correct Anthropic envelope, `stop_reason: end_turn`, usage present.

### (b) Tools[] (`run_bash{cmd}`) — PASS

Request added:
```json
"tools":[{"name":"run_bash","description":"Run a bash command and return stdout.",
 "input_schema":{"type":"object","properties":{"cmd":{"type":"string"}},"required":["cmd"]}}]
```
prompt: "Use the run_bash tool to run: echo hello…"

Response (HTTP 200):
```json
{"type":"message","role":"assistant",
 "content":[{"type":"tool_use","id":"682496611","name":"run_bash","input":{"cmd":"echo hello"}}],
 "stop_reason":"tool_use","usage":{"input_tokens":297,"output_tokens":25}}
```
Exactly the required shape: `stop_reason:"tool_use"` + a `tool_use` block with correct name and well-formed input. OpenAI `tool_calls` correctly translated back to Anthropic `tool_use`.

### (c) Streaming (`stream:true`) — PASS

`content-type: text/event-stream`. Full Anthropic SSE sequence present:
`message_start → content_block_start → content_block_delta (×N) → content_block_stop → message_delta → message_stop`.
Reassembled text: "One, two, three." (run 1: "One, two, three - that's a count of three items."). Proper Anthropic streaming events, not raw OpenAI chunks.

### (d) 2-turn tool_result flow — PASS

Turn 1: `tool_use` id `677686442`, input `{cmd:"echo 42"}`, `stop_reason:tool_use`.
Turn 2 messages: `[user, assistant(tool_use), user(tool_result tool_use_id="677686442" content "42")]`.
Response (HTTP 200):
```json
{"content":[{"type":"text","text":"The output of the command `echo 42` is `42`."}],
 "stop_reason":"end_turn","usage":{"input_tokens":337,"output_tokens":17}}
```
Coherent final answer incorporating the injected `tool_result`; multi-turn assistant/tool_result history round-trips through the OpenAI translation correctly.

## Step 4 — Cleanup

```bash
kill 38699                                                   # -> KILLED_38699
curl -o /dev/null -w '%{http_code}' http://localhost:1234/v1/models   # -> 200 (:1234 untouched)
```
Only the proxy PID started for the test was killed; LM Studio left running.

---

## What the baseline PROVED works (do NOT regress)

1. **Plain chat** end-to-end with a correct Anthropic message envelope, stop_reason, and usage.
2. **Tool-call elicitation**: OpenAI `tool_calls` → Anthropic `tool_use` with object `input`, `stop_reason:"tool_use"`, faithful `id` correlation.
3. **SSE streaming** of plain text: the full Anthropic event sequence is emitted (when LM Studio sends `data: [DONE]`).
4. **Multi-turn tool_result round-trip**: `tool_use.id` ↔ `tool_result.tool_use_id` survives translation; the model produces a coherent follow-up.

## What the baseline did NOT exercise (still suspect — see improvement plan)

- **Streaming that ends WITHOUT `data: [DONE]`** — LM Studio happened to emit `[DONE]` in these probes, so the missing-`flush()` truncation bug (proxy.mjs:707) was NOT triggered. It remains a real, code-verified defect that the happy-path baseline cannot disprove.
- **Parallel/batched tool calls in one streamed turn** — only sequential single tool calls were tested; the `blockIndex-1` misroute bug (openai.mjs streaming) is untriggered by this baseline.
- **Tool calls emitted into the text channel** (Qwen XML / Hermes tags) — not observed in these probes, but a code-verified gap with no recovery path.
- **Images / documents / `is_error` tool results** — not sent by the baseline probes; all code-verified as dropped/lost.
- **Long time-to-first-token** (80B `qwen3-coder-next` on a large prompt) — no heartbeat/ping exists; idle-timeout drops are untested.
- **Stuck/silent upstream** — no upstream socket timeout exists; a hung model would hang the loop forever (untested here).

## Files

- `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/cli.mjs`
- `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/proxy.mjs`
- `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/README.md`
- `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/LOCAL_SETUP.md`
- `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel/package.json` (v1.12.0)
- `/tmp/anymodel_baseline.log`, `/tmp/baseline_probe.mjs`, `/tmp/baseline_results.json`
