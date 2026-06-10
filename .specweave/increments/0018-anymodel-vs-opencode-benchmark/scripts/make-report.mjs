#!/usr/bin/env node
// Generates the side-by-side HTML evidence report from one or more results-*.json files.
// Usage: node make-report.mjs results-baseline-1.16.2.json [results-fixed-1.16.3.json ...] > report.html

import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: make-report.mjs <results.json> [...]'); process.exit(1); }

// Merge runs; arm id = `${arm}@${label}` when the same arm appears in multiple files
const datasets = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
const runs = [];
for (const d of datasets) {
  for (const r of d.results) {
    runs.push({ ...r, armId: `${r.arm}@${d.label}`, label: d.label });
  }
}
const model = datasets[0].model;

const armIds = [...new Set(runs.map(r => r.armId))];
const tasks = [...new Set(runs.map(r => r.task))];

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;

function armStats(armId, taskFilter) {
  const rs = runs.filter(r => r.armId === armId && (!taskFilter || r.task === taskFilter));
  const ok = rs.filter(r => r.success);
  return {
    n: rs.length,
    pass: ok.length,
    rate: pct(ok.length, rs.length),
    medMs: median(rs.map(r => r.wallMs)),
    medMsPass: median(ok.map(r => r.wallMs)),
    timeouts: rs.filter(r => r.timedOut).length,
    zeroTool: rs.filter(r => r.errorClass === 'zero-tool-execution').length,
    toolCalls: rs.reduce((s, r) => s + r.toolCallCount, 0),
    bash: rs.reduce((s, r) => s + r.bashCalls, 0),
    edit: rs.reduce((s, r) => s + r.editCalls, 0),
    read: rs.reduce((s, r) => s + r.readCalls, 0),
    skillRuns: rs.filter(r => r.skillInvoked).length,
    tokensOut: rs.reduce((s, r) => s + (r.tokens?.output || 0), 0),
  };
}

const ARM_META = {
  anymodel: { title: 'AnyModel', sub: 'Claude Code → anymodel proxy → Ollama', color: '#7c5cff' },
  opencode: { title: 'OpenCode', sub: 'OpenCode → Ollama direct', color: '#00b8a9' },
};
const meta = id => {
  const base = id.split('@')[0];
  const label = id.split('@')[1];
  const m = ARM_META[base] || { title: base, sub: '', color: '#888' };
  return { ...m, title: label.includes('fixed') ? `${m.title} (fixed)` : m.title, version: label.replace(/^(baseline|fixed)-/, '') };
};

const fmtS = ms => (ms / 1000).toFixed(1) + 's';

function bar(val, max, color) {
  const w = max ? Math.max(2, Math.round((val / max) * 100)) : 2;
  return `<div class="bar"><div class="fill" style="width:${w}%;background:${color}"></div><span>${val}</span></div>`;
}

const overall = Object.fromEntries(armIds.map(a => [a, armStats(a)]));
const maxMed = Math.max(...armIds.map(a => overall[a].medMs));

const taskRows = tasks.map(t => {
  const cells = armIds.map(a => {
    const s = armStats(a, t);
    const cls = s.rate === 100 ? 'ok' : s.rate === 0 ? 'bad' : 'mid';
    return `<td class="${cls}"><b>${s.pass}/${s.n}</b><small>${fmtS(s.medMs)} · ${s.toolCalls} calls</small></td>`;
  }).join('');
  return `<tr><th>${t}</th>${cells}</tr>`;
}).join('\n');

const cards = armIds.map(a => {
  const s = overall[a]; const m = meta(a);
  return `<div class="card" style="border-top:3px solid ${m.color}">
    <h2>${m.title} <small>v${m.version}</small></h2>
    <p class="sub">${m.sub}</p>
    <div class="big ${s.rate >= 80 ? 'g' : s.rate >= 50 ? 'y' : 'r'}">${s.rate}%</div>
    <p class="lbl">task success (${s.pass}/${s.n} runs)</p>
    <ul>
      <li>median turn-around: <b>${fmtS(s.medMs)}</b></li>
      <li>tool calls executed: <b>${s.toolCalls}</b> (bash ${s.bash} · edit ${s.edit} · read ${s.read})</li>
      <li>timeouts: <b>${s.timeouts}</b> · zero-tool turns: <b>${s.zeroTool}</b></li>
      <li>skill invocations observed: <b>${s.skillRuns}</b></li>
    </ul>
  </div>`;
}).join('\n');

