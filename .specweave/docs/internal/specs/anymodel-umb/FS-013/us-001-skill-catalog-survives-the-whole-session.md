---
id: US-001
feature: FS-013
title: "Skill catalog survives the whole session"
status: not_started
priority: P1
created: 2026-06-02
tldr: "**As a** developer driving Claude Code through a local-provider proxy."
project: anymodel
---

# US-001: Skill catalog survives the whole session

**Feature**: [FS-013](./FEATURE.md)

**As a** developer driving Claude Code through a local-provider proxy
**I want** the skill catalog re-injected on every turn (not just turn 1) and a loud warning when re-injection is missing
**So that** the model can keep triggering SpecWeave/project skills across a long task instead of looping or hedging

---

## Acceptance Criteria

- [ ] **AC-US1-01**: When a turn-2+ request arrives with no `<system-reminder>` skill catalog, the proxy re-injects the catalog harvested and cached on turn 1 (per-session, stable key).
- [ ] **AC-US1-02**: `buildBehavioralCore` no longer emits the dangling "available skills listed below" reference when no catalog is available for that turn.
- [ ] **AC-US1-03**: On the first request, if the incoming request contains a Skill tool + skill catalog but re-injection is absent or disabled (the 1.14.1 trim-without-restore state), the proxy logs a single explicit WARNING naming the condition and the fix.

---

## Implementation

**Increment**: [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
