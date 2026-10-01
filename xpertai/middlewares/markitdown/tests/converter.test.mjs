import { convert, imagePdf } from './action-helper.mjs'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execute = promisify(execFile)

for (const extension of ['md', 'markdown']) {
  test(`preserves Markdown, leading zeroes and code for ${extension}`, async () => {
    const source = '# 设备清单\n\n| 编号 | 数量 |\n| --- | --- |\n| 0007 | 0 |\n\n```js\nlet value = 0\n```'
    assert.equal((await convert(source, extension)).markdown.trim(), source)
  })
}
test('converts HTML headings and tables through the Action', async () => {
  const result = await convert(
    '<h1>Device</h1><table><tr><th>Name</th><th>Count</th></tr><tr><td>Drill</td><td>0</td></tr></table>',
    'html'
  )
  assert.match(result.markdown, /# Device/)
  assert.match(result.markdown, /\| Drill \| 0 \|/)
})
test('rejects unsupported formats before launching Python', async () => {
  await assert.rejects(convert('a', 'xlsx'), /Unsupported document format/)
})
test('rejects empty or corrupt documents without leaking Python tracebacks', async () => {
  for (const source of ['', 'not a PDF', '%PDF-1.4\nnot a valid PDF']) {
    await assert.rejects(convert(source, 'pdf'), (error) => {
      assert.match(error.stderr, /EXPORT_OUTPUT_INVALID/)
      assert.doesNotMatch(error.stderr, /Traceback|site-packages|source\.bin/)
      return true
    })
  }
})
test('reads native PDF text', async () => {
  const stream = 'BT /F1 12 Tf 72 720 Td (Equipment rule 0007) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  assert.match((await convert(pdf, 'pdf')).markdown, /Equipment rule 0007/)
})
test('reads Word and PowerPoint with the image-bundled dependencies', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'markitdown-office-'))
  try {
    await execute('python3', [
      '-I',
      '-c',
      `
import sys, zipfile
from pathlib import Path
from pptx import Presentation
root = Path(sys.argv[1])
with zipfile.ZipFile(root / 'source.docx', 'w') as z:
 z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
 z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Equipment rule 0007</w:t></w:r></w:p></w:body></w:document>')
p = Presentation()
s = p.slides.add_slide(p.slide_layouts[1]); s.shapes.title.text = 'Equipment rule 0007'
p.save(root / 'source.pptx')
`,
      root
    ])
    for (const extension of ['docx', 'pptx']) {
      assert.match(
        (await convert(await readFile(path.join(root, `source.${extension}`)), extension)).markdown,
        /Equipment rule 0007/
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a watermark text layer does not hide an unrecognized page image', async () => {
  const pdf = imagePdf('q 400 0 0 600 72 72 cm /Im1 Do Q BT /F1 12 Tf 100 300 Td (Watermark) Tj ET')
  const result = await convert(pdf, 'pdf')
  assert.match(result.markdown, /Watermark/)
  assert.equal(result.pages[0].needsOcr, true)
  assert.match(result.pages[0].markdown, /data:image\/png;base64,/)
})
