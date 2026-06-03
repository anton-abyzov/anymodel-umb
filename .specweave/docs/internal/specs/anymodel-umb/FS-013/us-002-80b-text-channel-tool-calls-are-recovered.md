---
id: US-002
feature: FS-013
title: "80B text-channel tool calls are recovered"
status: not_started
priority: P1
created: 2026-06-02
tldr: "**As a** user running `qwen3-coder-next` (80B)."
project: anymodel
---

# US-002: 80B text-channel tool calls are recovered

**Feature**: [FS-013](./FEATURE.md)

**As a** user running `qwen3-coder-next` (80B)
**I want** the text-channel recovery parser to handle the paren-variant call form
**So that** an 80B tool call isn't mis-captured as a tool named `web_fetch(url="...")` with empty input

---

## Acceptance Criteria

- [ ] **AC-US2-01**: `<function=name(arg="v", ...)>` (paren-variant, including an unclosed `<tool_call>` wrapper) parses to `name` + `input{arg:"v",...}`.
- [ ] **AC-US2-02**: Canonical Qwen-XML and Hermes JSON forms continue to parse (no regression).
- [ ] **AC-US2-03**: A prose mention of `<function=...>` that is not a real call is NOT converted (false-positive guard).

---

## Implementation

**Increment**: [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
