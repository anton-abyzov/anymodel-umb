# Why local Qwen via anymodel "isn't usable" — root-cause diagnosis (2026-06-02)

**Symptom (observed in a real session):** Claude Code driven through `anymodel proxy lmstudio`
(model `qwen/qwen3-coder-30b`, LM Studio MLX, M4 Max 128GB) failed on an agentic task
("investigate why a site's stream links are broken, then deploy + verify"). The local model:
repeatedly "entered plan mode" and never exited (3+ loops); ran a few tools then reverted to
chatbot mode; emitted RLHF refusals ("I can't browse the web", "I cannot deploy applications");
asked permission instead of acting; described code instead of editing/deploying.

**Method:** 6 parallel code/spec investigators + live probes against the running LM Studio (:1234),
the running proxy (:9090), and a 30B-vs-80B comparison, then synthesis. All single-turn plumbing
claims were verified live and in source (anymodel test suite: 444/444 pass).

---

## Verdict: the proxy is sound. The failure is harness/config + model, not translation.

Verified **working** in the actual running binary: P0.1 stream flush on upstream `end`,
P0.3 upstream timeout, P1.1 per-`tc.index` streaming routing, finish_reason unification
(`content_filter→refusal`), canonical error envelopes, sampling forwarding, and P0.2 text-channel
tool-call recovery for Hermes + canonical Qwen-XML. The single-turn happy path returns clean
`tool_use` non-streaming and a complete SSE sequence streaming.

## Ranked root causes

### 1. (PRIMARY, ~45%, high) Version skew: trim-without-restore — anymodel **1.14.1**
The running proxy is the **global install `1.14.1`**, which has **no `providers/skill-catalog.mjs`**.
1.14.1 condenses Claude Code's 50–100KB system prompt to `MAX_SYSTEM_CHARS=4000` (`proxy.mjs:497-538`)
and strips every `<system-reminder>` block (`proxy.mjs:545`) — the exact place Claude Code injects the
skill catalog ("The following skills are available…"). The comment at `proxy.mjs:501` is explicit:
"strips Claude Code behavioral rules that local models can't follow anyway."

The **re-injection** counterpart (skill catalog + a compact behavioral/agentic core) shipped **only in
the unpublished `1.15.0` source** (increment 0010, `providers/skill-catalog.mjs`). So the user got the
trim with no restore: surviving `CLAUDE.md` still ordered "SKILL FIRST (BLOCKING)" and "ALWAYS plan
mode (MANDATORY)," but the skill names and the `ExitPlanMode` grammar that would satisfy those were
deleted → deadlock → hedge to refusal.
**Fix (done 2026-06-02): `npm i -g .` from source → global is now 1.15.0.** Requires restarting the proxy.

### 2. (~25%, high) Tool-absence-driven RLHF refusal (model alignment)
qwen3-coder-30b deterministically emits the verbatim "I can't access websites / deploy / run code"
disclaimer whenever a request reaches it **without a populated `tools[]` array** — attaching the tool
array eliminates the refusal entirely (live EXP2 vs EXP2b, identical at temp 0.2 and 0.7, so it is
alignment not sampling). The proxy cannot recover this: it's prose with `stop_reason:end_turn`, not a
parked tool call.

### 3. (~15%, med) Multi-turn context ceiling + plan-state truncation (model capability)
On long tasks (30+ tool calls) the message-history condenser (`proxy.mjs:580-588`) drops *middle* turns
and inserts a semantically-empty `[Earlier conversation condensed]` filler once `MAX_MSG_CHARS`
(`max(4000, numCtx*3)`, default `LOCAL_NUM_CTX=32768`) is exceeded. If the turn that established plan
mode is dropped, the model loses that state and re-enters plan mode — the observed 3+ re-entries.
(Live EXP1 proved that *with* full scaffolding + tools the 30B exits plan mode unprompted at turn 7, so
this is scaffolding loss, not inherent inability.)

### 4. (~10%, high) SpecWeave hooks over-constrained for a local model (spec-hooks)
`cli.mjs:446` auto-injects `--strict-mcp-config` for local providers, removing the Skill tool itself,
while `.specweave/config.json incrementAssist.mandatory=true` and `CLAUDE.md` "SKILL FIRST = BLOCKING"
+ "ALWAYS enter plan mode" survive condensing → the model is commanded to do something structurally
impossible → analysis-paralysis / asks permission.

### 5. (~5%, high — forward risk) Residual proxy gaps
- **80B paren-variant text-channel parse bug:** `openai.mjs:274` `/<function=([^>\s]+)\s*>/` mis-parses
  qwen3-coder-next's `<function=web_fetch(url="...")>` — captures the whole signature as the tool *name*,
  empty `input{}`, dangling `<tool_call>`.
- **image/document `tool_result` blocks dropped** (`openai.mjs` `extractToolResultParts` reads only
  `block.text`) → Playwright screenshots vanish, model reasons over a partial turn.
- skill-catalog harvest is **turn-1-only** even in 1.15.0 (no session cache for turn 2+).

---

## How to actually use Qwen for local coding (practical recipe)

1. **Upgrade first:** `npm i -g anymodel@latest` (≥ 1.15.0) and **restart the proxy**. Dominant fix.
2. **Model:** default to **qwen3-coder-30b** as the agentic driver (exits plan mode on its own, clean
   structured tool_calls). Reserve **qwen3-coder-next (80B)** for single-shot generation — it's worse on
   the plan-mode exit gate and emits the paren text-channel form the proxy currently mis-parses.
3. **Always run with tools attached; keep the set small** (~15–25). Tool absence = guaranteed refusal.
4. **Serving:** set LM Studio context ≥ **65536** and `LOCAL_NUM_CTX=65536` so plan state isn't truncated
   mid-task. Keep `ANYMODEL_PARSE_TEXT_TOOLCALLS=auto` (default). Temp **0.2–0.3**.
5. **Relax the harness for local:** run `--full-mcp` (keeps the Skill tool) **or** use a local profile with
   `incrementAssist.mandatory=false` and without the blocking SKILL-FIRST / mandatory-plan-mode language.
   Avoid plan mode for autonomous local runs.
6. **Expectations:** local 30B is good for bounded edits, single-file refactors, read/grep/glob
   exploration, and tight tool-attached loops under ~65K context. It is **not** a drop-in autonomous
   Claude for long multi-turn tasks with screenshot verification — that exact shape is its weak spot.

## Remediation backlog (residual, post-1.15.0)
| Task | Size | Home |
|---|---|---|
| Startup self-check: warn on trim-without-restore (catalog present in request but re-injection absent) | M | 0010 |
| Cache skill catalog per-session; re-inject on turn 2+ (fix turn-1-only harvest); drop dangling "listed below" | M | 0010 |
| Fix 80B paren-variant text-channel parse (`openai.mjs:274`) + test | S | new |
| Translate image/document `tool_result` blocks (placeholder or forward) | M | 0008 |
| Refusal-recovery: on prose refusal + `end_turn` + tools attached, retry once with "use your tools" nudge (flag) | M | new |
| Plan-state-aware condenser: never drop plan-mode turn; structured summary instead of empty filler; multi-turn regression gate | L | 0010 |
| Ship a "local agentic" preset that relaxes over-constrained hooks; document in LOCAL_SETUP.md | S | new |
| **Publish 1.15.0 to npm** so other users get the re-injection fix | S | release |
