import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { convert } from '../sandbox-actions/convert/convert.mjs'

async function withInput(text, callback) {
  const root = await mkdtemp(path.join(tmpdir(), 'anydoc-test-'))
  try {
    const file = path.join(root, 'source.bin')
    await writeFile(file, text)
    await callback(file)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
for (const [bytes, code] of [
  [Buffer.from(' \r\n\t'), 'EMPTY_TEXT'],
  [Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x2c, 0x31]), 'UNSUPPORTED_ENCODING'],
  [Buffer.from([0]), 'INVALID_DOCUMENT']
]) {
  test(`rejects CSV with a specific ${code} reason before calling the converter`, async () => {
    await withInput(bytes, async (file) => {
      const api = {
        formatFromExtension: () => 'csv',
        formatFromBytes: () => null,
        toMarkdownBytes: () => assert.fail('invalid CSV must not reach conversion')
      }
      await assert.rejects(convert(file, 'csv', '', api), (error) => error.code === code)
    })
  })
}
test('conversion never opts into hosted OCR even with a configured Firecrawl key', async () => {
  const original = process.env.FIRECRAWL_API_KEY
  process.env.FIRECRAWL_API_KEY = 'test-only'
  try {
    await withInput('office', async (file) => {
      const api = {
        formatFromExtension: () => 'docx',
        formatFromBytes: () => 'docx',
        toMarkdownBytes: async (_, __, options) => {
          assert.equal(options.ocr, 'reject')
          return 'Office text'
        },
        toDocument: async () => ({ assets: [] })
      }
      assert.equal((await convert(file, 'docx', '', api)).markdown, 'Office text')
    })
  } finally {
    if (original === undefined) delete process.env.FIRECRAWL_API_KEY
    else process.env.FIRECRAWL_API_KEY = original
  }
})
test('rejects unsupported types, empty input and mismatched content before conversion', async () => {
  await withInput('', async (file) => {
    await assert.rejects(convert(file, 'txt'), /UNSUPPORTED_FORMAT/)
    await assert.rejects(convert(file, 'pdf'), /EMPTY_FILE/)
  })
  await withInput('binary', async (file) => {
    const api = { formatFromExtension: () => 'docx', formatFromBytes: () => 'pdf' }
    await assert.rejects(convert(file, 'docx', '', api), /INVALID_DOCUMENT/)
    await assert.rejects(convert(file, 'docx', '', { ...api, formatFromBytes: () => null }), /INVALID_DOCUMENT/)
  })
})
test('exports distinct bytes for equally named images and preserves unsupported assets as files', async () => {
  await withInput('document', async (file) => {
    const assets = [
      { mediaType: 'image/png', data: Buffer.from('a'), originPart: '../image.png' },
      { mediaType: 'image/png', data: Buffer.from('b'), originPart: '../image.png' },
      { mediaType: 'application/octet-stream', data: Buffer.from('c') }
    ]
    const result = await convert(file, 'docx', '', {
      formatFromExtension: () => 'docx',
      formatFromBytes: () => 'docx',
      toMarkdownBytes: async () => 'Text mentioning image.png',
      toDocument: async () => ({ assets })
    })
    assert.equal(new Set(result.assets.map((a) => a.name)).size, 3)
    assert.deepEqual(
      result.assets.map((a) => Buffer.from(a.data, 'base64').toString()),
      ['a', 'b', 'c']
    )
    assert.match(result.markdown, /Text mentioning image.png/)
    assert.doesNotMatch(result.markdown, /xpert-asset:\/\/asset-3/)
  })
})
