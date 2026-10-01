import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { convert } from './action-helper.mjs'
const fixtures = new URL('./fixtures/', import.meta.url)
const names = await readdir(fixtures)
async function sample(prefix) {
  const name = names.find((name) => name.startsWith(prefix + '_'))
  return convert(await readFile(new URL(name, fixtures)), name.split('.').at(-1))
}
for (const [prefix, markers] of [
  ['01', ['PAGE1-NATIVE-471', 'PAGE2-SCAN-862', '385.50', '| 音视频 | 便携投影仪 | 可借 | 3 |', '| 音视频 | 会议录音笔 | 可借 | 8 |', '0007', '0025']],
  ['05', ['DOCX-W27', 'C 座 105 室', 'IMG-K64']],
  ['06', ['PPTX-R84', 'SLIDE2-END-584']],
  ['10', ['MD-H38', 'retry_limit']],
  ['11', ['TXT-J53', 'AZ09-xy78_0042']],
  ['13', ['HTML-T91', '0008', '0015']],
  ['14', ['HTML-T91', '0008', '0015']]
]) {
  test(`real upload sample ${prefix} retains its acceptance markers`, async () => {
    const result = await sample(prefix)
    // The Word marker is embedded in an image; the converter must preserve its bytes for shared vision.
    for (const marker of markers.filter((marker) => marker !== 'IMG-K64')) assert.ok(result.markdown.includes(marker), `Missing ${marker}`)
    if (prefix === '05') assert.match(result.markdown, /data:image\/png;base64,/)
  })
}
test('scanned and mixed PDFs expose every missing page for shared OCR', async () => {
  const scan = await sample('02')
  assert.deepEqual(scan.pages.map((page) => [page.page, page.needsOcr]), [[1, true], [2, true]])
  for (const page of scan.pages) assert.match(page.markdown, /data:image\/png;base64,/)
  const mixed = await sample('03')
  assert.deepEqual(mixed.pages.map((page) => [page.page, page.needsOcr]), [[1, false], [2, true]])
  assert.match(mixed.pages[0].markdown, /PAGE1-NATIVE-471/)
  assert.match(mixed.pages[1].markdown, /data:image\/png;base64,/)
})
test('empty, whitespace-only and corrupt uploads have distinct bounded errors', async () => {
  await assert.rejects(sample('16'), /MARKITDOWN_EMPTY_FILE/)
  await assert.rejects(convert(' \n\t ', 'txt'), /MARKITDOWN_EMPTY_TEXT/)
  await assert.rejects(sample('15'), /MARKITDOWN_INVALID_DOCUMENT/)
})
