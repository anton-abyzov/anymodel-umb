# 0018 — AnyModel vs OpenCode: Head-to-Head Reliability Benchmark

## Problem

No empirical comparison exists between the AnyModel stack (Claude Code → anymodel proxy → Ollama) and OpenCode (→ Ollama direct) on identical local-model coding tasks. KNOWLEDGE-BASE.md names OpenCode as the main competitor; docs contain only AnyModel-internal baselines. Marketing and engineering both need real evidence.

## User Stories

### US-001: Side-by-side evidence
As the AnyModel maintainer, I want both stacks run on identical, objectively-verifiable coding tasks against the same local model, so that I can claim (or fix) reliability parity with data.

- [ ] AC-US1-01: Benchmark harness runs N tasks × R reps per arm against qwen3-coder:30b on the same Ollama server, fresh workspace per run
- [ ] AC-US1-02: Per-run metrics captured: success (artifact verifier), wall time, turns, tool calls by name, tokens, error class (timeout / zero-tool-execution / crash)
- [ ] AC-US1-03: Skill usage measured via a seeded project skill task discoverable by both harnesses
- [ ] AC-US1-04: HTML report renders arms side-by-side (AnyModel left, OpenCode right) with summary cards, per-task table, and raw log links, served at a clickable localhost URL

### US-002: Reliability gap closure
As a user running `anymodel proxy ollama`, I want text-channel tool-call recovery on the Ollama native provider, so that Qwen-XML emissions execute instead of silently ending the turn.

- [ ] AC-US2-01: providers/ollama.mjs recovers Hermes/Qwen-XML/paren text tool calls in non-streaming responses (parity with openai.mjs)
- [ ] AC-US2-02: Streaming translator buffers suspect text and recovers tool calls at flush; emits message_stop even when the NDJSON stream ends without done:true
- [ ] AC-US2-03: Unit tests cover the recovery paths; full suite stays green
- [ ] AC-US2-04: Re-run of the benchmark's AnyModel arm shows measurably improved task success vs the 1.16.2 baseline
