import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { prepareFonts } from './prepare-fonts.mjs'

async function fixture(t) {
  const packageRoot = await mkdtemp(join(tmpdir(), 'excalidraw-font-test-'))
  t.after(() => rm(packageRoot, { recursive: true, force: true }))
  const bytes = Buffer.from('pinned font fixture')
  const font = {
    fileName: 'font.otf',
    url: 'https://example.invalid/font.otf',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length
  }
  const source = join(packageRoot, 'assets/fonts')
  const cacheRoot = join(packageRoot, 'cache')
  await mkdir(source, { recursive: true })
  await mkdir(cacheRoot)
  await writeFile(join(source, 'manifest.json'), JSON.stringify(font))
  await writeFile(join(source, 'OFL.txt'), 'fixture license')
  await writeFile(join(source, 'README.md'), 'fixture provenance')
  return {
    bytes, font, source,
    cached: join(cacheRoot, `${font.sha256}-${font.fileName}`),
    output: join(packageRoot, 'dist/assets/fonts'),
    options: { packageRoot, cacheRoot, offline: false }
  }
}

test('an empty checkout downloads once, then rebuilds dist offline from a verified cache', async (t) => {
  const f = await fixture(t)
  let requests = 0
  const fetchFont = async (url) => {
    assert.equal(url, f.font.url)
    requests++
    return new Response(f.bytes)
  }
  assert.equal((await prepareFonts({ ...f.options, fetchFont })).cacheHit, false)
  assert.equal(requests, 1)
  assert.deepEqual(await readFile(f.cached), f.bytes)
  assert.deepEqual((await readdir(f.source)).sort(), ['OFL.txt', 'README.md', 'manifest.json'])

  await rm(f.output, { recursive: true })
  const result = await prepareFonts({ ...f.options, offline: true, fetchFont: () => assert.fail('Offline build requested the network') })
  assert.equal(result.cacheHit, true)
  assert.deepEqual(await readFile(join(f.output, f.font.fileName)), f.bytes)
  assert.equal(await readFile(join(f.output, 'OFL.txt'), 'utf8'), 'fixture license')
  assert.deepEqual(JSON.parse(await readFile(join(f.output, 'manifest.json'), 'utf8')), f.font)
})

test('a corrupt cache is verified and repaired before it reaches dist', async (t) => {
  const f = await fixture(t)
  await writeFile(f.cached, Buffer.alloc(f.bytes.length))
  await prepareFonts({ ...f.options, fetchFont: async () => new Response(f.bytes) })
  assert.deepEqual(await readFile(f.cached), f.bytes)
  assert.deepEqual(await readFile(join(f.output, f.font.fileName)), f.bytes)
})

for (const cached of [false, true]) {
  test(`offline preparation rejects a ${cached ? 'corrupt' : 'missing'} cache with a recovery hint`, async (t) => {
    const f = await fixture(t)
    if (cached) await writeFile(f.cached, Buffer.alloc(f.bytes.length))
    await assert.rejects(
      prepareFonts({ ...f.options, offline: true, fetchFont: () => assert.fail('Offline build requested the network') }),
      /No verified font.*prepare:fonts/
    )
    await assert.rejects(readFile(join(f.output, f.font.fileName)), { code: 'ENOENT' })
  })
}

for (const [name, response, expected] of [
  ['wrong checksum', () => new Response(Buffer.alloc(19)), /integrity check failed/],
  ['oversized response', () => new Response(Buffer.alloc(20)), /exceeds the pinned size/],
  ['HTTP failure', () => new Response('Unavailable', { status: 503 }), /HTTP 503/]
]) {
  test(`a ${name} cannot enter the cache or the published output`, async (t) => {
    const f = await fixture(t)
    await assert.rejects(prepareFonts({ ...f.options, fetchFont: async () => response() }), expected)
    assert.deepEqual(await readdir(f.options.cacheRoot), [])
    await assert.rejects(readFile(join(f.output, f.font.fileName)), { code: 'ENOENT' })
  })
}
