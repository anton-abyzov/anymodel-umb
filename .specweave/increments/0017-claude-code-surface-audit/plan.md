# Plan: Claude Code Surface Audit and Prune

## Audit Findings

| Surface | Current use | Disposition |
|---|---|---|
| `cli.js` bundled client | Required by `npx anymodel` and `npx anymodel claude`; package ships it | Keep |
| Anthropic `/v1/messages` proxy | Required because the client speaks Anthropic Messages | Keep |
| `.claude/.mcp.json` project loading | Required to scope MCP on local models | Keep |
| `.claude/skills` / `.claude/agents` / `CLAUDE.md` | Required by bundled/stock Claude-compatible client | Keep |
| Universal skill bridge `.agents/.codex/.gemini/.agent -> --add-dir` | Required because client only scans `.claude/skills` | Keep |
| Sibling/home `claude-code*` client discovery | Historical dev fallback; bundled/local/explicit/global paths cover setup | Prune |
| Worker `FREE_MODELS` allowlist | Stale duplicate of old npm proxy behavior | Prune |
| `output_config.effort` stripping | Makes Claude `--effort` a silent no-op | Fix |
| Docs claiming `_unused` placeholder / old client repo sync | Stale | Fix |
| `skills/anymodel-workspace` generated eval outputs | Historical traces with stale guidance, not live skill inputs | Prune |

## Architecture

### Client Discovery

`findClient()` remains simple:
1. `ANYMODEL_CLIENT`
2. bundled `cli.js`
3. cwd `cli.js`
4. global `claude`

This keeps explicit setup and npm behavior while removing old repo-name coupling.

### Effort Propagation

`sanitizeBody()` still removes Anthropic-only `output_config` from the serialized body. Before deleting it, it stores validated `output_config.effort` on a non-enumerable internal property so direct JSON egress cannot leak it.

`providers/openai.mjs` maps that internal value to `reasoning_effort` only when the OpenAI provider says the target is compatible. Local OpenAI-compatible providers opt out by default to avoid unknown-field failures.

### Worker Parity

`worker/handler.mjs` uses the same free-model rule as `cli.mjs` / `proxy.mjs`: allow any `:free` model and `openrouter/free`, with one configurable default replacement model.

## Implementation Phases

1. Replace template increment docs with this audit-backed plan.
2. Patch runtime code: client discovery, effort preservation/forwarding, Worker free rules.
3. Patch tests: sanitize, OpenAI translation, Worker parity, package script.
4. Patch setup docs and skill docs.
5. Run syntax, unit, Worker, and package dry-run checks.

## Testing Strategy

- Unit tests cover effort preservation and OpenAI translation.
- Worker tests cover free-model rules and Worker sanitize behavior.
- Existing CLI tests cover local setup banners and MCP suppression.
- Existing proxy/provider tests guard Anthropic/OpenAI/local translation behavior.
