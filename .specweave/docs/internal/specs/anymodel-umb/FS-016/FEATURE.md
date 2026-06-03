---
id: FS-016
title: "Project-scoped local skill index"
type: feature
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
lastUpdated: 2026-06-03
tldr: "Add a **scope** dimension to the 0010 re-injection: `balanced` (default) → a small, stable, project-scoped index (project `.claude/skills` names + a curated workflow-core), `full` → the whole catalog (= 0010 behavior), `lean` → nothing."
complexity: high
stakeholder_relevant: true
---

# Project-scoped local skill index

## TL;DR

**What**: Add a **scope** dimension to the 0010 re-injection: `balanced` (default) → a small, stable, project-scoped index (project `.claude/skills` names + a curated workflow-core), `full` → the whole catalog (= 0010 behavior), `lean` → nothing.
**Status**: completed | **Priority**: P1
**User Stories**: 4

![Project-scoped local skill index illustration](assets/feature-fs-016.jpg)

## Overview

Add a **scope** dimension to the 0010 re-injection: `balanced` (default) → a small, stable, project-scoped index (project `.claude/skills` names + a curated workflow-core), `full` → the whole catalog (= 0010 behavior), `lean` → nothing. Isolated to `providers/skill-catalog.mjs` + `proxy.mjs` (no `cli.mjs` change — uses `LOCAL_PROJECT_DIR`/cwd to avoid colliding with parallel `cli.mjs` work). Tool handling untouched.

## Implementation History

| Increment | Status | Completion Date |
|-----------|--------|----------------|
| [0016-project-scoped-local-skills](../../../../../increments/0016-project-scoped-local-skills/spec.md) | ✅ completed | 2026-06-02T00:00:00.000Z |

## User Stories

- [US-001: Project-scoped default (P1)](./us-001-project-scoped-default-p1.md)
- [US-002: Stable & cacheable (P1)](./us-002-stable-cacheable-p1.md)
- [US-003: Project-dir sourcing (P1)](./us-003-project-dir-sourcing-p1.md)
- [US-004: Stability / backward-compat (P1)](./us-004-stability-backward-compat-p1.md)
