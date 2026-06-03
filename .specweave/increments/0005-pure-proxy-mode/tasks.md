# Tasks: Pure Proxy Mode for Stock Claude Code

## Task Notation

- `[T###]`: Task ID
- `[P]`: Parallelizable
- `[ ]`: Not started
- `[x]`: Completed
- Model hints: haiku (simple), opus (default)

## Phase 1: Core CLI (P1)

### T-001: Add --setup flag to parseArgs()
**User Story**: US-001, US-007 | **Satisfies ACs**: AC-US1-01, AC-US7-01 | **Status**: [ ] not started
**AC**: AC-US1-01, AC-US7-01

**Description**: Extend `parseArgs()` in `cli.mjs` to recognize `--setup` flag. Bare `--setup` sets `setup: true`, `--setup json` sets `setup: 'json'`, absent sets `setup: false`.

**Implementation Details**:
- Add `setup: false` to the `opts` defaults object at `cli.mjs:60`
- Add flag handling in the `for` loop: when `arg === '--setup'`, peek at next arg -- if it's `'json'`, consume it and set `opts.setup = 'json'`, otherwise set `opts.setup = true`

**Test Plan**:
- **File**: `test/cli.test.mjs`
- **Tests**:
  - **TC-001**: `parseArgs(['--setup'])` returns `{ setup: true }`
    - Given parseArgs receives `['--setup']`
    - When parsed
    - Then `opts.setup === true`
  - **TC-002**: `parseArgs(['--setup', 'json'])` returns `{ setup: 'json' }`
    - Given parseArgs receives `['--setup', 'json']`
    - When parsed
    - Then `opts.setup === 'json'`
  - **TC-003**: `parseArgs([])` returns `{ setup: false }`
    - Given parseArgs receives `[]`
    - When parsed
    - Then `opts.setup === false`
  - **TC-004**: `parseArgs(['--setup', 'json', '--port', '8080'])` parses both flags
    - Given parseArgs receives combined flags
    - When parsed
    - Then `opts.setup === 'json'` AND `opts.port === 8080`

**Dependencies**: None
**Estimate**: haiku

---

### T-002: Create generateSetupOutput() function
**User Story**: US-001 | **Satisfies ACs**: AC-US1-02, AC-US1-03, AC-US1-04, AC-US1-05, AC-US7-02, AC-US7-03, AC-US7-04 | **Status**: [ ] not started
**AC**: AC-US1-02, AC-US1-03, AC-US1-04, AC-US1-05, AC-US7-02, AC-US7-03, AC-US7-04

**Description**: Create and export `generateSetupOutput(port, { token, format })` function in `cli.mjs`. Returns human-readable boxed string (default) or JSON string (when `format === 'json'`).

**Implementation Details**:
- Export function at module level in `cli.mjs`
- Human-readable format: Unicode box-drawing characters, 3-step instructions (exports, settings.json, run claude)
- JSON format: structured object with `anthropic_base_url`, `anthropic_api_key`, `claude_settings`, `shell_exports`, `claude_command`
- Include `ANTHROPIC_AUTH_TOKEN` only when `token` is provided
- `ANTHROPIC_API_KEY` value is always `anymodel-proxy`

