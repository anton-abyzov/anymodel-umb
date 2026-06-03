#!/usr/bin/env node
// Model bench harness — hits LMStudio /v1/chat/completions directly for clean perf metrics.
// Records: TTFT (time-to-first-token), total time, tok/sec, output length, tool-call validity.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LMS_URL = process.env.LMS_URL || 'http://127.0.0.1:1234/v1/chat/completions';
const OUT_DIR = join(__dirname, 'results');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const MODELS = process.env.MODELS?.split(',') || [
  'google/gemma-4-26b-a4b',
  'google/gemma-4-31b',
  'qwen/qwen3-coder-30b',
];

// ── Scenarios ───────────────────────────────────────────────

const SCENARIOS = [
  {
    id: 'S1-simple',
    title: 'Simple function',
    messages: [
      { role: 'system', content: 'You are a concise coding assistant. Return only code, no prose.' },
      { role: 'user', content: 'Write a Python function `reverse_words(s)` that reverses the order of words in a string. No explanation.' },
    ],
    max_tokens: 256,
    // Validators run on final text
    validate(text) {
      const lc = text.toLowerCase();
      return {
        hasDef: /def\s+reverse_words\s*\(/.test(text),
        usesSplit: /\.split\(/.test(text),
        usesJoin: /\.join\(/.test(text),
        usesReversed: /(reversed|\[::-1\])/.test(text),
      };
    },
  },

  {
    id: 'S2-tool-call',
    title: 'Tool call (function calling)',
    messages: [
      { role: 'system', content: 'You call tools when needed. When you need live data, emit a tool call.' },
      { role: 'user', content: 'What is the weather in Tokyo right now? Use the get_weather tool.' },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather for a city',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' },
              units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['city'],
          },
        },
      },
    ],
    max_tokens: 256,
    validate(text, tc) {
      if (!tc || !tc.length) return { gotToolCall: false };
      const call = tc[0];
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
      return {
        gotToolCall: true,
        correctName: call.function?.name === 'get_weather',
        hasCity: !!args.city,
        cityIsTokyo: (args.city || '').toLowerCase().includes('tokyo'),
        validJSON: call.function?.arguments ? (() => { try { JSON.parse(call.function.arguments); return true; } catch { return false; } })() : false,
      };
    },
  },

  {
    id: 'S3-multi-tool-plan',
    title: 'Multi-step tool plan (agentic)',
    messages: [
      { role: 'system', content: 'You are a coding agent. Plan multi-step tool calls. Emit ALL needed tool calls in one turn.' },
      { role: 'user', content: 'I need to read the file /tmp/readme.md, then search the project for "TODO", then write a summary to /tmp/summary.md. Use the tools.' },
    ],
    tools: [
      { type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
      { type: 'function', function: { name: 'grep', description: 'Search codebase', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
      { type: 'function', function: { name: 'write_file', description: 'Write a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
    ],
    max_tokens: 512,
    validate(text, tc) {
      const names = (tc || []).map(c => c.function?.name);
      return {
        callCount: names.length,
        hasReadFile: names.includes('read_file'),
        hasGrep: names.includes('grep'),
        hasWriteFile: names.includes('write_file'),
        allThree: ['read_file', 'grep', 'write_file'].every(n => names.includes(n)),
      };
    },
  },

  {
    id: 'S4-spec-structured',
    title: 'SpecWeave-style structured spec',
    messages: [
      { role: 'system', content: 'You are a Product Manager. Write a short SpecWeave-style spec with user stories and ACs. Use markdown with ### US-001 headings and AC-US1-NN checklist items.' },
      { role: 'user', content: 'Write a spec for a feature: "web-based calculator with basic arithmetic and history". 2 user stories, 3 acceptance criteria each.' },
    ],
    max_tokens: 1024,
    validate(text) {
      return {
        hasUS001: /### US-001/.test(text),
        hasUS002: /### US-002/.test(text),
        hasAC: /AC-US[12]-0[123]/.test(text),
        hasCheckboxes: /- \[ \]/.test(text),
        markdownStructure: /\*\*Acceptance Criteria\*\*/.test(text) || /## /.test(text),
      };
    },
  },

  {
    id: 'S5-complex-webapp',
    title: 'Complex: full web calculator (HTML+CSS+JS)',
    messages: [
      { role: 'system', content: 'You are a senior frontend engineer. Output a COMPLETE single-file HTML with inline CSS and JS for the described app. No explanation before/after — just the code.' },
      { role: 'user', content: `Build a web calculator with:
- Buttons: 0-9, +, -, *, /, =, C (clear), . (decimal)
- Display showing current expression + result
- History panel showing last 5 calculations
- Keyboard input support
- Responsive CSS grid layout
- Dark mode with CSS variables
Single HTML file. Make it work end-to-end.` },
    ],
    max_tokens: 3072,
    validate(text) {
      return {
        hasHTML: /<!DOCTYPE html>|<html/i.test(text),
        hasStyle: /<style/.test(text),
        hasScript: /<script/.test(text),
        hasButtons: (text.match(/<button/gi) || []).length >= 10,
        hasGrid: /display:\s*grid|grid-template/.test(text),
        hasCSSVars: /--[a-z-]+:/.test(text),
        hasKeyboardHandler: /keydown|keypress|addEventListener\s*\(\s*['"]key/.test(text),
        hasHistoryPanel: /history/i.test(text),
        approxCompleteness: text.length,
      };
    },
  },
];

// ── Runner ──────────────────────────────────────────────────

function postJSON(url, body) {
  return new Promise(async (resolve, reject) => {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const totalMs = Date.now() - t0;
    const data = await res.json();
    resolve({ status: res.status, data, totalMs });
  });
}

async function postStream(url, body) {
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
  }

  let firstTokenMs = null;
  let text = '';
  const toolCalls = [];
  let tokCount = 0;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
          text += delta.content;
          tokCount++;
        }
        if (delta.tool_calls) {
          if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) toolCalls[idx] = { function: { name: '', arguments: '' } };
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            tokCount++;
          }
        }
      } catch {}
    }
  }

  const totalMs = Date.now() - t0;
  return { firstTokenMs, totalMs, text, toolCalls, tokCount };
}

