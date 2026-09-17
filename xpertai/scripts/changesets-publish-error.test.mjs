// Exercise the pinned dependency's real error path without publishing to a registry.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const cliRoot = dirname(require.resolve('@changesets/cli/package.json'));
const source = readFileSync(resolve(cliRoot, 'dist/changesets-cli.cjs.js'), 'utf8');
const start = source.indexOf('function isAlreadyPublishedError(');
const end = source.indexOf('function publish$1(', start);
assert.ok(start >= 0 && end > start, 'Update the regression harness when upgrading Changesets');

async function publish(error, code = 1) {
  const output = JSON.stringify({ error });
  const errors = [];
  const context = {
    process: { env: {}, stdin: { isTTY: false } },
    getPublishTool: async () => ({ name: 'pnpm' }),
    getCorrectRegistry: () => ({ registry: 'https://registry.npmjs.org' }),
    requiresDelegatedAuth: () => false,
    spawn__default: { default: async () => ({ code, stdout: '', stderr: output }) },
    getLastJsonObjectFromString: (text) => text ? JSON.parse(text) : null,
    logger: { error: (...args) => errors.push(args.join(' ')) }
  };
  runInNewContext(source.slice(start, end), context);
  const result = await context.internalPublish(
    { name: '@xpert-ai/test-publish' }, { cwd: '.', tag: 'latest' }, {}
  );
  return { result: result.result, errors, output };
}

test('E403 with message only preserves the npm rejection and fails', async () => {
  const { result, errors, output } = await publish({ code: 'E403', message: 'Provenance repository mismatch' });
  assert.equal(result, 'failed');
  assert.ok(errors.includes(output));
  assert.ok(errors.some((line) => line.includes('@xpert-ai/test-publish')));
});

test('E404 with message only remains a visible failure', async () => {
  const { result, errors, output } = await publish({ code: 'E404', message: 'Not found' });
  assert.equal(result, 'failed');
  assert.ok(errors.includes(output));
});

test('recognized duplicate publication is still skipped', async () => {
  const { result } = await publish({ code: 'E403', summary: 'cannot publish over the previously published version' });
  assert.equal(result, 'skipped');
});

test('ordinary permission rejection is never treated as successful publication', async () => {
  const { result, errors, output } = await publish({ code: 'E403', summary: 'Permission denied' });
  assert.equal(result, 'failed');
  assert.ok(errors.includes(output));
});

test('successful publication stays successful', async () => {
  const { result, errors } = await publish(undefined, 0);
  assert.equal(result, 'published');
  assert.deepEqual(errors, []);
});
