import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Explicitly exercises only the fictional example against an already-running local demo.
const base = process.env.DEMO_URL || 'http://127.0.0.1:4397';
const url = new URL(base);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Demo verification is localhost-only');
async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(240000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  assert.ok(response.ok, `HTTP ${response.status}: ${result.message || result.code || 'request failed'}`);
  return result;
}
async function action(actionKey, input) {
  const result = await post('/api/action', { actionKey, input });
  assert.equal(result.success, true, JSON.stringify(result.data));
  return result.data;
}

const input = {
  requestKey: `live-ollama-${randomUUID()}`,
  title: '本地 Ollama 联调合同（虚构数据）',
  sourceText: await readFile(new URL('../examples/contract.txt', import.meta.url), 'utf8')
};
const started = performance.now();
console.log('Calling the real local Ollama model through the Java extraction endpoint...');
const draft = await action('extract_contract', input);
const extractionMs = Math.round(performance.now() - started);
assert.equal(draft.status, 'DRAFT');
assert.equal(draft.sourceText, input.sourceText);
assert.equal(draft.title, input.title);
assert.equal(draft.version, 1);
assert.deepEqual(draft.audit.map(entry => entry.action), ['CREATED']);
for (const [key, field] of Object.entries(draft.fields)) {
  assert.ok(field, `The fictional example includes ${key}, but the model left it empty`);
  assert.ok(input.sourceText.includes(field.evidence), `${key}: evidence must quote original text`);
  assert.ok(field.evidence.includes(field.value), `${key}: value must occur in evidence`);
}
const replay = await action('extract_contract', input);
assert.equal(replay.id, draft.id);
assert.equal(replay.audit.length, 1);
const view = await post('/api/view', { query: { parameters: { contractId: draft.id } } });
assert.equal(view.meta.selected.id, draft.id);
assert.equal(view.meta.selected.sourceText, input.sourceText);
const saved = await action('update_contract', { contractId: draft.id, expectedVersion: draft.version, fields: draft.fields });
assert.equal(saved.version, 2);
const stale = await post('/api/action', { actionKey: 'update_contract', input: { contractId: draft.id, expectedVersion: 1, fields: draft.fields } });
assert.equal(stale.success, false);
assert.equal(stale.data.code, 'CONFLICT');
const confirmed = await action('confirm_contract', { contractId: draft.id, expectedVersion: saved.version });
assert.equal(confirmed.status, 'CONFIRMED');
assert.equal(confirmed.version, 3);
const confirmationReplay = await action('confirm_contract', { contractId: draft.id, expectedVersion: saved.version });
assert.equal(confirmationReplay.audit.length, confirmed.audit.length);
const extractionReplayAfterReview = await action('extract_contract', input);
assert.equal(extractionReplayAfterReview.id, confirmed.id);
assert.equal(extractionReplayAfterReview.status, 'CONFIRMED');
assert.equal(extractionReplayAfterReview.version, confirmed.version);
const summary = await action('get_summary', { contractId: draft.id });
assert.equal(summary.status, 'CONFIRMED');
assert.ok(summary.summary.includes(draft.fields.partyA.value));
assert.ok(summary.summary.includes(draft.fields.amount.value));
const report = {
  verifiedAt: new Date().toISOString(), contractId: draft.id, extractionMs,
  checks: ['real-model-extraction', 'exact-source-preserved', 'six-evidence-fields', 'creation-replay', 'workbench-query', 'save', 'stale-version-rejected', 'confirmation-replay', 'replay-after-review', 'confirmed-summary'],
  finalStatus: confirmed.status, finalVersion: confirmed.version,
  evidenceScope: 'Local Java + Ollama + preview adapter; not an Xpert installation'
};
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(new URL('../test-results/local-ollama-flow.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
