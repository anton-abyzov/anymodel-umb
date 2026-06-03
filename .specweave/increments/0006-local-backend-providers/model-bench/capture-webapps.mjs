#!/usr/bin/env node
// Capture full S5 webapp output from each model + spec from S4, save to disk for quality review

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LMS_URL = 'http://127.0.0.1:1234/v1/chat/completions';
const OUT = join(__dirname, 'quality');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const MODELS = [
  'google/gemma-4-26b-a4b',
  'mlx-community/gemma-4-26b-a4b-it',
  'qwen/qwen3-coder-30b',
  // skip gemma-4-31b — too slow, already have data
];

const TESTS = [
  {
    id: 'S4-spec',
    filename: (m) => `${OUT}/${m.replace('/', '__')}_spec.md`,
    messages: [
      { role: 'system', content: 'You are a Product Manager. Write a short SpecWeave-style spec with user stories and ACs. Use markdown with ### US-001 headings and AC-US1-NN checklist items.' },
      { role: 'user', content: 'Write a spec for a feature: "web-based calculator with basic arithmetic and history". 2 user stories, 3 acceptance criteria each.' },
    ],
    max_tokens: 1024,
  },
  {
    id: 'S5-webapp',
    filename: (m) => `${OUT}/${m.replace('/', '__')}_calc.html`,
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
  },
];

async function runAndCapture(model, test) {
  const body = { model, messages: test.messages, max_tokens: test.max_tokens, temperature: 0.1 };
  const t0 = Date.now();
  const res = await fetch(LMS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  const ms = Date.now() - t0;
  const content = data.choices?.[0]?.message?.content || '';
  const reasoning = data.choices?.[0]?.message?.reasoning_content || '';
  const usage = data.usage || {};
  return { ms, content, reasoning, usage };
}

async function main() {
  for (const model of MODELS) {
    console.log(`=== ${model} ===`);
    for (const test of TESTS) {
      process.stdout.write(`  ${test.id}... `);
      const r = await runAndCapture(model, test);
      const f = test.filename(model);
      writeFileSync(f, r.content);
      console.log(`${r.ms}ms | ${r.content.length}B content | ${r.reasoning.length}B reasoning | usage: ${JSON.stringify(r.usage)}`);
      writeFileSync(f.replace(/\.(md|html)$/, '.meta.json'), JSON.stringify({
        model, test: test.id, totalMs: r.ms, contentLen: r.content.length, reasoningLen: r.reasoning.length, usage: r.usage,
      }, null, 2));
    }
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
