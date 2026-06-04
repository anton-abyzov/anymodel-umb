---
increment: 0017-claude-code-surface-audit
title: "Claude Code surface audit and prune"
type: refactor
priority: P1
status: completed
created: 2026-06-04
structure: user-stories
test_mode: TDD
coverage_target: 80
---

# Spec: Claude Code Surface Audit and Prune

## Problem

AnyModel still carries inherited Claude Code compatibility surfaces. Some are required because the bundled `cli.js` client speaks Anthropic Messages and loads `.claude/*`; others are stale fallbacks, stale Worker logic, or setup docs that imply support that is no longer true.

## Goal

Keep the required Claude Code bridge working, remove unused historical coupling, and make request knobs such as `--effort` either work where safely supported or be clearly documented as intentionally ignored.

## User Stories

### US-001: Runtime surface classification
**Project**: anymodel

**As a** maintainer
**I want** every Claude-derived runtime surface classified as keep, prune, or document
**So that** AnyModel does not keep accidental Claude Code baggage.

**Acceptance Criteria**:
- [x] **AC-US1-01**: `plan.md` records the audited runtime surfaces and their disposition.
- [x] **AC-US1-02**: Required surfaces stay covered by tests or setup docs: bundled `cli.js`, Anthropic `/v1/messages`, local `.claude/.mcp.json`, local `.claude/skills`, local `.claude/agents`, `CLAUDE.md`, and universal skill bridge.
- [x] **AC-US1-03**: Historical client discovery for sibling/home `claude-code*` repos is removed; explicit `ANYMODEL_CLIENT`, bundled/local `cli.js`, and global `claude` fallback remain.

### US-002: Effort handling is no longer a no-op
**Project**: anymodel

**As an** AnyModel user
**I want** Claude Code `--effort` / `/effort` settings to influence compatible providers
**So that** the UI does not claim a setting that AnyModel silently discards.

**Acceptance Criteria**:
- [x] **AC-US2-01**: `sanitizeBody` strips raw `output_config` before provider egress but preserves `output_config.effort` internally.
- [x] **AC-US2-02**: OpenAI provider maps preserved effort to Chat Completions `reasoning_effort` for compatible OpenAI reasoning/codex models.
- [x] **AC-US2-03**: `max` is downgraded to `high` for OpenAI Chat compatibility; invalid/numeric internal-only values are not forwarded.
- [x] **AC-US2-04**: Local providers do not receive `reasoning_effort` by default, avoiding LM Studio / llama.cpp rejection.

### US-003: Worker parity with npm proxy
**Project**: anymodel

**As a** maintainer
**I want** the Cloudflare Worker surface to follow current AnyModel free-model rules
**So that** deployed `api.anymodel.dev` does not retain stale allowlists.

**Acceptance Criteria**:
- [x] **AC-US3-01**: Worker removes the `FREE_MODELS` allowlist and trusts `:free` plus `openrouter/free`.
- [x] **AC-US3-02**: Worker default free replacement model remains configurable and valid.
- [x] **AC-US3-03**: Worker tests run in the normal test command.

### US-004: Setup docs match the kept surface
**Project**: anymodel

**As a** user
**I want** docs to explain what is kept and why
**So that** I can set up Claude Code, local MCP, skills, and effort intentionally.

**Acceptance Criteria**:
- [x] **AC-US4-01**: README / LOCAL_SETUP / KNOWLEDGE-BASE / AnyModel skill docs describe the current client discovery order and remove historical `claude-code-anymodel` setup.
- [x] **AC-US4-02**: Docs state that `cli.js` is kept because `npx anymodel` launches a Claude Code-compatible TUI.
- [x] **AC-US4-03**: Docs state where effort is forwarded and where it is intentionally ignored.

## Non-goals

- Replacing the bundled Claude Code-compatible client.
- Removing Anthropic Messages support.
- Rewriting local fidelity, MCP suppression, or universal skill discovery.
- Changing public CLI command names.

## Success Criteria

- `npm test` passes, including Worker tests.
- `node --check cli.mjs proxy.mjs providers/*.mjs worker/*.mjs` passes.
- `npm pack --dry-run` shows intended shipped files only.
