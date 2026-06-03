# Plan: Local Backend Providers — LMStudio + llama.cpp

**Approach** (from brainstorm Approach D): Thin delegator providers (~60 LOC each) that reuse `openai.mjs`'s translator but own their identity, base URL, detection, and display info.

## Architecture

```
cli.mjs
  ├── PROVIDERS = [openrouter, ollama, openai, lmstudio, llamacpp]
  ├── parseArgs()       — handles positional + --flag forms
  ├── detectProvider()  — priority chain w/ HTTP probes
  └── startProxyOnly()  — model auto-detect via /v1/models

providers/
  ├── openai.mjs        — EXPORTS translateRequest/translateResponse/createStreamTranslator (reused)
  ├── ollama.mjs        — unchanged (native /api/chat, think:false)
  ├── openrouter.mjs    — unchanged (passthrough)
  ├── lmstudio.mjs      — NEW: delegator → openai.mjs translators, :1234
  └── llamacpp.mjs      — NEW: delegator → openai.mjs translators, :8080
```

## Provider interface per-new-file

```js
import http from 'http';
import { translateRequest, translateResponse, createStreamTranslator } from './openai.mjs';

const DEFAULT_BASE_URL = 'http://localhost:1234/v1'; // or :8080 for llamacpp

function getBaseUrl() {
  return process.env.LMSTUDIO_BASE_URL || DEFAULT_BASE_URL;
}

export default {
  name: 'lmstudio',
  buildRequest(url, payload) { /* parse getBaseUrl(), POST /chat/completions */ },
  transformRequest: translateRequest,
  transformResponse: translateResponse,
  createStreamTranslator,
  displayInfo(model) { /* (model @ baseUrl) */ },
  detect() { /* probe GET /v1/models with 1s timeout */ },
  listModels() { /* returns array of model ids */ },
};
```

## CLI integration

1. **PROVIDERS array** (cli.mjs:19): add `'lmstudio'`, `'llamacpp'`
2. **parseArgs flags** (cli.mjs:79-82 region): add `--lmstudio` and `--llamacpp`
3. **detectProvider** (cli.mjs:91): extend probe chain after Ollama
4. **startProxyOnly** (cli.mjs:382-440 region): parallel branch to the Ollama model-detect block — probe `/v1/models`, pick first if `--model` not provided

## Key design decisions

| Decision | Rationale |
|---|---|
| `name: 'lmstudio'` / `'llamacpp'` (NOT `openai`) | Avoids triggering Ollama-specific code paths in `proxy.mjs` (lines 269, 310, 319, 361, 437, 545, 667). Falls through to default OpenAI behavior. |
| `buildRequest` duplicated (not imported from openai.mjs) | Each backend reads its own env var (`LMSTUDIO_BASE_URL` vs `OPENAI_BASE_URL`). ~15 LOC. |
| Auth header `Bearer lm-studio` / `Bearer no-key` | Both backends ignore auth but require non-empty token to pass their validation. |
| `detect()` via `GET /v1/models` (not just port probe) | Confirms it's actually an OpenAI-compatible server, not some other service squatting the port. |
| Model auto-detect via `/v1/models` first entry | Mirrors Ollama's `/api/tags` UX pattern — zero-config for users with one model loaded. |

## No changes to `proxy.mjs` — verified

`proxy.mjs` special-cases `provider.name === 'ollama'` for native-API handling. Our new providers use `'lmstudio'` and `'llamacpp'`, so they go through the default (OpenAI-style) code path — no edits needed.

## Test strategy

- **`test/lmstudio.test.mjs`** (NEW) — interface, buildRequest, transformRequest/Response delegation, detect mock
- **`test/llamacpp.test.mjs`** (NEW) — mirror of lmstudio tests
- **`test/providers.test.mjs`** — add interface-parity checks for both
- **`test/cli.test.mjs`** — add parseArgs tests for positional + flag forms
- No modification to `ollama.test.mjs` or `openai.test.mjs` (no regressions expected)

## Parallel execution strategy

Three independent streams, implemented in parallel via Agent subagents:

- **Agent A**: lmstudio.mjs + lmstudio.test.mjs
- **Agent B**: llamacpp.mjs + llamacpp.test.mjs
- **Agent C**: cli.mjs edits + test/cli.test.mjs + test/providers.test.mjs

Then serial:
- **Agent D**: README.md + site/index.html updates
- Main: `npm test`, fix integration issues, close increment

## Rollback

All changes are additive except `cli.mjs` (4 localized edits). Revert is trivial — delete 2 provider files, revert cli.mjs.
