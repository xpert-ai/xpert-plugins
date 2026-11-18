import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('cover runner supports portrait slides, rejects invalid inputs and always closes its isolated browser', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pptx-cover-runner-'))
  try {
    const dependency = join(root, 'node_modules/playwright-core')
    await mkdir(dependency, { recursive: true })
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }))
    // Exercise the shipped entrypoint without installing a browser in the API package.
    // Actual Chromium rendering is verified separately in the fixed Browser Runtime.
    await writeFile(join(dependency, 'index.mjs'), `
      import assert from 'node:assert/strict'
      import { appendFile, writeFile } from 'node:fs/promises'
      const audit = value => appendFile(process.env.PPTX_COVER_TEST_AUDIT, value + '\\n')
      const scenario = process.env.PPTX_COVER_TEST_CASE
      export const chromium = { launch: async options => {
        assert.equal(options.headless, true); await audit('launch')
        return { close: () => audit('close'), newContext: async options => {
          assert.equal(options.javaScriptEnabled, false)
          assert.equal(options.serviceWorkers, 'block')
          return { route: async (pattern, handler) => {
            assert.equal(pattern, '**/*'); await handler({ abort: () => audit('network-blocked') })
          }, newPage: async () => ({
            setDefaultTimeout: value => assert.equal(value, 10000),
            setContent: async () => {},
            locator: selector => {
              assert.equal(selector, 'section > div')
              return { first: () => ({
                count: async () => scenario === 'missing' ? 0 : 1,
                boundingBox: async () => {
                  assert.notEqual(scenario, 'missing', 'Missing input must not wait for layout')
                  return { width: 640, height: scenario === 'oversized' ? 2001 : scenario === 'portrait' ? 1138 : 360 }
                },
                screenshot: async options => {
                  assert.equal(options.animations, 'disabled'); assert.equal(options.type, 'png')
                  await writeFile(options.path, 'synthetic screenshot')
                }
              }) }
            }
          }) }
        } }
      } }
    `)
    await copyFile(new URL('../dist/sandbox-actions/pptx-cover/bundle/runner.mjs', import.meta.url), join(root, 'runner.mjs'))
    await writeFile(join(root, 'slide.html'), '<section><div>Slide</div></section>')
    for (const scenario of ['landscape', 'portrait', 'missing', 'oversized', 'invalid-payload']) {
      const auditPath = join(root, scenario + '.log'), output = join(root, scenario)
      await writeFile(auditPath, '')
      await writeFile(join(root, 'job.json'), JSON.stringify({ contractVersion: '1', action: 'pptx.cover', actionVersion: '1.0.0',
        payload: scenario === 'invalid-payload' ? { command: 'not allowed' } : {} }))
      const result = spawnSync(process.execPath, ['runner.mjs', '--request', join(root, 'job.json'), '--output', output], {
        cwd: root, encoding: 'utf8', timeout: 15000,
        env: { ...process.env, PPTX_COVER_TEST_CASE: scenario, PPTX_COVER_TEST_AUDIT: auditPath }
      })
      assert.equal(result.error, undefined)
      const valid = scenario === 'landscape' || scenario === 'portrait'
      assert.equal(result.status, valid ? 0 : 1, result.stderr)
      if (valid) assert.equal(await readFile(join(output, 'cover.png'), 'utf8'), 'synthetic screenshot')
      else assert.match(result.stderr, /EXPORT_INPUT_INVALID/)
      const audit = await readFile(auditPath, 'utf8')
      assert.equal(audit, scenario === 'invalid-payload' ? '' : 'launch\nnetwork-blocked\nclose\n')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
