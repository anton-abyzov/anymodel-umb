// Reverify the immutable registry artifact and the recorded deployment evidence.
// Public metadata/download requests only; no inference or shared installation.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const product = join(root, 'repositories/antonoly/anymodel');
const json = path => JSON.parse(readFileSync(resolve(here, path), 'utf8'));
const expectedGitHead = '7a8b470c8525550de7f3bf0420a310d8f6b9d0b2';
const dir = mkdtempSync(join(tmpdir(), 'anymodel-published-2-'));
const metadataResponse = await fetch('https://registry.npmjs.org/anymodel/2.0.0');
assert.equal(metadataResponse.status, 200);
const metadata = await metadataResponse.json();
assert.equal(metadata.name, 'anymodel');
assert.equal(metadata.version, '2.0.0');
assert.equal(metadata.gitHead, expectedGitHead);
assert.equal(metadata.dist.tarball, 'https://registry.npmjs.org/anymodel/-/anymodel-2.0.0.tgz');
const tarballResponse = await fetch(metadata.dist.tarball);
assert.equal(tarballResponse.status, 200);
writeFileSync(join(dir, 'registry.json'), JSON.stringify(metadata, null, 2) + '\n');
writeFileSync(join(dir, 'anymodel.tgz'), Buffer.from(await tarballResponse.arrayBuffer()));
const run = spawnSync(process.execPath, [
  join(product, 'scripts/verification/release-receipt.mjs'),
  '--metadata', join(dir, 'registry.json'), '--tarball', join(dir, 'anymodel.tgz'),
  '--expected-version', '2.0.0', '--expected-git-head', expectedGitHead,
  '--out', join(dir, 'verification'),
], { cwd: root, encoding: 'utf8', timeout: 30000 });
assert.equal(run.status, 0, run.stderr || run.stdout);
copyFileSync(join(dir, 'verification/release-receipt.json'), join(here, 'release-receipt.json'));
assert.equal(json('isolated-install-receipt.json').passed, true);
assert.equal(json('registry-install-receipt.json').passed, true);
assert.equal(json('npm-publish-workflow.json').conclusion, 'success');
const worker = json('../worker-release-readback.json');
assert.equal(worker.passed, true);
assert.equal(worker.bundle.exactMatch, true);
assert.deepEqual(worker.public.map(row => row.status), [200, 401, 401, 200, 401, 401]);
assert.equal(json('site-assets-readback.json').passed, true);
const site = json('site-deployment-readback.json');
assert.equal(site.readyState, 'READY');
assert.equal(site.target, 'production');
assert.ok(site.alias.includes('anymodel.dev'));
const browser = json('public-site/report.json');
assert.equal(browser.passed, true);
assert.equal(browser.headless, true);
assert.equal(browser.checks.length, 6);
assert.equal(json('../code-review-report.json').summary.total, 0);
const receipt = { passed: true, at: new Date().toISOString(), version: '2.0.0',
  gitHead: expectedGitHead, registryRechecked: true,
  registryIntegrity: metadata.dist.integrity,
  deploymentEvidence: 'Recorded at release; timestamps are retained in individual receipts.',
  checks: ['registry artifact and SHA-512', 'isolated CLI', 'registry installation',
    'publish workflow', 'worker bundle and public auth', 'site asset hashes',
    'production alias', 'six headless viewport/theme checks', 'independent review'],
  localInference: false };
writeFileSync(join(here, 'release-contracts.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