**Test Plan**:
- **File**: `test/setup-output.test.mjs`
- **Tests**:
  - **TC-005**: Human-readable output contains `ANTHROPIC_BASE_URL=http://localhost:9090` for port 9090
    - Given `generateSetupOutput(9090)`
    - When called with default format
    - Then output contains `export ANTHROPIC_BASE_URL=http://localhost:9090`
  - **TC-006**: Human-readable output contains `ANTHROPIC_API_KEY=anymodel-proxy`
    - Given `generateSetupOutput(9090)`
    - When called
    - Then output contains `export ANTHROPIC_API_KEY=anymodel-proxy`
  - **TC-007**: Custom port is reflected in output
    - Given `generateSetupOutput(8080)`
    - When called
    - Then output contains `http://localhost:8080` (not 9090)
  - **TC-008**: JSON format returns valid JSON with all required keys
    - Given `generateSetupOutput(9090, { format: 'json' })`
    - When parsed with `JSON.parse()`
    - Then object has keys: `anthropic_base_url`, `anthropic_api_key`, `claude_settings`, `shell_exports`, `claude_command`
  - **TC-009**: JSON format `anthropic_base_url` uses correct port
    - Given `generateSetupOutput(9091, { format: 'json' })`
    - When parsed
    - Then `obj.anthropic_base_url === 'http://localhost:9091'`
  - **TC-010**: Token is included in output when set
    - Given `generateSetupOutput(9090, { token: 'my-secret' })`
    - When called
    - Then output contains `ANTHROPIC_AUTH_TOKEN`
  - **TC-011**: Token is NOT included when not set
    - Given `generateSetupOutput(9090)`
    - When called
    - Then output does NOT contain `ANTHROPIC_AUTH_TOKEN`
  - **TC-012**: JSON format includes token in claude_settings.env when set
    - Given `generateSetupOutput(9090, { token: 'my-secret', format: 'json' })`
    - When parsed
    - Then `obj.claude_settings.env.ANTHROPIC_AUTH_TOKEN === 'my-secret'`
  - **TC-013**: Human-readable output contains settings.local.json snippet
    - Given `generateSetupOutput(9090)`
    - When called
    - Then output contains `settings.local.json`
  - **TC-014**: Human-readable output contains `claude` command
    - Given `generateSetupOutput(9090)`
    - When called
    - Then output contains `claude`

**Dependencies**: T-001 (parseArgs must recognize --setup for integration)
**Estimate**: opus

---

### T-003: Add onReady callback to createProxy()
**User Story**: US-001 | **Satisfies ACs**: AC-US1-03 | **Status**: [ ] not started
**AC**: AC-US1-03

**Description**: Add optional `onReady` callback parameter to `createProxy()` in `proxy.mjs`. Called with the actual bound port after `server.listen()` succeeds and `printBanner()` completes.

**Implementation Details**:
- Add `onReady` to the destructured options of `createProxy()` at `proxy.mjs:799`
- Call `onReady(tryPort)` after `printBanner(tryPort)` inside the `server.listen()` callback at `proxy.mjs:929`
- Guard: `if (typeof onReady === 'function') onReady(tryPort);`

**Test Plan**:
- No dedicated test file -- verified via integration in T-005 and manual testing
- Existing `test/health.test.mjs` tests that call `createProxy()` continue to pass (callback is optional)

**Dependencies**: None
**Estimate**: haiku

---

### T-004: Wire startProxyOnly() to print setup output
**User Story**: US-001 | **Satisfies ACs**: AC-US1-02, AC-US1-03 | **Status**: [ ] not started
**AC**: AC-US1-02, AC-US1-03

**Description**: Modify `startProxyOnly()` in `cli.mjs` to pass an `onReady` callback to `createProxy()` that calls `generateSetupOutput()` when `opts.setup` is truthy.

**Implementation Details**:
- After the `createProxy()` call at `cli.mjs:458`, pass `onReady` in the options
- The callback: `onReady: opts.setup ? (actualPort) => { console.log(generateSetupOutput(actualPort, { token: opts.token, format: opts.setup === 'json' ? 'json' : undefined })); } : undefined`

**Dependencies**: T-001, T-002, T-003
**Estimate**: haiku

---

## Phase 2: Banner & Help (P1)

### T-005: Enhance printBanner() with pure-proxy hint
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-02 | **Status**: [ ] not started
**AC**: AC-US2-01, AC-US2-02

**Description**: Add a line to `printBanner()` in `proxy.mjs` after the existing "Next step" section showing how to use the proxy with stock Claude Code.

**Implementation Details**:
- After the `console.log(\`  ${C.bold(\`npx anymodel${portFlag}\`)}\`)` line at `proxy.mjs:911`
- Add: `console.log(\`  ${C.cyan('Or use with latest Claude Code:')} ${C.bold(\`npx anymodel proxy --setup\`)}\`);`
- Uses existing ANSI color scheme: cyan for label, bold for command

