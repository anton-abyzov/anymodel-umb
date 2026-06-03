# Implementation Plan: Pure Proxy Mode for Stock Claude Code

## Overview

Add a `--setup` flag to the `anymodel proxy` command that prints environment variables and configuration snippets for connecting stock Claude Code to the running proxy. Enhance the proxy banner with a pure-proxy hint. Update all documentation surfaces (README, site, KNOWLEDGE-BASE, help text) to present the pure-proxy workflow as a first-class option.

This is a surface-level change: no proxy protocol changes, no new dependencies, no new HTTP endpoints. The proxy already works with stock Claude Code via `ANTHROPIC_BASE_URL` -- this increment makes that workflow discoverable and documented.

## Architecture

### Component Map

```
cli.mjs (modify)
├── parseArgs()         ← add --setup flag recognition
├── generateSetupOutput() ← NEW: exported function for testability
├── startProxyOnly()    ← call generateSetupOutput after banner
├── printHelp()         ← document --setup
└── printQuickUsage()   ← add --setup hint

proxy.mjs (modify)
└── printBanner()       ← add pure-proxy hint line

test/cli.test.mjs (modify)
├── parseArgs --setup tests
└── generateSetupOutput tests

test/setup-output.test.mjs (NEW)
└── dedicated tests for setup output formatting

README.md (modify)
├── new "Use with Latest Claude Code" section
├── CLI Reference table update
└── Environment Variables table update

site/index.html (modify)
├── new example card (Examples section)
├── How It Works update (dual workflow)
├── new FAQ entry
└── architecture diagram update

KNOWLEDGE-BASE.md (modify)
├── new "Pure Proxy Mode" section
└── architecture diagram update
```

### Data Flow

```
User runs: npx anymodel proxy deepseek --setup

parseArgs(argv)
  └── returns { ..., setup: true|'json' }

startProxyOnly(args)
  ├── opts = parseArgs(args)
  ├── createProxy(provider, { port, ... })
  │     └── server.listen(port)
  │           └── printBanner(actualPort)    ← now includes pure-proxy hint
  │                 └── callback(actualPort)  ← NEW: port callback
  └── generateSetupOutput(actualPort, { token, format })
        ├── format=undefined → boxed human-readable string → console.log
        └── format='json' → JSON object → console.log(JSON.stringify)
```

### Key Design Decision: Port Callback

The `--setup` output must include the actual bound port. Currently `createProxy()` uses `tryListen()` with auto-port-finding, and the actual port is only known inside the `server.listen()` callback. The `printBanner()` already has access to `actualPort`.

**Solution**: Add a `onReady(actualPort)` callback parameter to `createProxy()` that fires after `server.listen()` succeeds, right after `printBanner()`. The `startProxyOnly()` function passes a callback that calls `generateSetupOutput()`.

**Alternative considered**: Make `createProxy()` return a promise resolving with the port. Rejected because `createProxy()` currently returns the `server` object synchronously, and changing that return type would break the existing API contract used in tests.

**Alternative considered**: Have `generateSetupOutput()` use the configured port (not actual). Rejected because the whole point of the feature is correct, copy-pasteable commands. If port 9090 is taken and auto-port-finding picks 9091, the output must say 9091.

### API Contract: generateSetupOutput()

```javascript
/**
 * @param {number} port - The actual bound port
 * @param {{ token?: string, format?: 'json'|undefined }} opts
 * @returns {string} - Human-readable boxed output or JSON string
 */
export function generateSetupOutput(port, { token, format } = {})
```

Human-readable output (default):
```
  ┌─────────────────────────────────────────────────┐
  │  Use with Latest Claude Code                    │
  │                                                 │
  │  1. Copy these exports:                         │
  │     export ANTHROPIC_BASE_URL=http://localhost:9090
  │     export ANTHROPIC_API_KEY=anymodel-proxy     │
  │                                                 │
  │  2. Or add to .claude/settings.local.json:      │
  │     { "env": {                                  │
  │       "ANTHROPIC_BASE_URL": "http://localhost:9090",
  │       "ANTHROPIC_API_KEY": "anymodel-proxy"     │
  │     }}                                          │
  │                                                 │
  │  3. Run:                                        │
  │     claude                                      │
  └─────────────────────────────────────────────────┘
```

