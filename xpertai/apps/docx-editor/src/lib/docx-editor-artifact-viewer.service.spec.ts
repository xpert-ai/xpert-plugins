import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDocx,
  createEmptyDocument,
  type Paragraph,
  type Table,
  type TextFormatting
} from '@eigenpal/docx-editor-core'
import {
  DOCX_EDITOR_ARTIFACT_VIEWER_VERSION,
  DocxEditorArtifactViewerService,
  sanitizeGeneratedLinks
} from './docx-editor-artifact-viewer.service.js'

test('renders headings, inline formatting, and tables as structured public HTML', async () => {
  const document = createEmptyDocument()
  document.package.document.content = [
    paragraph('Document heading', { styleId: 'Heading1' }),
    paragraph('Important text', undefined, { bold: true }),
    table([
      ['Capability', 'Outcome'],
      ['Data analysis assistant', 'Faster decisions']
    ])
  ]
  const docxBuffer = Buffer.from(await createDocx(document))

  const rendered = await new DocxEditorArtifactViewerService().render({
    title: 'Public document',
    versionNumber: 3,
    docxBuffer
  })
  const html = rendered.buffer.toString('utf8')

  assert.equal(rendered.viewerVersion, DOCX_EDITOR_ARTIFACT_VIEWER_VERSION)
  assert.equal(rendered.viewerVersion, 2)
  assert.match(html, /<h1>Document heading<\/h1>/)
  assert.match(html, /<strong>Important text<\/strong>/)
  assert.match(html, /<table>/)
  assert.match(html, /<td><p>Data analysis assistant<\/p><\/td>/)
  assert.doesNotMatch(html, /\(table, row \d+, col \d+\)/)
})

test('neutralizes unsafe links in converted document HTML', () => {
  const html = sanitizeGeneratedLinks(
    '<a href="java&amp;#x73;cript&amp;colon;alert(1)">unsafe</a><a href="https://example.com">safe</a><a href="#note-1">note</a>'
  )

  assert.equal(
    html,
    '<a href="#">unsafe</a><a href="https://example.com">safe</a><a href="#note-1">note</a>'
  )
})

function paragraph(text: string, formatting?: Paragraph['formatting'], runFormatting?: TextFormatting): Paragraph {
  return {
    type: 'paragraph',
    formatting,
    content: [
      {
        type: 'run',
        formatting: runFormatting,
        content: [{ type: 'text', text }]
      }
    ]
  }
}

function table(rows: string[][]): Table {
  return {
    type: 'table',
    rows: rows.map((row) => ({
      type: 'tableRow',
      cells: row.map((value) => ({
        type: 'tableCell',
        content: [paragraph(value)]
      }))
    }))
  }
}
