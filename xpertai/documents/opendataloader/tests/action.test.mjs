import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { convertPages, mapResult, splitPages } from '../sandbox-actions/convert/convert.mjs'
const marker = 'UNIQUE-PAGE-'
const page = (n, content) => `${marker}${n}-END\n${content}\n`
const extraction = (kids, markdown) => ({
  json: { 'number of pages': 2, kids },
  markdown,
  separator: marker,
  root: '.'
})
test('OCR processes only uncovered pages, retaining native text and original page order', async () => {
  const calls = []
  const result = await convertPages(async (pages) => {
    calls.push(pages)
    return pages
      ? extraction([{ 'page number': 2, content: 'OCR PAGE TWO' }], page(2, 'OCR PAGE TWO'))
      : extraction(
          [
            { 'page number': 1, content: 'NATIVE PAGE ONE' },
            { type: 'image', 'page number': 2, source: 'scan.png' }
          ],
          page(1, 'NATIVE PAGE ONE') + page(2, '![](<scan.png>)')
        )
  })
  assert.deepEqual(calls, [undefined, [2]])
  assert.deepEqual(result.pages, [
    { page: 1, markdown: 'NATIVE PAGE ONE' },
    { page: 2, markdown: 'OCR PAGE TWO' }
  ])
  assert.doesNotMatch(result.markdown, /scan.png/)
})
test('native documents never start OCR; failed OCR never falls back to partial success', async () => {
  let calls = 0
  const text = extraction(
    [
      { 'page number': 1, content: 'one' },
      { 'page number': 2, content: 'two' }
    ],
    page(1, 'one') + page(2, 'two')
  )
  await convertPages(async () => {
    calls++
    return text
  })
  assert.equal(calls, 1)
  await assert.rejects(
    convertPages(async (pages) => {
      if (pages) throw Object.assign(new Error('OCR failed'), { code: 'RESOURCE_LIMIT' })
      return extraction([{ 'page number': 1, content: 'one' }], page(1, 'one') + page(2, ''))
    }),
    /OCR failed/
  )
})
test('OCR output must cover the exact requested pages and retain the original document page count', async () => {
  const empty = extraction([], page(1, '') + page(2, ''))
  for (const result of [
    extraction([{ 'page number': 1, content: 'one' }], page(1, 'one')),
    { ...empty, json: { 'number of pages': 1, kids: [] } }
  ])
    await assert.rejects(
      convertPages(async (pages) => (pages ? result : empty)),
      /INCOMPLETE_PAGES/
    )
})
test('keeps page order and rejects missing, duplicate and out-of-range page markers', () => {
  assert.deepEqual(
    splitPages(page(1, 'First') + page(2, 'Second'), marker, 2).map((p) => p.markdown),
    ['First', 'Second']
  )
  for (const source of [page(1, 'only'), page(1, 'a') + page(1, 'b'), page(2, 'a') + page(1, 'b')])
    assert.throws(() => splitPages(source, marker, 2), /INCOMPLETE_PAGES/)
})
test('strict page mapping rejects unrecognized pages instead of claiming complete coverage', async () => {
  const json = {
    'number of pages': 2,
    kids: [
      { 'page number': 1, content: 'Text' },
      { type: 'image', 'page number': 2, source: 'image.png' }
    ]
  }
  await assert.rejects(
    mapResult(json, page(1, 'text') + page(2, 'image'), marker, '.'),
    (error) => error.code === 'NEEDS_OCR' && error.pages[0] === 2
  )
  await assert.rejects(
    mapResult({ ...json, kids: [json.kids[0]] }, page(1, 'text') + page(2, ''), marker, '.'),
    /INCOMPLETE_PAGES/
  )
})
test('preserves two image sources with the same basename and rewrites only image destinations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'odl-assets-'))
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    for (const dir of ['a', 'b']) {
      await mkdir(path.join(root, dir))
      await writeFile(path.join(root, dir, 'image.png'), bytes)
    }
    const kids = [
      { 'page number': 1, content: 'Text' },
      ...['a', 'b'].map((dir) => ({ type: 'image', 'page number': 1, source: `${dir}/image.png` }))
    ]
    const result = await mapResult(
      { 'number of pages': 1, kids },
      page(1, 'Text a/image.png\n![](<a/image.png>)\n![](<b/image.png>)'),
      marker,
      root
    )
    assert.equal(result.assets.length, 2)
    assert.match(result.markdown, /Text a\/image.png/)
    assert.match(result.markdown, /xpert-asset:\/\/image-1.png/)
    assert.match(result.markdown, /xpert-asset:\/\/image-2.png/)
    for (const source of ['../outside.png', '/etc/passwd', 'a\\image.png'])
      await assert.rejects(
        mapResult(
          { 'number of pages': 1, kids: [kids[0], { ...kids[1], source }] },
          page(1, `text\n![](<${source}>)`),
          marker,
          root
        ),
        /INVALID_DOCUMENT/
      )
    await symlink(path.join(root, 'a'), path.join(root, 'linked'))
    await assert.rejects(
      mapResult(
        { 'number of pages': 1, kids: [kids[0], { ...kids[1], source: 'linked/image.png' }] },
        page(1, 'text\n![](<linked/image.png>)'),
        marker,
        root
      ),
      /INVALID_DOCUMENT/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('preserves image alt text and deduplicates repeated JSON references on a page', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'odl-repeat-'))
  try {
    await writeFile(path.join(root, 'image.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const image = { type: 'image', 'page number': 1, source: 'image.png' }
    const result = await mapResult(
      { 'number of pages': 1, kids: [{ 'page number': 1, content: 'Text' }, image, image] },
      page(1, '![Warehouse](<image.png>)'),
      marker,
      root
    )
    assert.equal(result.assets.length, 1)
    assert.match(result.markdown, /!\[Warehouse\]\(xpert-asset:\/\//)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
