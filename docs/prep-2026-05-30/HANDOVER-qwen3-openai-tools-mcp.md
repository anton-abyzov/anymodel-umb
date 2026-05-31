# HANDOVER — Qwen3-Coder Tool Calling, OpenAI ↔ Anthropic Translation, MCP, and AnyModel

**Date:** 2026-05-30
**Author:** prep research session (Claude Code, Opus 4.8)
**Purpose:** Cold-start brief for another Claude Code session that needs to drive **local Qwen3-Coder** (via LM Studio MLX) from **Claude Code** through the **AnyModel** Anthropic→OpenAI proxy, and understand exactly where tool calls / MCP fit.
**Status of facts below:** Web claims are cited inline. Two load-bearing claims were **verified empirically** on this machine against `http://localhost:1234` on 2026-05-30 (see [§7 Working curl examples](#7-working-curl-examples-verified-on-this-machine)).

---

## 0. TL;DR (read this first)

1. **Qwen3-Coder uses the standard OpenAI `tools` / `tool_calls` JSON schema at the API boundary.** Internally it does **not** emit OpenAI JSON — it emits a **custom XML tool-call format** (`<tool_call><function=name><parameter=...>`). The inference server's **tool-call parser** converts that XML back into OpenAI `tool_calls`. ([vLLM tool_calling](https://docs.vllm.ai/en/latest/features/tool_calling/), [QwenLM/Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder))
2. **The parser choice is the #1 failure point.** Qwen3-Coder needs `--tool-call-parser qwen3_coder` (or `qwen3_xml`). Non-Coder Qwen3 needs `hermes`. Wrong/missing parser ⇒ the tool call is left as **raw XML text in `content`** and `tool_calls` is empty/null. ([vLLM tool_calling](https://docs.vllm.ai/en/latest/features/tool_calling/), [vLLM #29192](https://github.com/vllm-project/vllm/issues/29192))
3. **On this machine, LM Studio already does the parsing correctly** for `qwen/qwen3-coder-30b` — verified: clean `tool_calls`, `finish_reason: "tool_calls"`. LM Studio also exposes a **native Anthropic `/v1/messages`** endpoint that returns Anthropic-shaped `tool_use` blocks directly (verified).
4. **The model never speaks MCP.** Claude Code (the host) connects to MCP servers, lists their tools, and injects them into the request as **ordinary Anthropic `tools[]`**. Qwen sees them as plain functions. Results come back as `tool_result` blocks. The proxy must preserve all of this byte-faithfully. ([MCP architecture](https://modelcontextprotocol.io/docs/concepts/architecture))
5. **AnyModel's job** (`providers/openai-local.mjs`) is the field-level translation Anthropic↔OpenAI: `input_schema`↔`function.parameters`, `tool_use`↔`tool_calls`, `tool_result`↔`role:tool`, `tool_choice` shapes, and top-level `system`↔system message. If you point AnyModel at LM Studio's **OpenAI** endpoint it translates; if you point Claude Code at LM Studio's **native `/v1/messages`** you can skip AnyModel for simple cases.

---

## 1. Machine & runtime facts (this box)

| Item | Value |
|---|---|
| Hardware | MacBook Pro M4 Max, 128 GB unified RAM |
| OS | macOS 26.5 |
| Inference server | **LM Studio (MLX)** at `http://localhost:1234` |
| Endpoints exposed | OpenAI `/v1/chat/completions`, OpenAI `/v1/models`, **native Anthropic `/v1/messages`** (validated: `tool_use` works) |
| Models available (verified via `/v1/models` 2026-05-30) | `qwen/qwen3-coder-30b` (qwen3_moe), `qwen/qwen3-coder-next` (qwen3_next/80B), `google/gemma-4-31b`, `google/gemma-4-26b-a4b` (+ MLX/it variants), `llama-3.2-3b-instruct`, `text-embedding-nomic-embed-text-v1.5` |
| AnyModel source (authoritative) | `/Users/antonabyzov/Projects/github/anymodel-umb/repositories/antonoly/anymodel` (matches npm `anymodel@1.12.0`) |
| AnyModel default proxy port | `9090` |

**Model facts — `qwen/qwen3-coder-30b`** ([HF model card](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct)):
- Architecture: **Mixture-of-Experts** (`qwen3_moe`), **30.5B total / 3.3B active**, 128 experts (8 active), 48 layers, GQA 32 Q-heads / 4 KV-heads.
- Native context: **262,144 tokens (256K)**; Qwen3-Coder README suggests a working context of **65,536** for agentic use.
- Recommended sampling (Qwen3-Coder): **temperature 0.7, top_p 0.8, top_k 20, repetition_penalty 1.05** ([QwenLM/Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder)).
- **Non-thinking mode only** — "does not generate `<think></think>` blocks." Recommended output length **65,536 tokens**. Requires `transformers>=4.51.0` (else `KeyError: 'qwen3_moe'`).
- Tool calling: supports agentic coding + function calling; Qwen recommends **Qwen-Agent**, which "encapsulates the tool-call templates and tool-call parsers." Qwen-Agent default tool-call prompt for Qwen3 is `fncall_prompt_type: 'nous'` and it supports parallel function calls + `mcpServers` config ([QwenLM/Qwen-Agent](https://github.com/QwenLM/Qwen-Agent)).

**`qwen/qwen3-coder-next`** = `qwen3_next` 80B-class; same tool-calling family. Heavier; prefer `-30b` for fast agentic loops unless quality requires the bigger model.

---

## 2. How Qwen3-Coder does tool calling (model + chat template)

### 2.1 At the API boundary: standard OpenAI schema
A served OpenAI endpoint (LM Studio / vLLM / llama.cpp) accepts tools in the OpenAI shape and returns `tool_calls`:

```json
// request tools[]
{ "type": "function",
  "function": { "name": "get_weather", "description": "...",
                "parameters": { "type":"object", "properties":{...}, "required":[...] } } }

// response message
{ "role":"assistant", "content":"",
  "tool_calls":[ {"id":"...","type":"function",
    "function":{"name":"get_weather","arguments":"{\"city\":\"Paris\"}"}} ] }
```
`arguments` is a **JSON-encoded string**, not an object (OpenAI convention). ([Qwen function_call docs](https://qwen.readthedocs.io/en/latest/framework/function_call.html))

### 2.2 Under the hood: the chat template + special tokens
- Qwen3 (non-Coder) uses **Hermes-style** tool use already baked into `tokenizer_config.json`: the model emits `<tool_call>{"name":...,"arguments":{...}}</tool_call>` (JSON inside Hermes tags). vLLM parses this with `--tool-call-parser hermes`. ([Qwen function_call docs](https://qwen.readthedocs.io/en/latest/framework/function_call.html), [vLLM tool_calling](https://docs.vllm.ai/en/latest/features/tool_calling/))
- **Qwen3-Coder is different.** It uses a **custom XML format** for both the tool definitions injected into the prompt and the tool calls it emits — *not* Hermes JSON. The emitted shape is approximately:

```xml
<tool_call>
<function=get_weather>
<parameter=city>
Paris
</parameter>
</function>
</tool_call>
```
This requires the dedicated `qwen3coder_tool_parser.py` to turn XML back into OpenAI `tool_calls`. ([vLLM tool_calling](https://docs.vllm.ai/en/latest/features/tool_calling/), [vLLM qwen3coder_tool_parser](https://docs.vllm.ai/en/latest/api/vllm/tool_parsers/qwen3coder_tool_parser/), [QwenLM/Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder))

### 2.3 Serving flags (what makes `tool_calls` populate)
| Server | Qwen3 (Instruct) | Qwen3-Coder |
|---|---|---|
| **vLLM** | `--enable-auto-tool-choice --tool-call-parser hermes` | `--enable-auto-tool-choice --tool-call-parser qwen3_coder` (alt: `qwen3_xml`) |
| **SGLang** | recommended for Qwen3-Coder serving | recommended for Qwen3-Coder serving |
| **LM Studio (MLX)** | built-in parser — **works out of the box on this machine** (verified) | built-in parser — **works out of the box** (verified, §7) |
| **llama.cpp** | needs a Qwen3-Coder-aware tool parser; historically lagging — see [llama.cpp #15012](https://github.com/ggml-org/llama.cpp/issues/15012) |

Tool-call functionality in vLLM requires **v0.10.0+** ([vLLM Qwen3-Coder recipe](https://docs.vllm.ai/projects/recipes/en/latest/Qwen/Qwen3-Coder-480B-A35B.html)).

### 2.4 Recommended sampling for tool turns
- Qwen3-Coder: **temp 0.7, top_p 0.8, top_k 20, repetition_penalty 1.05** ([QwenLM/Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder)). For deterministic agentic tool selection many practitioners drop temperature toward 0.2–0.3; start with the official values.
- **Do NOT use stopword-based templates (ReAct) with reasoning-mode Qwen3** — the model can emit stopwords inside its thinking section and corrupt tool calls. Use the native Hermes/Coder tool template instead. ([Qwen function_call docs](https://qwen.readthedocs.io/en/latest/framework/function_call.html))
- For Qwen3 *Instruct* (thinking-capable) you can disable thinking via `chat_template_kwargs: {"enable_thinking": false}`. Qwen3-**Coder**-Instruct is non-thinking by default.

### 2.5 The classic failure: "tool calls land in content as text"
If the server has **no parser / the wrong parser / a chat-template mismatch**, the raw `<tool_call>…</tool_call>` XML appears in `message.content` and `tool_calls` is empty — the client (Claude Code) then sees prose instead of a tool invocation and the agent loop stalls. ([vLLM tool_calling](https://docs.vllm.ai/en/latest/features/tool_calling/), [vLLM #29192](https://github.com/vllm-project/vllm/issues/29192))
Related real-world bugs: the default `qwen3_coder` parser has produced an infinite `!!!!` stream on long tool inputs (switch to `qwen3_xml`); and XML tool calls emitted inside the *reasoning* region can yield populated reasoning but empty `tool_calls`. ([HF Qwen3-Coder-Next discussion #17](https://huggingface.co/Qwen/Qwen3-Coder-Next/discussions/17), [NVIDIA dev forum](https://forums.developer.nvidia.com/t/qwen3-5-tool-calling-finally-fixed-possibly/366451))
**Security note:** vLLM's Qwen3-Coder tool parser had an RCE via `eval()` during param conversion — keep vLLM patched ([GHSA-79j6-g2m3-jgfw](https://github.com/vllm-project/vllm/security/advisories/GHSA-79j6-g2m3-jgfw)). Not relevant to LM Studio but note if you switch servers.

---

## 3. How MCP fits (the model never speaks MCP)

MCP is **host ↔ client ↔ server** (JSON-RPC). The host (Claude Code) embeds an MCP client, connects to MCP servers, calls `tools/list` to discover tools, then **surfaces those tools to the LLM in the model's own function-calling format**. The model emits a normal function/tool call; the host intercepts it, invokes the MCP tool via `tools/call`, and feeds the result back. **The model never sees or speaks the MCP wire protocol.** ([MCP architecture](https://modelcontextprotocol.io/docs/concepts/architecture))

Consequence for this stack:
- An MCP tool is, by the time it reaches Qwen, **just another entry in `tools[]`** — identical in shape to a built-in tool. Qwen3-Coder does not need to know MCP exists.
- Qwen-Agent does the same thing locally: you give it `{"mcpServers": {...}}`, it converts every MCP tool into the function-calling format the model understands, then dispatches calls back to the right MCP server. ([QwenLM/Qwen-Agent](https://github.com/QwenLM/Qwen-Agent))

**What a translating proxy MUST preserve** so MCP keeps working through it:
1. Every tool in `tools[]` (name, description, full JSON-Schema `input_schema`) — do not silently drop MCP tools.
2. Tool-call **`id`** round-trip: the `tool_use.id` the assistant produced must match the `tool_result.tool_use_id` on the way back (OpenAI side: `tool_calls[].id` ↔ `messages[].tool_call_id`).
3. Tool **names** verbatim (MCP tool names can be namespaced like `mcp__server__tool`).
4. `tool_result` content and `is_error`.
5. Ordering: assistant `tool_use` turn → user `tool_result` turn.

---

## 4. Anthropic ↔ OpenAI tool-calling translation table (field-level)

This is the core of what AnyModel's `convert*` functions do. Source of truth: [Anthropic tool use](https://docs.claude.com/en/docs/build-with-claude/tool-use/overview) + [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling) + observed LM Studio behavior.

| Concept | **Anthropic Messages** (`/v1/messages`, what Claude Code sends) | **OpenAI Chat Completions** (`/v1/chat/completions`, what Qwen server wants) |
|---|---|---|
| System prompt | **Top-level** `system` (string *or* array of `{type:"text",text}` blocks) | A message: `{"role":"system","content":"..."}` prepended to `messages[]` |
| Tool definition | `tools[]`: `{name, description, input_schema}` (JSON-Schema directly) | `tools[]`: `{type:"function", function:{name, description, parameters}}` — schema nested under `function.parameters` |
| Tool definition — empty schema | `input_schema` may be missing/empty | must be valid JSON-Schema; use `{type:"object",properties:{},additionalProperties:false}` |
| Assistant calls a tool | content block `{type:"tool_use", id, name, input}` where **`input` is an object** | `message.tool_calls[]`: `{id, type:"function", function:{name, arguments}}` where **`arguments` is a JSON string** |
| Tool result (back to model) | a **user** message with content block `{type:"tool_result", tool_use_id, content, is_error}` | a message `{role:"tool", tool_call_id, content}` (string). No `is_error` field — encode errors in `content` |
| Multiple tool calls | multiple `tool_use` blocks in one assistant message | array of `tool_calls` in one assistant message |
| `tool_choice` = auto | `{"type":"auto"}` | `"auto"` (string) |
| `tool_choice` = must use any | `{"type":"any"}` | `"required"` (string) |
| `tool_choice` = force specific | `{"type":"tool","name":"X"}` | `{"type":"function","function":{"name":"X"}}` |
| `tool_choice` = none | `{"type":"none"}` | `"none"` |
| Stop reason (tool) | `stop_reason: "tool_use"` | `finish_reason: "tool_calls"` |
| Stop reason (normal) | `"end_turn"` | `"stop"` |
| Stop reason (truncated) | `"max_tokens"` | `"length"` |
| Token usage | `usage:{input_tokens, output_tokens}` | `usage:{prompt_tokens, completion_tokens, total_tokens}` |
| Output text | content block `{type:"text", text}` | `message.content` (string) |
| Tool id format | `toolu_…` (Anthropic convention) | provider-defined string (LM Studio returns plain numeric/`call_…`) |

**Critical, easy-to-miss gotchas**
- `input` (object) vs `arguments` (stringified JSON) — must `JSON.stringify` outbound, `JSON.parse` inbound.
- `tool_use_id` ↔ `tool_call_id` field-name change AND value must round-trip.
- Anthropic `tool_result` lives in a **user** turn; OpenAI uses a dedicated **`tool`** role.
- Anthropic `tool_choice:"any"` → OpenAI `"required"` (NOT `"any"`).
- Forced-tool shapes differ (`{type:"tool",name}` vs `{type:"function",function:{name}}`).

---

## 5. How AnyModel implements this (code map)

Authoritative sources reviewed (do **not** review `cli.js`, the 13 MB bundle):

### `proxy.mjs` (960 lines) — the request/response pipeline
- Routes `/v1/messages` → provider; everything else → passthrough to `api.anthropic.com` (and mocks `/api/auth*` and `/count_tokens`).
- `sanitizeBody()` strips Anthropic-only fields (`betas`, `metadata`, `thinking` for local, `cache_control`, `defer_loading`, `eager_input_streaming`, `strict`), clamps `max_tokens>=16`, **fixes empty tool schemas** to the canonical `{type:"object",properties:{},additionalProperties:false}` (recursively, incl. `anyOf/oneOf/allOf/items`), and **normalizes `tool_choice` string→object**.
- Since **1.12.0** it no longer injects `_unused`/`_placeholder` schema hacks, so real params named `_unused` round-trip (US-004 fix).
- Local-provider path (`ollama|lmstudio|llamacpp`): capability-aware tool passing, schema compression / budgeting (`tool-compressor.mjs`), system-prompt condensing, XML-boilerplate stripping (`<system-reminder>` etc.), message-history condensing. **These are aggressive — see pitfalls §6.**
- `sanitizeToolUseResponse()` guarantees each `tool_use` block has `id`/`name`/object `input`; drops nameless blocks.

### `providers/openai-local.mjs` — the local OpenAI-compatible provider **factory** `makeOpenAILocalProvider({name, defaultPort, envVar, bearerStub, v0Probe})`
This factory powers **both** `lmstudio` and `llamacpp` (US-001, 1.12.0 — merged the old near-duplicate modules). It does **not** itself contain the field translation; it wires `buildRequest` (POSTs to `<base>/chat/completions`, forces `127.0.0.1` to avoid Node's `localhost`→IPv6 `::1` ECONNREFUSED, sends a stub Bearer the server ignores), `detect`, `listModels` (LM Studio probes `/api/v0/models` for loaded-state via `v0Probe:true`, then falls back to `/v1/models`), and delegates the actual Anthropic↔OpenAI conversion to `openai.mjs`:
- `transformRequest: translateRequest`
- `transformResponse: translateResponse`
- `createStreamTranslator`

Concrete instances (thin wrappers, each just calls the factory):
- `providers/lmstudio.mjs` → `{name:'lmstudio', defaultPort:1234, envVar:'LMSTUDIO_BASE_URL', bearerStub:'lm-studio', v0Probe:true}`
- `providers/llamacpp.mjs` → `{name:'llamacpp', defaultPort:8080, envVar:'LLAMACPP_BASE_URL', bearerStub:'no-key', v0Probe:false}`

### `providers/openai.mjs` (14.6 KB — the actual field-level translation) implements the §4 table
`translateRequest()` / `translateResponse()` / `createStreamTranslator()` do exactly:
- Tools: `{name,description,input_schema}` → `{type:"function",function:{name,description,parameters}}`.
- Messages: top-level `system` → system message; Anthropic `tool_result` blocks → `{role:"tool",tool_call_id,content}`; assistant `tool_use` blocks → `tool_calls[]` with `arguments: JSON.stringify(input)`.
- Response: `message.content` → text block; `tool_calls[]` → `tool_use` blocks with `input: JSON.parse(arguments)`; `finish_reason`→`stop_reason` (`tool_calls`→`tool_use`, `length`→`max_tokens`, else `end_turn`); `prompt_tokens/completion_tokens`→`input_tokens/output_tokens`.
- Streaming: OpenAI SSE → Anthropic SSE (`message_start`, content-block start/delta/stop, tool-call accumulators keyed by `index`).

### Registry & defaults
- **No `providers/index.mjs`.** `cli.mjs` resolves a provider by dynamic import: `await import('./providers/${providerName}.mjs')`. Known providers: `PROVIDERS = ['openrouter','ollama','openai','lmstudio','llamacpp']`; `LOCAL_PROVIDERS = ['ollama','lmstudio','llamacpp']`.
- Defaults: `lmstudio` → `http://127.0.0.1:1234/v1` (`LMSTUDIO_BASE_URL`), `llamacpp` → `http://127.0.0.1:8080/v1` (`LLAMACPP_BASE_URL`).
- `package.json`: `anymodel@1.12.0`, `bin: anymodel → ./cli.mjs`, tests via `node --test test/*.test.mjs`.
- Auto-detect order (`cli.mjs`): ollama → **lmstudio** → llamacpp (first that responds to `/v1/models` wins).
- MCP behavior (from `LOCAL_SETUP.md`, 1.11.0+): for **local** providers AnyModel auto-suppresses global MCP and loads project `./.claude/.mcp.json` if present; opt out with `--full-mcp` / `ANYMODEL_FULL_MCP=1`. Remote providers keep all global MCP.

---

## 6. Pitfalls & fixes

| Pitfall | Symptom | Fix |
|---|---|---|
| Wrong/no tool parser on the server | Tool call appears as XML text in `content`; `tool_calls` empty; agent loop stalls | Qwen3-Coder ⇒ `qwen3_coder` (or `qwen3_xml`); non-Coder Qwen3 ⇒ `hermes`. LM Studio: already correct here (verified) |
| Using `hermes` parser for Qwen3-**Coder** | Empty/garbled `tool_calls` (Coder is XML, not Hermes JSON) | Use `qwen3_coder`/`qwen3_xml` |
| `arguments` left as object (not stringified) when going Anthropic→OpenAI | Server rejects or mis-parses tool call | `JSON.stringify(block.input)` (AnyModel does this) |
| `tool_use_id` not mapped to `tool_call_id` | "tool_result without matching tool_use" / orphaned results | Round-trip the id both directions (AnyModel does this) |
| Anthropic `tool_choice:"any"` sent verbatim to OpenAI | Server rejects `"any"` | Map to `"required"` |
| Empty `input_schema` | Strict OpenAI/vLLM parsers reject the tool | `{type:"object",properties:{},additionalProperties:false}` (AnyModel `sanitizeBody`) |
| `thinking` passed to a reasoning model via local path | Model burns output tokens on hidden CoT instead of calling tools | AnyModel strips `thinking` for local providers |
| Claude Code's 90+ tools + 200 KB system prompt on a 30B model | Minutes of prefill before first token; context blow-out | AnyModel condenses system prompt, compresses/budgets tools, strips `<system-reminder>` boilerplate. **But** tool compression/dropping can remove an MCP tool the model needed — if a tool "disappears", raise `LOCAL_MAX_TOOLS`/`LOCAL_TOOL_BUDGET_PCT` or set the tool mode to keep all |
| Over-condensing message history | Lost tool-call/tool-result pairing mid-conversation | Tune `LOCAL_MAX_MSG_CHARS`; ensure assistant `tool_use` and its `tool_result` survive together |
| ReAct/stopword templates with thinking models | Stopwords inside thoughts corrupt tool parsing | Use native Hermes/Coder template, not ReAct |
| Forcing a specific tool | Shapes differ | `{type:"tool",name}` ↔ `{type:"function",function:{name}}` |

---

## 7. Working curl examples (verified on this machine)

### 7a. OpenAI endpoint, Qwen3-Coder, tool call — **VERIFIED 2026-05-30**
```bash
curl -s http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3-coder-30b",
    "messages": [{"role":"user","content":"What is the weather in Paris? Use the tool."}],
    "tools": [{"type":"function","function":{
      "name":"get_weather","description":"Get current weather for a city",
      "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}],
    "tool_choice": "auto",
    "temperature": 0.7, "top_p": 0.8, "max_tokens": 256, "stream": false }'
```
**Actual response (abridged, real run):**
```json
{ "choices":[{ "finish_reason":"tool_calls",
  "message":{"role":"assistant","content":"","reasoning_content":"",
    "tool_calls":[{"type":"function","id":"931693397",
      "function":{"name":"get_weather","arguments":"{\"city\":\"Paris\"}"}}]}}],
  "usage":{"prompt_tokens":293,"completion_tokens":22,"total_tokens":315,
           "completion_tokens_details":{"reasoning_tokens":0}},
  "system_fingerprint":"qwen/qwen3-coder-30b" }
```
✅ Clean `tool_calls`, `arguments` is a JSON string, `finish_reason: "tool_calls"`, `reasoning_tokens:0` (Coder is non-thinking). The parser is working. Note LM Studio emits `id` as a plain numeric string and includes a `reasoning_content` field.

### 7b. Native Anthropic endpoint, Qwen3-Coder, tool call — **VERIFIED 2026-05-30**
```bash
curl -s http://localhost:1234/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3-coder-30b",
    "max_tokens": 256,
    "system": "You are a helpful assistant. Use tools when needed.",
    "messages": [{"role":"user","content":"Weather in Tokyo? Use the tool."}],
    "tools": [{"name":"get_weather","description":"Get current weather for a city",
      "input_schema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}],
    "tool_choice": {"type":"auto"} }'
```
**Actual response (real run, full):**
```json
{ "id":"msg_vk3dkfhv53ttwjsc8thcq","type":"message","role":"assistant",
  "content":[ {"type":"tool_use","id":"912551384","name":"get_weather","input":{"city":"Tokyo"}} ],
  "model":"qwen/qwen3-coder-30b","stop_reason":"tool_use","stop_sequence":null,
  "usage":{"input_tokens":274,"output_tokens":23,"cache_read_input_tokens":0} }
```
✅ LM Studio emits **Anthropic-native** `tool_use` with object `input` and `stop_reason:"tool_use"`. Anthropic-shape `tool_choice:{"type":"auto"}` and top-level `system` accepted as-is. Note: no empty leading text block — `content` is just the `tool_use` block; `id` is a plain numeric string (not `toolu_…`).

### 7c. Sanity: list models (verified output)
```bash
curl -s http://localhost:1234/v1/models
# → qwen/qwen3-coder-30b, qwen/qwen3-coder-next, google/gemma-4-31b,
#   google/gemma-4-26b-a4b (+ mlx/it variants), llama-3.2-3b-instruct,
#   text-embedding-nomic-embed-text-v1.5
```

### 7d. Round-trip a tool result (OpenAI shape) — feed the answer back
```bash
curl -s http://localhost:1234/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model":"qwen/qwen3-coder-30b",
  "messages":[
    {"role":"user","content":"Weather in Paris? Use the tool."},
    {"role":"assistant","content":"","tool_calls":[{"id":"388374620","type":"function",
      "function":{"name":"get_weather","arguments":"{\"city\":\"Paris\"}"}}]},
    {"role":"tool","tool_call_id":"388374620","content":"18C and sunny"}
  ],
  "tools":[{"type":"function","function":{"name":"get_weather","description":"...",
    "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}],
  "max_tokens":128 }'
```
Note `tool_call_id` MUST equal the earlier `tool_calls[].id`.

---

## 8. Driving Claude Code → local Qwen3-Coder (two routes)

### Route A — through AnyModel (Anthropic→OpenAI translation)
Use when you want AnyModel's protections (schema fixing, tool budgeting, system condensing, retries) or when the local server only speaks OpenAI.
```bash
# Terminal 1: start the proxy pointed at LM Studio's OpenAI endpoint
# (lmstudio is a positional PROVIDER token; --model is optional — if omitted
#  AnyModel probes /v1/models and picks the loaded coding-preferred model)
unset OPENROUTER_API_KEY OPENAI_API_KEY   # else auto-detect may pick openrouter
npx anymodel proxy lmstudio --model qwen/qwen3-coder-30b
#   → proxy on :9090, /v1/messages → lmstudio (qwen/qwen3-coder-30b @ http://127.0.0.1:1234/v1)

# Terminal 2: point Claude Code at the proxy, then just `npx anymodel` or `claude`
export ANTHROPIC_BASE_URL=http://localhost:9090
claude
```
(From `LOCAL_SETUP.md`.) Useful env knobs (local path, set on the Terminal-1 command): `LOCAL_NUM_CTX` (32768), `LOCAL_MAX_TOOLS` (0=unlimited), `LOCAL_MAX_TOOL_DESC` (100), `LOCAL_TOOL_BUDGET_PCT` (0.30), `LOCAL_MAX_SYSTEM_CHARS` (4000), `LOCAL_MAX_MSG_CHARS`, `LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234/v1`). Load the model in LM Studio at **32 K** context first (`lms load qwen/qwen3-coder-30b`).

### Route B — direct to LM Studio's native `/v1/messages`
Use for quick tests / minimal moving parts. LM Studio already returns Anthropic-shaped `tool_use` (verified §7b), so:
```bash
export ANTHROPIC_BASE_URL=http://localhost:1234
claude
```
Trade-off: you lose AnyModel's tool-budgeting and system-prompt condensing, so Claude Code's large system prompt + many MCP tools hit the model raw — slower prefill, higher context pressure on the 30B. For real agentic / MCP-heavy work prefer **Route A**.

### MCP with either route
- Configure MCP servers in Claude Code as usual; Claude Code lists their tools and injects them as Anthropic `tools[]`. Qwen sees plain functions (§3).
- Through AnyModel: confirm tool count in the proxy log isn't being budget-trimmed below what the task needs (raise `LOCAL_MAX_TOOLS`/`LOCAL_TOOL_BUDGET_PCT` if an MCP tool goes missing).

---

## 9. Quick verification checklist for the next session
1. `curl -s http://localhost:1234/v1/models` → expect `qwen/qwen3-coder-30b`.
2. Run §7a → expect non-empty `tool_calls` + `finish_reason:"tool_calls"`. If you instead see XML in `content`, the parser is wrong — fix server-side before touching AnyModel.
3. Run §7b → expect `tool_use` + `stop_reason:"tool_use"`.
4. Start AnyModel (Route A), hit its `/health` (`curl :9090/health` → `{status:"ok",provider:"lmstudio",...}`), then `ANTHROPIC_BASE_URL=:9090 claude` and confirm a tool actually fires end-to-end.
5. If tools "disappear" under load → it's AnyModel tool budgeting; bump `LOCAL_MAX_TOOLS` / `LOCAL_TOOL_BUDGET_PCT`.

---

## Sources
- [Qwen — Function Calling](https://qwen.readthedocs.io/en/latest/framework/function_call.html)
- [Hugging Face — Qwen/Qwen3-Coder-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct)
- [Hugging Face — Qwen/Qwen3-Coder-Next (tool parser discussion #17)](https://huggingface.co/Qwen/Qwen3-Coder-Next/discussions/17)
- [GitHub — QwenLM/Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder)
- [GitHub — QwenLM/Qwen-Agent](https://github.com/QwenLM/Qwen-Agent)
- [vLLM — Tool Calling](https://docs.vllm.ai/en/latest/features/tool_calling/)
- [vLLM — qwen3coder_tool_parser API](https://docs.vllm.ai/en/latest/api/vllm/tool_parsers/qwen3coder_tool_parser/)
- [vLLM Recipes — Qwen3-Coder-480B-A35B](https://docs.vllm.ai/projects/recipes/en/latest/Qwen/Qwen3-Coder-480B-A35B.html)
- [vLLM issue #29192 — parsers fail to populate tool_calls](https://github.com/vllm-project/vllm/issues/29192)
- [vLLM security advisory GHSA-79j6-g2m3-jgfw — RCE in Qwen3-Coder tool parser](https://github.com/vllm-project/vllm/security/advisories/GHSA-79j6-g2m3-jgfw)
- [llama.cpp issue #15012 — Qwen3-Coder tool parser request](https://github.com/ggml-org/llama.cpp/issues/15012)
- [Anthropic — Tool use overview](https://docs.claude.com/en/docs/build-with-claude/tool-use/overview)
- [OpenAI — Function calling guide](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol — Architecture](https://modelcontextprotocol.io/docs/concepts/architecture)
- AnyModel source (verified locally): `repositories/antonoly/anymodel/proxy.mjs`, `providers/openai-local.mjs`, `providers/index.mjs`, `package.json` (v1.12.0), `LOCAL_SETUP.md`
