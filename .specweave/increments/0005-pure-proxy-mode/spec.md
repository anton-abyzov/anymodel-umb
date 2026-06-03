---
increment: 0005-pure-proxy-mode
title: "Pure Proxy Mode for Stock Claude Code"
type: feature
priority: P1
status: planned
created: 2026-04-08
structure: user-stories
test_mode: TDD
coverage_target: 80
---

# Feature: Pure Proxy Mode for Stock Claude Code

## Overview

Decouple AnyModel from its bundled CLI (`cli.js`) so it works as a standalone proxy with the latest official Claude Code installation. Add a `--setup` flag to `anymodel proxy` that prints shell environment variables and configuration snippets for using stock `claude` CLI against the running proxy. Update all documentation surfaces (proxy banner, help text, README, site landing page, KNOWLEDGE-BASE) to promote the pure-proxy workflow.

### Technical Context

- AnyModel currently ships a bundled, modified `cli.js` (~13MB fork of Claude Code) as the client
- Users are locked to whichever Claude Code version was bundled, missing upstream features and bug fixes
- Anthropic's third-party distribution cutoff (April 4, 2026) makes the bundled `cli.js` a legal risk
- Claude Code officially supports `ANTHROPIC_BASE_URL` for custom endpoints — the proxy already works with it
- The `connectToProxy()` function in `cli.mjs:280-341` already sets `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` when spawning the client — `--setup` just prints these same values for the user to export manually
- Ollama v0.14+ natively implements Anthropic Messages API
- OpenRouter exposes Anthropic-compatible endpoint
- The proxy infrastructure (request sanitization, retries, format translation) already works — this increment is about decoupling + documentation

### Value Proposition

AnyModel as a pure proxy adds value over direct OpenRouter/Ollama connections via:
- Smart system prompt condensing (50KB→4KB for Ollama)
- Tool stripping/compression (88 tools → configurable overhead for local models)
- KV cache prefix optimization (17.7x speedup via stable prefix ordering)
- Request sanitization (cross-provider compatibility — strips `betas`, `metadata`, normalizes `tool_choice`)
- Smart retries with exponential backoff (3 retries, handles 429/500/503)
- Free-model filtering (`--free-only`)
- Rate limiting per IP (`--rpm`)
- Preset system for quick model switching (9 built-in presets)

## User Stories

### US-001: --setup Flag for Proxy Command (P1)
**Project**: anymodel

**As a** developer running the anymodel proxy
**I want** a `--setup` flag that prints the shell environment variables and configuration needed to connect stock Claude Code
**So that** I can use the latest official `claude` CLI through the anymodel proxy without the bundled client

**Acceptance Criteria**:
- [ ] **AC-US1-01**: `parseArgs()` in `cli.mjs` recognizes `--setup` flag and stores it in opts as `setup: true` (bare) or `setup: 'json'` (when followed by `json`)
- [ ] **AC-US1-02**: When `--setup` is passed, `startProxyOnly()` starts the proxy as normal AND after the banner, prints a boxed "Use with Latest Claude Code" section containing: (a) shell `export` commands for `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` (if `--token` is set), and `ANTHROPIC_API_KEY`; (b) a `.claude/settings.local.json` snippet with `env` block; (c) the `claude` command to run
- [ ] **AC-US1-03**: The printed `ANTHROPIC_BASE_URL` uses the actual bound port (respects `--port` and auto-port-finding)
- [ ] **AC-US1-04**: When `--setup json` is passed, the setup section is printed as a single JSON object to stdout with keys: `anthropic_base_url`, `anthropic_api_key`, `claude_settings`, `shell_exports`, `claude_command`
- [ ] **AC-US1-05**: `ANTHROPIC_API_KEY` value is `anymodel-proxy` (matching the existing value used in `connectToProxy()` at `cli.mjs:334`) — the proxy handles real auth, Claude Code just needs a non-empty key

---

### US-002: Enhanced Proxy Banner Hint (P1)
**Project**: anymodel

**As a** developer who just started the proxy
**I want** to see a hint about the pure-proxy workflow alongside the existing "Next step" message
**So that** I discover I can use my own Claude Code installation instead of the bundled client

