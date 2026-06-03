---
id: US-006
feature: FS-013
title: "A local-agentic profile relaxes over-constrained hooks"
status: not_started
priority: P1
created: 2026-06-02
tldr: "**As a** user running a local model inside a SpecWeave (or similarly hook-heavy) repo."
project: anymodel
---

# US-006: A local-agentic profile relaxes over-constrained hooks

**Feature**: [FS-013](./FEATURE.md)

**As a** user running a local model inside a SpecWeave (or similarly hook-heavy) repo
**I want** a documented "local agentic" preset that relaxes mandatory-plan-mode / blocking-SKILL-FIRST directives
**So that** the model isn't commanded to do things that are structurally impossible under `--strict-mcp-config`

---

## Acceptance Criteria

- [ ] **AC-US6-01**: A preset/flag (and `LOCAL_SETUP.md` docs) lets local sessions disable mandatory plan-mode and blocking SKILL-FIRST language, and surfaces guidance to prefer `--full-mcp` when the project depends on the Skill tool.
- [ ] **AC-US6-02**: Default behavior is unchanged unless the preset/flag is opted into.

---

## Implementation

**Increment**: [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
