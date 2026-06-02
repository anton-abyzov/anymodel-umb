---
id: US-001
feature: FS-010
title: "Skill catalog re-injection (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** developer running Claude Code against a local model through AnyModel."
project: anymodel
---

# US-001: Skill catalog re-injection (P1)

**Feature**: [FS-010](./FEATURE.md)

**As a** developer running Claude Code against a local model through AnyModel
**I want** the skill catalog re-injected (compactly) into the request
**So that** the local model knows which skills exist and auto-calls the Skill tool when a request matches.

---

## Acceptance Criteria

- [x] **AC-US1-01**: On a local provider with `LOCAL_FIDELITY=balanced` (default), a request whose user message contains the `"The following skills are available for use with the Skill tool:"` system-reminder results in `parsed.system` containing an `"Available skills (call the Skill tool when a request matches"` block listing the harvested skill names.
- [x] **AC-US1-02**: The re-injected index drops the ` - whenToUse` tail and clamps each description to `LOCAL_SKILL_DESC_CHARS` (default 140) chars per line.
- [x] **AC-US1-03**: The Skill tool definition remains present in `body.tools` after all local transforms, even at minimal tool budget (Skill + ToolSearch never-evict guard).
- [x] **AC-US1-04**: The raw verbose `<system-reminder>` block is still stripped from `parsed.messages` (catalog lives only in system now — no duplication).

---

## Implementation

**Increment**: [0010-local-skill-fidelity](../../../../../increments/0010-local-skill-fidelity/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

- [x] **T-005**: Re-inject into parsed.system (both branches) + env knobs + log
- [x] **T-010**: Integration test suite
