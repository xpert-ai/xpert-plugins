import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { withOcrBackend } from '../sandbox-actions/convert/ocr.mjs'

// Exercise actual subprocess and loopback lifecycle without loading models in unit tests.
for (const outcome of ['success', 'failure', 'killed'])
  test(`OCR backend is stopped after ${outcome}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'opendataloader-ocr-'))
    let pid
    try {
      await mkdir(path.join(root, 'python/bin'), { recursive: true })
      const backend = path.join(root, 'fake-backend.mjs')
      await writeFile(
        backend,
        `import http from 'node:http'; import fs from 'node:fs';
const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({pid:process.pid,threshold:process.argv[process.argv.indexOf('--ocr-confidence-threshold')+1]}));});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync(process.argv[process.argv.indexOf('--ready')+1], JSON.stringify({port:server.address().port})));
process.stdin.resume(); process.stdin.on('end',()=>process.exit());`
      )
      const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'"
      await writeFile(
        path.join(root, 'python/bin/python3'),
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(backend)} "$@"\n`,
        { mode: 0o755 }
      )
      const run = withOcrBackend(
        root,
        root,
        async (url) => {
          const health = await (await fetch(url + '/health')).json()
          pid = health.pid
          assert.equal(health.threshold, '0.1')
          assert.ok(pid > 0)
          if (outcome === 'killed') {
            process.kill(pid, 'SIGKILL')
            for (let i = 0; i < 100; i++) {
              await new Promise((resolve) => setTimeout(resolve, 10))
              try {
                process.kill(pid, 0)
              } catch (error) {
                if (error.code === 'ESRCH') break
                throw error
              }
            }
          }
          if (outcome !== 'success') throw new Error('Conversion failed')
          return 'recognized'
        },
        0.1
      )
      if (outcome !== 'success')
        await assert.rejects(run, outcome === 'killed' ? /RESOURCE_LIMIT/ : /Conversion failed/)
      else assert.equal(await run, 'recognized')
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

test('missing backend executable fails as a Runtime error without hanging', { timeout: 5000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'opendataloader-ocr-missing-'))
  try {
    await assert.rejects(
      withOcrBackend(root, root, async () => assert.fail('must not convert')),
      /RUNTIME_INVALID/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('invalid thresholds are rejected before reading input or spawning OCR', async () => {
  const { convert } = await import('../sandbox-actions/convert/convert.mjs')
  for (const value of [null, '0.1', true, -0.01, 1.01, NaN, Infinity]) {
    await assert.rejects(convert('/missing.pdf', 'pdf', '/missing', value), /INVALID_CONFIG/)
    await assert.rejects(
      withOcrBackend('/missing', '/missing', () => assert.fail(), value),
      /INVALID_CONFIG/
    )
  }
})
