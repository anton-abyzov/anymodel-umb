---
id: US-003
feature: FS-016
title: "Project-dir sourcing (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** user."
project: anymodel
---

# US-003: Project-dir sourcing (P1)

**Feature**: [FS-016](./FEATURE.md)

**As a** user
**I want** the proxy to find my project's skills from a configurable directory
**So that** scoping works without a client change.

---

## Acceptance Criteria

- [x] **AC-US3-01**: `readProjectSkillNames(dir)` returns the subdir names under `<dir>/.claude/skills/` that contain `SKILL.md`, is memoized per dir, and returns `[]` (no throw) on a missing/unreadable dir.
- [x] **AC-US3-02**: The proxy resolves the project dir from `LOCAL_PROJECT_DIR`, falling back to `process.cwd()`.

---

## Implementation

**Increment**: [0016-project-scoped-local-skills](../../../../../increments/0016-project-scoped-local-skills/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