JSON output (when `format === 'json'`):
```json
{
  "anthropic_base_url": "http://localhost:9090",
  "anthropic_api_key": "anymodel-proxy",
  "claude_settings": {
    "env": {
      "ANTHROPIC_BASE_URL": "http://localhost:9090",
      "ANTHROPIC_API_KEY": "anymodel-proxy"
    }
  },
  "shell_exports": "export ANTHROPIC_BASE_URL=http://localhost:9090\nexport ANTHROPIC_API_KEY=anymodel-proxy",
  "claude_command": "claude"
}
```

When `token` is set, both formats include `ANTHROPIC_AUTH_TOKEN`.

## Technology Stack

- **Language**: JavaScript (ESM modules, Node.js >=18.0.0)
- **Testing**: `node:test` (built-in, no dependencies)
- **Dependencies**: None (zero-dependency constraint)

**Architecture Decisions**:
- See ADR 0002: Pure Proxy Mode Implementation Strategy

## Implementation Phases

### Phase 1: Core CLI (US-001, US-007) -- P1

1. Add `--setup` flag to `parseArgs()` in `cli.mjs`
2. Create `generateSetupOutput()` function in `cli.mjs`
3. Add `onReady` callback to `createProxy()` in `proxy.mjs`
4. Wire `startProxyOnly()` to call setup output on ready
5. Write tests for parseArgs and generateSetupOutput (TDD: tests first)

### Phase 2: Banner & Help (US-002, US-003) -- P1

1. Enhance `printBanner()` with pure-proxy hint
2. Update `printHelp()` with `--setup` documentation
3. Update `printQuickUsage()` with `--setup` mention

### Phase 3: Documentation (US-004, US-005, US-006) -- P2

1. Add "Use with Latest Claude Code" section to README.md
2. Update site landing page with pure-proxy workflow
3. Update KNOWLEDGE-BASE.md with pure-proxy documentation

## Testing Strategy

**TDD mode active**: Write failing tests first, then implement.

- `test/cli.test.mjs`: Extend with `--setup` parseArgs tests (3 cases: bare, json, absent)
- `test/setup-output.test.mjs`: New file for `generateSetupOutput()` tests
  - Human-readable format with default port
  - Human-readable format with custom port
  - JSON format output validation
  - Token inclusion when set
  - Token exclusion when not set
- Existing tests: Run full suite to verify no regressions

Total new tests: ~10-12 test cases across 2 files.

## Technical Challenges

### Challenge 1: Actual Port Discovery for --setup Output

**Problem**: `createProxy()` uses `tryListen()` with auto-port-finding. The actual port is only known inside the `server.listen()` callback. `--setup` needs this port to generate correct output.

**Solution**: Add `onReady(actualPort)` callback parameter to `createProxy()`. The callback fires after `server.listen()` succeeds and `printBanner()` completes. `startProxyOnly()` passes a callback that calls `generateSetupOutput()` when `opts.setup` is truthy.

**Risk**: Low. The callback is optional -- existing callers (tests, direct usage) don't need to pass it. The `server` return value is preserved.

### Challenge 2: Box Drawing in Terminal Output

**Problem**: The boxed output format uses Unicode box-drawing characters. Some terminals or fonts may not render them correctly.

**Solution**: Use simple ASCII box characters (`+-|`) as fallback is unnecessary -- all modern terminals (macOS Terminal, iTerm2, Windows Terminal, VS Code terminal) support Unicode box-drawing. The existing codebase already uses Unicode arrows (`→`, `↔`, `✓`), so box-drawing is consistent.

**Risk**: Minimal. If a user's terminal doesn't support Unicode, the output is still readable -- the box is cosmetic.

### Challenge 3: Site Landing Page HTML Complexity

**Problem**: `site/index.html` is 962 lines with inline styles and specific section patterns. Adding a new example card requires matching the existing HTML/CSS structure exactly.

**Solution**: Study the existing example cards in the `#examples` section and replicate the pattern. No CSS changes needed -- reuse existing classes. The "Pure Proxy" tag badge uses the existing `.example-tag` class with a new color variant.

**Risk**: Low. The site is static HTML with no build system -- changes are immediately visible.
