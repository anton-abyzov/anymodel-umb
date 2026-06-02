---
id: US-006
feature: FS-010
title: "Capability eval (regression gate) (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** maintainer."
project: anymodel
---

# US-006: Capability eval (regression gate) (P1)

**Feature**: [FS-010](./FEATURE.md)

**As a** maintainer
**I want** a measured floor on real skill triggering
**So that** the feature demonstrably works on the target local model.

---

## Acceptance Criteria

- [x] **AC-US6-01**: For a curated set of 10-20 prompts each designed to match a known skill, qwen3-coder-30b on the local path calls the Skill tool with a valid skill name on **≥60%** of prompts (regression gate vs the current 0% auto-trigger).

---

## Implementation

**Increment**: [0010-local-skill-fidelity](../../../../../increments/0010-local-skill-fidelity/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
