---
id: US-003
feature: FS-013
title: "Tool-result images are not silently dropped"
status: not_started
priority: P1
created: 2026-06-02
tldr: "**As a** user whose task includes a Playwright screenshot or image tool result."
project: anymodel
---

# US-003: Tool-result images are not silently dropped

**Feature**: [FS-013](./FEATURE.md)

**As a** user whose task includes a Playwright screenshot or image tool result
**I want** image/document blocks in `tool_result` represented instead of dropped
**So that** the model doesn't reason over a partial turn and hallucinate state

---

## Acceptance Criteria

- [ ] **AC-US3-01**: An image block in a `tool_result` is emitted as `[image omitted: <N> bytes, <mime>]` for non-vision backends (never silent `''`).
- [ ] **AC-US3-02**: Where the backend supports vision, the image is forwarded as an image part.
- [ ] **AC-US3-03**: Document blocks get an analogous `[document omitted]` marker.

---

## Implementation

**Increment**: [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