**Test Plan**:
- Visual verification -- banner output is console.log, not easily unit-testable
- Verified by running `node cli.mjs proxy --help` and inspecting output

**Dependencies**: None (can be done in parallel with Phase 1)
**Estimate**: haiku

---

### T-006: Update printHelp() with --setup documentation
**User Story**: US-003 | **Satisfies ACs**: AC-US3-01 | **Status**: [ ] not started
**AC**: AC-US3-01

**Description**: Add `--setup` to the "Proxy Options" section in `printHelp()` in `cli.mjs`.

**Implementation Details**:
- After the `--rpm` line at `cli.mjs:151`, add:
  `    --setup         Print Claude Code setup instructions (use --setup json for machine-readable)`

**Dependencies**: None
**Estimate**: haiku

---

### T-007: Update printQuickUsage() with --setup mention
**User Story**: US-003 | **Satisfies ACs**: AC-US3-02 | **Status**: [ ] not started
**AC**: AC-US3-02

**Description**: Add a `--setup` example to the "Commands" block in `printQuickUsage()` in `cli.mjs`.

**Implementation Details**:
- After the `anymodel claude` line at `cli.mjs:114`, add:
  `  anymodel proxy <preset> --setup  Print Claude Code connection setup`

**Dependencies**: None
**Estimate**: haiku

---

## Phase 3: Documentation (P2)

### T-008: Add "Use with Latest Claude Code" section to README.md
**User Story**: US-004 | **Satisfies ACs**: AC-US4-01, AC-US4-02, AC-US4-03, AC-US4-04 | **Status**: [ ] not started
**AC**: AC-US4-01, AC-US4-02, AC-US4-03, AC-US4-04

**Description**: Add a new section to README.md after "Quick Start" that documents the pure-proxy workflow. Update CLI Reference and Environment Variables tables.

**Implementation Details**:
- New section titled "Use with Latest Claude Code" after the "Quick Start" section (after line 33)
- Contains: explanation, 3-step workflow, value-add bullets, `--setup json` reference
- Add `--setup` to CLI Reference table
- Add `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` to Environment Variables table with pure-proxy note

**Dependencies**: None (can be done in parallel)
**Estimate**: opus

---

### T-009: Update site landing page with pure-proxy workflow
**User Story**: US-005 | **Satisfies ACs**: AC-US5-01, AC-US5-02, AC-US5-03, AC-US5-04 | **Status**: [ ] not started
**AC**: AC-US5-01, AC-US5-02, AC-US5-03, AC-US5-04

**Description**: Update `site/index.html` with a new example card, updated How It Works section, new FAQ entry, and updated architecture diagram.

**Implementation Details**:
- New example card in #examples section with "Pure Proxy" tag badge
- How It Works section updated to show dual workflow (bundled + pure proxy)
- New FAQ: "Can I use my own Claude Code installation?"
- Architecture diagram showing both client paths

**Dependencies**: None (can be done in parallel)
**Estimate**: opus

---

### T-010: Update KNOWLEDGE-BASE.md with pure-proxy documentation
**User Story**: US-006 | **Satisfies ACs**: AC-US6-01, AC-US6-02 | **Status**: [ ] not started
**AC**: AC-US6-01, AC-US6-02

**Description**: Add "Pure Proxy Mode" section to KNOWLEDGE-BASE.md and update architecture diagram.

**Implementation Details**:
- New section after "Architecture" explaining pure-proxy mode, `--setup` flag, value proposition, relationship between `cli.mjs`, `cli.js`, and stock `claude`
- Updated architecture diagram showing both client paths

**Dependencies**: None (can be done in parallel)
**Estimate**: haiku

---

## Phase 4: Verification

### T-011: Run full test suite and verify no regressions
**User Story**: US-007 | **Satisfies ACs**: AC-US7-05 | **Status**: [ ] not started
**AC**: AC-US7-05

**Description**: Run `node --test test/*.test.mjs` and verify all existing + new tests pass.

**Test Plan**:
- Run: `node --test test/*.test.mjs`
- All existing 40+ tests pass
- All new setup-related tests pass
- Zero regressions

**Dependencies**: T-001 through T-010
**Estimate**: haiku