**Acceptance Criteria**:
- [ ] **AC-US2-01**: `printBanner()` in `proxy.mjs` adds a line after the existing "Next step" block: `Or use with official Claude Code: npx anymodel proxy <preset> --setup` (where `<preset>` reflects the current model/preset, or is omitted if using `--model`)
- [ ] **AC-US2-02**: The hint line uses the same ANSI color scheme as the existing banner (cyan for labels, bold for commands)

---

### US-003: Help Text Updates (P1)
**Project**: anymodel

**As a** developer reading the CLI help
**I want** the `--setup` flag documented in both `printHelp()` and `printQuickUsage()`
**So that** I can discover the pure-proxy workflow from the command line

**Acceptance Criteria**:
- [ ] **AC-US3-01**: `printHelp()` in `cli.mjs` lists `--setup` under "Proxy Options" with description: `Print Claude Code setup instructions (use --setup json for machine-readable)`
- [ ] **AC-US3-02**: `printQuickUsage()` in `cli.mjs` adds a line in the "Commands" block: `anymodel proxy <preset> --setup  Print Claude Code connection setup`

---

### US-004: README.md Update (P2)
**Project**: anymodel

**As a** developer reading the README
**I want** a "Use with Latest Claude Code" section that explains the pure-proxy workflow
**So that** I understand how to use AnyModel as a standalone proxy with my own Claude Code installation

**Acceptance Criteria**:
- [ ] **AC-US4-01**: New section titled "Use with Latest Claude Code" appears after the "Quick Start" section in README.md
- [ ] **AC-US4-02**: Section contains: (a) explanation that AnyModel can be used as a pure proxy with stock `claude` CLI; (b) 3-step workflow (start proxy, export vars or use `--setup`, run `claude`); (c) bullet list of why AnyModel adds value over direct OpenRouter/Ollama (prompt condensing, tool compression, cache optimization, retries, sanitization); (d) reference to `--setup json` for scripting
- [ ] **AC-US4-03**: The `--setup` flag is added to the CLI Reference table in README.md
- [ ] **AC-US4-04**: Environment variables `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` are mentioned in the Environment Variables table with a note about pure-proxy usage

---

### US-005: Site Landing Page Updates (P2)
**Project**: anymodel

**As a** visitor to anymodel.dev
**I want** the landing page to show the pure-proxy workflow as a first-class option
**So that** I understand AnyModel works with my existing Claude Code installation

