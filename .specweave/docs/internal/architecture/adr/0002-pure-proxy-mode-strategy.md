# 0002: Pure Proxy Mode Implementation Strategy

**Date**: 2026-04-08
**Status**: Accepted
**Increment**: 0005-pure-proxy-mode

## Context

AnyModel currently ships a bundled, modified `cli.js` (~13MB fork of Claude Code v2.1.88) as the client. This creates three problems:

1. **Version lock**: Users are stuck on whichever Claude Code version was bundled, missing upstream features and bug fixes
2. **Legal risk**: Anthropic's third-party distribution cutoff (April 4, 2026) makes distributing a modified Claude Code client legally precarious
3. **Package bloat**: The 13MB `cli.js` dominates the npm package size

Stock Claude Code already supports `ANTHROPIC_BASE_URL` for custom endpoints. The `connectToProxy()` function in `cli.mjs:280-341` already sets `ANTHROPIC_BASE_URL=http://localhost:{port}` and `ANTHROPIC_API_KEY=anymodel-proxy` when spawning the bundled client. The proxy itself is provider-agnostic -- it works identically whether the client is the bundled `cli.js` or stock `claude`.

## Decision

### 1. `--setup` as a modifier flag, not a standalone command

**Chosen**: `--setup` modifies `anymodel proxy` behavior -- the proxy starts normally AND prints setup instructions. It is NOT an "info and exit" flag.

**Rationale**: Users want to start the proxy and immediately see how to connect. Two separate commands (`anymodel proxy deepseek` then `anymodel setup`) would require the user to know the port and model, duplicating information. A single command does both.

**Rejected alternative -- standalone `anymodel setup` command**: Would require a running proxy to query, or would need the user to pass `--port` manually. Adds complexity to the CLI dispatch in `cli.mjs:462-502` with a new mode.

**Rejected alternative -- `--setup` as "print and exit"**: The user would need to run the command twice (once for setup info, once to start the proxy). The proxy needs to be running when the user copies the exports and runs `claude`.

### 2. `generateSetupOutput()` as a pure function exported from `cli.mjs`

**Chosen**: A testable pure function that takes `(port, opts)` and returns a formatted string. Exported for test access.

**Rationale**: The function has no side effects (doesn't print, doesn't read env). Tests can validate the output format without spawning a server. The `startProxyOnly()` function is responsible for printing.

**Rejected alternative -- inline setup logic in `startProxyOnly()`**: Would make the setup output untestable without starting an actual server. The existing `parseArgs()` is already exported for testing -- same pattern.

### 3. `onReady` callback on `createProxy()` for port discovery

**Chosen**: Add an optional `onReady(actualPort)` callback parameter to `createProxy()`. Fires after `server.listen()` succeeds, after `printBanner()`.

**Rationale**: The actual bound port is only known inside the `server.listen()` callback due to auto-port-finding (`tryListen()`). The `--setup` output must include the real port. A callback is the simplest mechanism -- it doesn't change the `createProxy()` return type (still returns `server`), and existing callers don't need to change.

**Rejected alternative -- `createProxy()` returns Promise**: Would break the current synchronous return of the `server` object. Tests and the CLI both use this return value.

**Rejected alternative -- use configured port**: Would produce wrong output when auto-port-finding picks a different port (e.g., 9090 is busy, proxy binds to 9091).

### 4. `ANTHROPIC_API_KEY=anymodel-proxy` as the default key value

**Chosen**: Use `anymodel-proxy` as the API key value, matching the existing `connectToProxy()` at `cli.mjs:334`.

**Rationale**: Claude Code requires a non-empty `ANTHROPIC_API_KEY` to avoid "not logged in" errors. The proxy doesn't validate this key (it uses `OPENROUTER_API_KEY` or `OPENAI_API_KEY` for upstream auth). The value `anymodel-proxy` is self-documenting -- users can see it's not a real key. The same value is already used by the bundled client flow, ensuring consistency.

### 5. Banner hint without `--setup` -- always visible

**Chosen**: The proxy banner always shows a one-line hint about the pure-proxy workflow, regardless of whether `--setup` was passed.

**Rationale**: Discovery is the primary goal. A user who starts the proxy without `--setup` should still learn about the option. The hint is a single line -- non-intrusive but visible. The existing banner already has a "Next step" section with `npx anymodel`; the pure-proxy hint is a natural addition.

### 6. No changes to proxy protocol or HTTP behavior

**Chosen**: Zero changes to the HTTP proxy. This increment only modifies CLI flags, console output, and documentation.

**Rationale**: The proxy already works with stock Claude Code. Adding protocol changes would be scope creep and risk breaking existing users. The entire increment is about making an existing capability discoverable.

## Consequences

- Users can connect stock Claude Code to the proxy with 2 lines of shell exports
- The bundled `cli.js` remains available -- this is an additive change, not a replacement
- The `--setup` output is deterministic and testable as a pure function
- Auto-port-finding correctly propagates to setup output via the `onReady` callback
- All existing tests pass unchanged
- Future increments can deprecate the bundled `cli.js` by promoting the pure-proxy workflow
