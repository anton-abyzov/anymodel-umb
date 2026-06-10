#!/usr/bin/env node
// Head-to-head benchmark: AnyModel (claude -p → anymodel proxy → Ollama) vs OpenCode (→ Ollama direct).
// Same model (qwen3-coder:30b), same Ollama server, identical seeded tasks, artifact-based verification.
// Usage: node run-bench.mjs --arms anymodel,opencode --reps 3 [--tasks write-file,...] [--label baseline] [--timeout 240]

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a, i, arr) =>
  a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null
).filter(Boolean));

const ARMS = String(argv.arms || 'anymodel,opencode').split(',');
const REPS = parseInt(argv.reps || '3', 10);
const TIMEOUT_MS = parseInt(argv.timeout || '240', 10) * 1000;
const LABEL = String(argv.label || 'run');
const PROXY_URL = process.env.BENCH_PROXY_URL || 'http://localhost:9090';
const PROXY_LOG = process.env.BENCH_PROXY_LOG || '/tmp/anymodel-proxy.log';
const MODEL = 'qwen3-coder:30b';
const ROOT = `/tmp/bench-runs/${LABEL}`;
const OUT = process.env.BENCH_OUT || `/Users/antonabyzov/Projects/anymodel-umb/.specweave/increments/0018-anymodel-vs-opencode-benchmark/reports/results-${LABEL}.json`;

const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m|\x1b\[\?[0-9;]*[a-zA-Z]|\r/g, '');

// ---------- task definitions ----------
const SKILL_MD = `---
name: stamp
description: Stamp the current project. Use when asked to stamp the project or apply the project stamp.
---

# Stamp skill

To stamp the project, create a file named stamp.txt in the project root containing exactly one line:

STAMPED-BY-SKILL-V1
`;

const TASKS = [
  {
    id: 'write-file',
    prompt: 'Create a file named greeting.txt containing exactly one line: HELLO BENCH',
    setup() {},
    verify(dir) {
      try { return readFileSync(join(dir, 'greeting.txt'), 'utf8').trim() === 'HELLO BENCH'; } catch { return false; }
    },
  },
  {
    id: 'bash-count',
    prompt: 'Using a shell command, count how many .js files are in the current directory and write just that number to a file named count.txt',
    setup(dir) {
      for (const n of ['alpha', 'beta', 'gamma']) writeFileSync(join(dir, `${n}.js`), `// ${n}\n`);
    },
    verify(dir) {
      try { return readFileSync(join(dir, 'count.txt'), 'utf8').trim().replace(/\D/g, '') === '3'; } catch { return false; }
    },
  },
  {
    id: 'fix-bug',
    prompt: 'The test is failing. Run `node test.js`, fix the bug in add.js so the test passes, then run `node test.js` again to confirm it prints PASS.',
    setup(dir) {
      writeFileSync(join(dir, 'add.js'), 'module.exports = (a, b) => a - b;\n');
      writeFileSync(join(dir, 'test.js'),
        "const add = require('./add');\nif (add(2, 3) === 5 && add(10, 5) === 15) { console.log('PASS'); } else { console.log('FAIL'); process.exit(1); }\n");
    },
    verify(dir) {
      try { return execFileSync('node', ['test.js'], { cwd: dir, timeout: 10000 }).toString().includes('PASS'); } catch { return false; }
    },
  },
  {
    id: 'multi-file',
    prompt: 'Create index.html containing <h1>Bench</h1> and link it to a separate stylesheet style.css that makes h1 red. Create both files.',
    setup() {},
    verify(dir) {
      try {
        const html = readFileSync(join(dir, 'index.html'), 'utf8');
        const css = readFileSync(join(dir, 'style.css'), 'utf8');
        return /<h1>\s*Bench\s*<\/h1>/i.test(html) && /style\.css/.test(html) && /h1\s*{[^}]*red/i.test(css.replace(/\n/g, ' '));
      } catch { return false; }
    },
  },
  {
    id: 'edit-json',
    prompt: 'Edit config.json: change the port from 3000 to 8080. Keep every other field unchanged.',
    setup(dir) {
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ name: 'bench', port: 3000, debug: false }, null, 2) + '\n');
    },
    verify(dir) {
      try {
        const c = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
        return c.port === 8080 && c.name === 'bench' && c.debug === false;
      } catch { return false; }
    },
  },
  {
    id: 'skill-stamp',
    prompt: 'Use the stamp skill to stamp this project.',
    setup(dir) {
      for (const p of ['.claude/skills/stamp', '.opencode/skill/stamp', '.opencode/skills/stamp']) {
        mkdirSync(join(dir, p), { recursive: true });
        writeFileSync(join(dir, p, 'SKILL.md'), SKILL_MD);
      }
    },
    verify(dir) {
      try { return readFileSync(join(dir, 'stamp.txt'), 'utf8').trim() === 'STAMPED-BY-SKILL-V1'; } catch { return false; }
    },
  },
];

// ---------- arm runners ----------
function runChild(cmd, args, { cwd, env, timeoutMs }) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ out, err, code, killed, wallMs: Date.now() - t0 });
    });
  });
}

function parseClaudeStreamJson(out) {
  const toolCalls = [];
  let result = null;
  for (const line of out.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('{')) continue;
    let ev; try { ev = JSON.parse(l); } catch { continue; }
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use') toolCalls.push({ name: block.name, skill: block.name === 'Skill' ? block.input?.skill : undefined });
      }
    }
    if (ev.type === 'result') result = ev;
  }
  return { toolCalls, result };
}

