import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const moduleUnderTest = await import(pathToFileURL(join(packageRoot, 'dist/lib/meeting-file-import.js')).href)
const requireFromTest = createRequire(import.meta.url)
const requireFromMammoth = createRequire(requireFromTest.resolve('mammoth/package.json'))
const JSZip = requireFromMammoth('jszip')

test('imports and normalizes a UTF-8 text meeting record', async () => {
  const result = await moduleUnderTest.extractMeetingFile({
    fileName: '产品_周会.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('\uFEFF会议决定本周完成验收。\r\n张敏负责补齐失败重试，截止 2026-09-20。', 'utf8')
  })

  assert.equal(result.title, '产品 周会')
  assert.equal(result.fileName, '产品_周会.txt')
  assert.match(result.sourceText, /会议决定本周完成验收。\n张敏负责/)
  assert.equal(result.characterCount, result.sourceText.length)
})

test('extracts readable meeting text from DOCX without persisting file bytes', async () => {
  const sourceText = '会议决定在周五发布试用版本。李华负责整理验收清单，截止 2026-09-20。'
  const buffer = await buildDocx(sourceText)
  const result = await moduleUnderTest.extractMeetingFile({
    fileName: '客户需求评审会.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer
  })

  assert.equal(result.title, '客户需求评审会')
  assert.equal(result.sourceText, sourceText)
  assert.equal('buffer' in result, false)
})

test('rejects oversized and unsupported meeting files with stable error codes', async () => {
  await assert.rejects(
    () => moduleUnderTest.extractMeetingFile({ fileName: 'large.txt', buffer: Buffer.alloc(32), size: 5 * 1024 * 1024 + 1 }),
    (error) => error.code === 'MEETING_FILE_TOO_LARGE'
  )
  await assert.rejects(
    () => moduleUnderTest.extractMeetingFile({ fileName: 'meeting.pdf', buffer: Buffer.from('not a supported meeting file') }),
    (error) => error.code === 'MEETING_FILE_TYPE_UNSUPPORTED'
  )
})

async function buildDocx(text) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`)
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p><w:sectPr/></w:body>
    </w:document>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[character])
}