async function runOnce(model, scenario) {
  const body = {
    model,
    messages: scenario.messages,
    max_tokens: scenario.max_tokens,
    temperature: 0.1,
  };
  if (scenario.tools) body.tools = scenario.tools;

  try {
    const r = await postStream(LMS_URL, body);
    if (r.error) return { error: r.error };
    const validation = scenario.validate(r.text, r.toolCalls);
    const outputTokens = r.tokCount;
    const toksPerSec = outputTokens && r.totalMs > 0 ? (outputTokens * 1000 / r.totalMs).toFixed(1) : '0';
    return {
      model,
      scenario: scenario.id,
      ttft_ms: r.firstTokenMs,
      total_ms: r.totalMs,
      toks: outputTokens,
      toks_per_sec: toksPerSec,
      text_preview: r.text.slice(0, 400),
      text_len: r.text.length,
      tool_calls: r.toolCalls.map(tc => ({ name: tc.function?.name, args_preview: (tc.function?.arguments || '').slice(0, 200) })),
      validation,
    };
  } catch (e) {
    return { model, scenario: scenario.id, error: e.message };
  }
}

async function loadModel(model) {
  // LMStudio lazy-loads on first request — just do a short warmup
  try {
    await fetch(LMS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    });
  } catch {}
}

async function main() {
  const results = [];
  console.log(`Bench: ${MODELS.length} models × ${SCENARIOS.length} scenarios`);
  console.log('');

  for (const model of MODELS) {
    console.log(`=== Model: ${model} ===`);
    console.log('  warming up...');
    await loadModel(model);

    for (const scenario of SCENARIOS) {
      process.stdout.write(`  ${scenario.id} (${scenario.title}) ... `);
      const t0 = Date.now();
      const r = await runOnce(model, scenario);
      if (r.error) {
        console.log(`ERROR: ${r.error.slice(0, 100)}`);
      } else {
        console.log(`${r.ttft_ms}ms ttft, ${r.toks_per_sec} tok/s, ${r.text_len}B, ${r.tool_calls?.length || 0} tool calls`);
      }
      results.push(r);
    }
    console.log('');
  }

  const outFile = join(OUT_DIR, `bench-${Date.now()}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`Saved: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