function parseOpencodeOut(rawOut) {
  const out = stripAnsi(rawOut);
  const toolCalls = [];
  // OpenCode prints executed tools as lines like "← Write hello.txt" / "← Bash ..."
  const re = /←\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(out)) !== null) toolCalls.push({ name: m[1] });
  return { toolCalls, cleanOut: out };
}

async function runAnymodel(task, dir, timeoutMs) {
  writeFileSync(join(dir, '.mcp-empty.json'), '{"mcpServers":{}}');
  const r = await runChild('claude', [
    '-p', task.prompt,
    '--output-format', 'stream-json', '--verbose',
    '--dangerously-skip-permissions',
    '--max-turns', '16',
    '--strict-mcp-config', '--mcp-config', '.mcp-empty.json',
  ], {
    cwd: dir,
    env: {
      ANTHROPIC_BASE_URL: PROXY_URL,
      ANTHROPIC_API_KEY: 'anymodel-proxy',
      ANTHROPIC_MODEL: MODEL,
      ANTHROPIC_SMALL_FAST_MODEL: MODEL,
      DISABLE_AUTOUPDATER: '1',
      DISABLE_TELEMETRY: '1',
    },
    timeoutMs,
  });
  const { toolCalls, result } = parseClaudeStreamJson(r.out);
  return {
    ...r,
    toolCalls,
    turns: result?.num_turns ?? null,
    tokens: result ? { input: result.usage?.input_tokens, output: result.usage?.output_tokens, cache_read: result.usage?.cache_read_input_tokens } : null,
    harnessError: result?.is_error ?? null,
    stopSubtype: result?.subtype ?? null,
  };
}

async function runOpencode(task, dir, timeoutMs) {
  const r = await runChild('opencode', ['run', task.prompt, '-m', `ollama/${MODEL}`], { cwd: dir, env: {}, timeoutMs });
  const { toolCalls } = parseOpencodeOut(r.out + '\n' + r.err);
  return { ...r, toolCalls, turns: null, tokens: null, harnessError: r.code !== 0, stopSubtype: null };
}

// ---------- main loop ----------
const results = [];
const proxyLogSize = () => { try { return statSync(PROXY_LOG).size; } catch { return 0; } };

for (const task of TASKS) {
  if (argv.tasks && !String(argv.tasks).split(',').includes(task.id)) continue;
  for (const arm of ARMS) {
    for (let rep = 1; rep <= REPS; rep++) {
      const dir = join(ROOT, arm, task.id, `rep${rep}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      task.setup(dir);

      const logStart = arm === 'anymodel' ? proxyLogSize() : 0;
      process.stdout.write(`[bench] ${arm} / ${task.id} / rep${rep} ... `);
      const run = arm === 'anymodel' ? await runAnymodel(task, dir, TIMEOUT_MS) : await runOpencode(task, dir, TIMEOUT_MS);
      const success = task.verify(dir);

      let proxyEvents = null;
      if (arm === 'anymodel') {
        try {
          const buf = readFileSync(PROXY_LOG);
          const slice = stripAnsi(buf.slice(logStart).toString());
          writeFileSync(join(dir, 'proxy-slice.log'), slice);
          proxyEvents = {
            fidelity: (slice.match(/\[FIDELITY\] tier=/g) || []).length,
            recovered: (slice.match(/recover/gi) || []).length,
            retries: (slice.match(/attempt [2-9]/g) || []).length,
            requests: (slice.match(/POST \/v1\/messages/g) || []).length,
          };
        } catch { /* proxy log unavailable */ }
      }

      writeFileSync(join(dir, 'stdout.log'), stripAnsi(run.out || ''));
      writeFileSync(join(dir, 'stderr.log'), stripAnsi(run.err || ''));

      const toolNames = run.toolCalls.map(t => t.name);
      const rec = {
        arm, task: task.id, rep,
        success,
        wallMs: run.wallMs,
        timedOut: run.killed,
        exitCode: run.code,
        turns: run.turns,
        toolCallCount: run.toolCalls.length,
        toolNames,
        bashCalls: toolNames.filter(n => /bash/i.test(n)).length,
        editCalls: toolNames.filter(n => /edit|write|patch/i.test(n)).length,
        readCalls: toolNames.filter(n => /read|glob|grep|ls|list/i.test(n)).length,
        skillInvoked: run.toolCalls.some(t => t.name === 'Skill' || /skill/i.test(t.name)),
        tokens: run.tokens,
        proxyEvents,
        errorClass: run.killed ? 'timeout' : (!success && run.toolCalls.length === 0 ? 'zero-tool-execution' : (!success ? 'wrong-artifact' : null)),
        workspace: dir,
      };
      results.push(rec);
      console.log(`${success ? 'PASS' : 'FAIL'} (${(run.wallMs / 1000).toFixed(1)}s, ${run.toolCalls.length} tool calls${run.killed ? ', TIMEOUT' : ''})`);
      writeFileSync(OUT, JSON.stringify({ label: LABEL, model: MODEL, date: new Date().toISOString(), results }, null, 2));
    }
  }
}

console.log(`\n[bench] done — ${results.length} runs → ${OUT}`);