**Acceptance Criteria**:
- [ ] **AC-US5-01**: New example card in the Examples section (#examples) titled "Use with Official Claude Code" showing: start proxy, run `--setup`, copy exports, run `claude` — with a "Pure Proxy" tag badge (using a distinct color, e.g., blue/indigo)
- [ ] **AC-US5-02**: "How It Works" section (#how-it-works) updated to show both workflows: existing AnyModel client flow (step 1-2) AND pure-proxy flow (alternative step 2 using stock `claude`)
- [ ] **AC-US5-03**: New FAQ entry: "Can I use my own Claude Code installation?" with answer explaining the `--setup` flag and pure-proxy workflow
- [ ] **AC-US5-04**: Architecture diagram updated to show both paths: `AnyModel client → proxy → Provider` and `Stock Claude Code → proxy → Provider`

---

### US-006: KNOWLEDGE-BASE.md Update (P2)
**Project**: anymodel

**As a** contributor or LLM working on AnyModel
**I want** the knowledge base to document the pure-proxy workflow
**So that** future development decisions account for both client modes

**Acceptance Criteria**:
- [ ] **AC-US6-01**: New "Pure Proxy Mode" section in KNOWLEDGE-BASE.md after "Architecture" explaining: (a) what pure-proxy mode is; (b) the `--setup` flag and its output; (c) why AnyModel adds value as a proxy vs direct provider connections; (d) the relationship between `cli.mjs` (orchestrator), `cli.js` (bundled client), and stock `claude` (pure-proxy client)
- [ ] **AC-US6-02**: Architecture section diagram updated to show both client paths

---

### US-007: Tests for --setup Flag (P1)
**Project**: anymodel

**As a** maintainer
**I want** tests for the `--setup` flag parsing, setup output generation, and banner hint
**So that** the pure-proxy workflow is covered by automated tests and regressions are caught

**Acceptance Criteria**:
- [ ] **AC-US7-01**: `parseArgs(['--setup'])` returns `{ setup: true }` in opts; `parseArgs(['--setup', 'json'])` returns `{ setup: 'json' }`; `parseArgs([])` returns `{ setup: false }` — tested in `test/cli.test.mjs`
- [ ] **AC-US7-02**: Setup output function (exported from `cli.mjs`) generates correct shell export strings with the given port, including `ANTHROPIC_BASE_URL=http://localhost:<port>` and `ANTHROPIC_API_KEY=anymodel-proxy`
- [ ] **AC-US7-03**: Setup output function with `json` format returns valid JSON with all required keys (`anthropic_base_url`, `anthropic_api_key`, `claude_settings`, `shell_exports`, `claude_command`)
- [ ] **AC-US7-04**: Setup output includes `ANTHROPIC_AUTH_TOKEN` in exports only when `--token` is set
- [ ] **AC-US7-05**: All existing tests pass with no regressions (40+ existing tests)

## Functional Requirements

### FR-001: --setup Flag Behavior
The `--setup` flag modifies proxy startup behavior:
1. Proxy starts normally (all existing behavior preserved)
2. After `printBanner()`, a boxed "Use with Latest Claude Code" section is printed
3. The box contains copy-pasteable shell commands and a settings.json snippet
4. `--setup json` prints a machine-readable JSON object instead of the boxed format
5. The proxy continues running after printing — `--setup` is NOT an "info and exit" flag

### FR-002: Setup Output Format (Human-Readable)
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
When `--token` is active, `ANTHROPIC_AUTH_TOKEN` is included in both the exports and settings.

### FR-003: Setup Output Format (JSON)
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

### FR-004: Banner Enhancement
The existing `printBanner()` in `proxy.mjs:888-913` adds one line after the "Next step" block:
```
  Or use with latest Claude Code:
  npx anymodel proxy deepseek --setup
```

### FR-005: Exported Setup Function
A `generateSetupOutput(port, opts)` function is exported from `cli.mjs` for testability. It accepts port number and options (`{ token, format }`) and returns the formatted string (human) or object (JSON). The `startProxyOnly()` function calls this after banner print.

## Success Criteria

- Running `npx anymodel proxy deepseek --setup` starts the proxy AND prints clear, copy-pasteable Claude Code configuration
- Running `npx anymodel proxy deepseek --setup json` outputs valid, parseable JSON
- The proxy banner always shows the pure-proxy hint regardless of `--setup`
- `--help` documents `--setup` in the correct section
- README has a complete "Use with Latest Claude Code" section
- Site landing page shows both workflows (bundled client + pure proxy)
- KNOWLEDGE-BASE.md documents the architecture of both modes
- All 40+ existing tests pass, plus new tests for `--setup` parsing and output generation
- A user who has never seen AnyModel before can start the proxy and connect stock `claude` CLI using only the `--setup` output

## Out of Scope

- **Removing cli.js from the package**: The bundled client remains available — this increment adds a parallel workflow, not a replacement
- **Auto-detecting stock claude**: The `--setup` flag prints instructions; it does not auto-launch `claude`
- **Proxy protocol changes**: The HTTP proxy itself is unchanged — only CLI flags, output, and documentation change
- **Provider-specific setup guides**: Generic setup works for all providers; provider-specific tips are a future increment
- **Shell completion scripts**: Generating bash/zsh completion for the new flag is out of scope
- **Interactive setup wizard**: The `--setup` flag is non-interactive — it prints and the proxy runs

## Dependencies

- Stock Claude Code supporting `ANTHROPIC_BASE_URL` environment variable (confirmed in current Claude Code releases)
- Existing proxy infrastructure (`createProxy()`, `printBanner()`, `parseArgs()`) — all in place
- No external dependencies — zero-dependency constraint preserved
