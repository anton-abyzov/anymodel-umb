---
id: US-003
feature: FS-010
title: "Prefix-cache determinism (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** user on a local MLX model."
project: anymodel
---

# US-003: Prefix-cache determinism (P1)

**Feature**: [FS-010](./FEATURE.md)

**As a** user on a local MLX model
**I want** the re-injected block to be a one-time cost
**So that** turn-2+ stays fast via KV-cache reuse.

---

## Acceptance Criteria

- [x] **AC-US3-01**: `parsed.system` is byte-identical across 3 consecutive identical requests (date-normalized) — `computePrefixHash` returns the same hash all 3 times.
- [x] **AC-US3-02**: `prefix-cache.getOrStore` is invoked for `lmstudio` and `llamacpp` providers (gate widened from ollama-only), reporting `hit=true` on the 2nd identical request.

---

## Implementation

**Increment**: [0010-local-skill-fidelity](../../../../../increments/0010-local-skill-fidelity/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

- [x] **T-010**: Integration test suite