const speedBars = armIds.map(a => {
  const m = meta(a);
  return `<div class="row"><span class="rowlbl">${m.title}</span>${bar(Math.round(overall[a].medMs / 100) / 10, maxMed / 1000, m.color)}</div>`;
}).join('\n');

const failures = runs.filter(r => !r.success).map(r =>
  `<tr><td>${meta(r.armId).title}</td><td>${r.task} #${r.rep}</td><td>${r.errorClass || 'unknown'}</td><td>${fmtS(r.wallMs)}</td><td><code>${(r.workspace || '')}</code></td></tr>`
).join('\n') || '<tr><td colspan="5">none</td></tr>';

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>AnyModel vs OpenCode — Local Coding Agent Benchmark</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background:#0b0b10; color:#e8e8ee; font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding:40px 24px 80px; }
  .wrap { max-width: 1080px; margin: 0 auto; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  .meta { color:#9a9aa8; margin-bottom: 28px; font-size: 13px; }
  .cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-bottom: 36px; }
  .card { background:#15151d; border:1px solid #26262f; border-radius:14px; padding:20px; }
  .card h2 { font-size:18px; } .card h2 small { color:#9a9aa8; font-weight:400; font-size:12px; }
  .sub { color:#9a9aa8; font-size:12px; margin-bottom:10px; }
  .big { font-size:44px; font-weight:700; } .big.g { color:#4ade80; } .big.y { color:#facc15; } .big.r { color:#f87171; }
  .lbl { color:#9a9aa8; font-size:12px; margin-bottom:12px; }
  .card ul { list-style:none; font-size:13px; } .card li { padding:3px 0; border-top:1px solid #1f1f28; }
  h3 { margin:34px 0 12px; font-size:17px; }
  table { width:100%; border-collapse:collapse; background:#15151d; border-radius:12px; overflow:hidden; font-size:13px; }
  th, td { padding:10px 12px; text-align:left; border-bottom:1px solid #20202a; }
  thead th { background:#1b1b25; font-size:12px; color:#b8b8c8; }
  td.ok { color:#4ade80; } td.bad { color:#f87171; } td.mid { color:#facc15; }
  td small { display:block; color:#9a9aa8; font-size:11px; }
  .bar { position:relative; background:#1f1f28; border-radius:6px; height:22px; flex:1; }
  .fill { height:100%; border-radius:6px; }
  .bar span { position:absolute; right:8px; top:1px; font-size:12px; }
  .row { display:flex; align-items:center; gap:10px; margin:6px 0; }
  .rowlbl { width:150px; font-size:13px; color:#b8b8c8; }
  code { background:#1b1b25; padding:1px 5px; border-radius:4px; font-size:11px; }
  .note { background:#15151d; border-left:3px solid #7c5cff; border-radius:8px; padding:14px 16px; font-size:13px; color:#c8c8d4; margin:18px 0; }
</style></head><body><div class="wrap">
<h1>AnyModel vs OpenCode — local coding agent benchmark</h1>
<p class="meta">Model: <b>${model}</b> on Ollama (M1 Max 32GB, 100% GPU) · ${new Date(datasets[0].date).toUTCString()} · ${runs.length} runs · identical seeded tasks, artifact-verified, fresh workspace per run</p>
<div class="cards">${cards}</div>
<h3>Median wall time per task (seconds — lower is better)</h3>
${speedBars}
<h3>Per-task results (pass / runs · median time · tool calls)</h3>
<table><thead><tr><th>task</th>${armIds.map(a => `<th>${meta(a).title}</th>`).join('')}</tr></thead><tbody>
${taskRows}
</tbody></table>
<h3>Failures</h3>
<table><thead><tr><th>arm</th><th>run</th><th>class</th><th>time</th><th>workspace (logs)</th></tr></thead><tbody>
${failures}
</tbody></table>
<div class="note"><b>Methodology.</b> Each run: fresh temp workspace, seeded fixtures, one prompt, 300s timeout. Success = artifact verifier only (file contents / passing test), never model self-report. AnyModel arm: <code>claude -p</code> → anymodel proxy → Ollama native API; tool calls counted from Claude Code stream-json events; proxy log sliced per run. OpenCode arm: <code>opencode run</code> → Ollama /v1; tool calls parsed from its execution trace. Same Ollama server, same context length (32768), flash attention + q8_0 KV cache. Skill task seeds the same SKILL.md into <code>.claude/skills</code>, <code>.opencode/skill</code>, and <code>.opencode/skills</code>.</div>
</div></body></html>`;

process.stdout.write(html);
