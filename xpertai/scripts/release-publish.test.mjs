import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const releaseScript = fileURLToPath(new URL('./release-publish.mjs', import.meta.url));

function runRelease(t, { buildExitCode = 0, prepackExitCode = 0, published = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'plugin-release-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin');
  const calls = join(directory, 'calls.jsonl');
  mkdirSync(bin);
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
  for (const name of ['office-editor', 'excalidraw']) {
    mkdirSync(join(directory, 'apps', name), { recursive: true });
    writeFileSync(join(directory, 'apps', name, 'package.json'), JSON.stringify({
      name: `@xpert-ai/plugin-${name}`, version: '1.0.0'
    }));
  }
  // Stub all external commands: this test must never contact a registry or publish.
  for (const command of ['git', 'npm', 'pnpm']) {
    writeFileSync(join(bin, command), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RELEASE_TEST_CALLS, JSON.stringify({ command: '${command}', args,
  ignoreScripts: process.env.PNPM_CONFIG_IGNORE_SCRIPTS }) + '\\n');
if ('${command}' === 'git' && args[0] === 'ls-files') {
  console.log('apps/office-editor/package.json\\napps/excalidraw/package.json');
}
if ('${command}' === 'npm' && process.env.RELEASE_TEST_PUBLISHED !== 'true') {
  console.error('E404');
  process.exit(1);
}
if ('${command}' === 'pnpm' && args.includes('run-many')) {
  process.exit(Number(args.includes('prepack') ? process.env.RELEASE_TEST_PREPACK_EXIT : process.env.RELEASE_TEST_BUILD_EXIT));
}
`, { mode: 0o755 });
  }
  const result = spawnSync(process.execPath, [releaseScript], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RELEASE_TEST_CALLS: calls,
      RELEASE_TEST_BUILD_EXIT: String(buildExitCode),
      RELEASE_TEST_PREPACK_EXIT: String(prepackExitCode),
      RELEASE_TEST_PUBLISHED: String(published)
    }
  });
  return {
    ...result,
    calls: readFileSync(calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  };
}

test('release builds serialize plugins that rebuild shared UI before publishing', (t) => {
  const result = runRelease(t);
  assert.equal(result.status, 0, result.stderr);
  const commands = result.calls.filter((call) => call.command === 'pnpm');
  assert.equal(commands.length, 3);
  assert.ok(commands[0].args.includes('--parallel=1'), 'shared output consumers must not build concurrently');
  assert.ok(commands[0].args.includes('@xpert-ai/plugin-office-editor,@xpert-ai/plugin-excalidraw'));
  assert.equal(commands[0].ignoreScripts, undefined);
  assert.ok(commands[1].args.includes('prepack'));
  assert.ok(commands[1].args.includes('--parallel=1'));
  assert.equal(commands[1].ignoreScripts, undefined);
  assert.deepEqual(commands[2].args, ['exec', 'changeset', 'publish']);
  assert.equal(commands[2].ignoreScripts, 'true');
});

test('a failed build preserves its exit code and never publishes', (t) => {
  const result = runRelease(t, { buildExitCode: 7 });
  assert.equal(result.status, 7);
  assert.equal(result.calls.filter((call) => call.command === 'pnpm').length, 1);
  assert.ok(!result.calls.some((call) => call.args.includes('publish')));
});

test('already published packages skip the build', (t) => {
  const result = runRelease(t, { published: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.filter((call) => call.command === 'pnpm'), [
    { command: 'pnpm', args: ['exec', 'changeset', 'publish'], ignoreScripts: 'true' }
  ]);
});

test('a failed packaging hook prevents publishing', (t) => {
  const result = runRelease(t, { prepackExitCode: 9 });
  assert.equal(result.status, 9);
  assert.equal(result.calls.filter((call) => call.command === 'pnpm').length, 2);
  assert.ok(!result.calls.some((call) => call.args.includes('publish')));
});
