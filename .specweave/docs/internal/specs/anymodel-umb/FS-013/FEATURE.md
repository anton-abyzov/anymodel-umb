---
id: FS-013
title: "Local agentic reliability hardening (post-1.15.0)"
type: feature
status: planned
priority: P1
created: 2026-06-02
lastUpdated: 2026-06-02
tldr: "Root-cause diagnosis (2026-06-02, `docs/2026-06-02-qwen-local-agentic-diagnosis.md`) found that local."
complexity: high
stakeholder_relevant: true
---

# Local agentic reliability hardening (post-1.15.0)

## TL;DR

**What**: Root-cause diagnosis (2026-06-02, `docs/2026-06-02-qwen-local-agentic-diagnosis.md`) found that local.
**Status**: planned | **Priority**: P1
**User Stories**: 6

![Local agentic reliability hardening (post-1.15.0) illustration](assets/feature-fs-013.jpg)

## Overview

Root-cause diagnosis (2026-06-02, `docs/2026-06-02-qwen-local-agentic-diagnosis.md`) found that local
Qwen "isn't usable" for agentic coding was **primarily** a version skew: the published/global
`anymodel@1.14.1` strips Claude Code's system prompt + skill catalog + behavioral rules but has **no
re-injection**; the restore half (`skill-catalog.mjs`, increment 0010) shipped only in `1.15.0`. That
dominant cause is **already fixed** in 1.15.0 (now installed globally). The single-turn translation path
(P0.1 flush, P0.2 text-channel recovery, P0.3 timeout, P1.1 per-index routing) is verified sound
(444/444 tests + live probes).

## Implementation History

| Increment | Status | Completion Date |
|-----------|--------|----------------|
| [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md) | ⏳ planned | 2026-06-02 |

## User Stories

- [US-001: Skill catalog survives the whole session](./us-001-skill-catalog-survives-the-whole-session.md)
- [US-002: 80B text-channel tool calls are recovered](./us-002-80b-text-channel-tool-calls-are-recovered.md)
- [US-003: Tool-result images are not silently dropped](./us-003-tool-result-images-are-not-silently-dropped.md)
- [US-004: Refusal loops are recoverable](./us-004-refusal-loops-are-recoverable.md)
- [US-005: Plan state survives history condensing](./us-005-plan-state-survives-history-condensing.md)
- [US-006: A local-agentic profile relaxes over-constrained hooks](./us-006-a-local-agentic-profile-relaxes-over-constrained-hooks.md)
