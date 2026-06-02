---
id: US-005
feature: FS-010
title: "Edge cases & CLI (P2)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** user."
project: anymodel
---

# US-005: Edge cases & CLI (P2)

**Feature**: [FS-010](./FEATURE.md)

**As a** user
**I want** re-injection to work on short prompts and from the CLI flag
**So that** the feature is reliable and ergonomic.

---

## Acceptance Criteria

- [x] **AC-US5-01**: Re-injection ALSO runs when the incoming flattened system is already ≤ the cap (short-prompt turn-1), not only when it exceeds the cap.
- [x] **AC-US5-02**: `--local-fidelity full` at the CLI exports `LOCAL_FIDELITY=full` to the proxy and produces a richer index (whenToUse retained) than balanced; MCP suppression behavior is unchanged by the flag.

---

## Implementation

**Increment**: [0010-local-skill-fidelity](../../../../../increments/0010-local-skill-fidelity/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
