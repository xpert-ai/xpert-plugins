import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { PptxEngine } from '../dist/lib/ai-engine.js'
import { PptxFormat } from '../dist/lib/format.js'
import { templateComposeSchema } from '../dist/lib/template-schema.js'
const PptxGenJS = createRequire(import.meta.url)('pptxgenjs')
const engine = new PptxEngine(), format = new PptxFormat()
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
const catalog = JSON.parse(await readFile(new URL('../dist/assets/templates/catalog.json', import.meta.url), 'utf8'))
const source = { kind: 'builtin', templateId: 'dsh-signal', language: 'zh' }
const buffer = await readFile(new URL('../dist/assets/templates/dsh-signal/zh.pptx', import.meta.url))
const inspect = async buffer => (await engine.run({ action: 'templateInspect', buffer })).template
const compose = (buffer, slides, images) => engine.run({ action: 'templateCompose', buffer, images,
  plan: templateComposeSchema.parse({ source, title: '企业模板验收', operationId: randomUUID(), slides }) })

test('all 16/192 bilingual DSH native packages retain provenance and editable objects', async () => {
  assert.equal(catalog.templates.length, 16)
  assert.equal(catalog.templates.reduce((n, entry) => n + entry.layouts.length, 0), 192)
  for (const entry of catalog.templates) for (const language of ['en', 'zh']) {
    const bytes = await readFile(new URL(`../dist/assets/templates/${entry.id}/${language}.pptx`, import.meta.url))
    assert.equal(hash(bytes), entry.variants[language].sha256)
    await format.validateFile(bytes)
    const report = await inspect(bytes)
    assert.equal(report.slideCount, 12, entry.id)
    assert.deepEqual(report.issues.filter(item => item.blocking), [], entry.id)
    assert.ok(report.slides.every(slide => slide.objects.some(object => object.fillable && object.kind === 'text')), entry.id)
    const copied = await compose(bytes, report.slides.map(slide => ({ sourceSlide: slide.number })))
    assert.equal(copied.slideCount, 12)
  }
})
test('native composition duplicates/reorders DSH pages, fills text/notes and preserves original', async () => {
  const originalHash = hash(buffer), report = await inspect(buffer)
  const slot = report.slides[0].objects.find(object => object.fillable && object.kind === 'text')
  const result = await compose(buffer, [{ sourceSlide: 12 }, { sourceSlide: 1, notes: '第一行\n第二行', fills: [{ kind: 'text', objectId: slot.objectId, text: '南京元数：人工可编辑' }] }, { sourceSlide: 1 }])
  const final = await inspect(result.buffer)
  assert.equal(final.slideCount, 3)
  assert.ok(final.slides[1].objects.some(object => object.text.includes('南京元数：人工可编辑')))
  assert.equal(final.slides[1].notes, '第一行\n第二行')
  assert.equal(final.slides[2].objects.find(object => object.objectId === slot.objectId)?.text, slot.text)
  assert.equal(hash(buffer), originalHash)
  assert.equal(final.masterCount, report.masterCount)
  assert.equal(final.layoutCount, report.layoutCount)
})

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64')
async function corporate() {
  const deck = new PptxGenJS(); deck.layout = 'LAYOUT_WIDE'
  deck.defineSlideMaster({ title: 'Company', background: { color: '10263A' }, objects: [
    { text: { text: '南京元数信息技术有限公司', options: { x: 0.5, y: 6.9, w: 9, h: 0.3, color: 'B89960', fontSize: 12 } } },
    { image: { data: 'data:image/png;base64,' + png.toString('base64'), x: 12, y: 0.3, w: 0.4, h: 0.4 } }
  ] })
  const slide = deck.addSlide({ masterName: 'Company' })
  slide.addText('原始企业标题', { x: 1, y: 1, w: 10, h: 1, color: 'FFFFFF', fontSize: 32, objectName: 'Title' })
  slide.addText('第一个同名对象', { x: 1, y: 2, w: 5, h: 0.5, objectName: 'Repeated' })
  slide.addText('第二个同名对象', { x: 7, y: 2, w: 5, h: 0.5, objectName: 'Repeated' })
  slide.addTable([['指标','数值'],['收入','100']], { x: 1, y: 3, w: 5, h: 1, objectName: 'Metrics' })
  slide.addChart(deck.ChartType.bar, [{ name: '收入', labels: ['Q1','Q2'], values: [10,20] }], { x: 7, y: 3, w: 5, h: 2, objectName: 'Revenue' })
  slide.addImage({ data: 'data:image/png;base64,' + png.toString('base64'), x: 1, y: 5, w: 1, h: 1, objectName: 'Photo' })
  slide.addNotes('企业原始备注')
  deck.addSlide({ masterName: 'Company' }).addText('结束', { x: 1, y: 1, w: 10, h: 1 })
  const zip = await JSZip.loadAsync(await deck.write({ outputType: 'nodebuffer' }))
  // PptxGenJS table insertion can collide with IDs of later shapes; construct a valid Office fixture.
  for (const name of Object.keys(zip.files).filter(name => /^ppt\/slides\/[^/]+\.xml$/.test(name))) {
    let id = 0
    zip.file(name, (await zip.file(name).async('string')).replace(/(<p:cNvPr\b[^>]*\bid=")\d+("[^>]*>)/g, (_match, left, right) => left + ++id + right))
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}
test('enterprise template keeps master/media, fills native tables/charts/images and duplicate named shapes', async () => {
  const input = await corporate(), report = await inspect(input), objects = report.slides[0].objects
  const repeated = objects.filter(object => object.name === 'Repeated')
  assert.equal(repeated.length, 2)
  const fills = [{ kind: 'text', objectId: repeated[1].objectId, text: '仅改第二个' },
    { kind: 'table', objectId: objects.find(object => object.kind === 'table').objectId, rows: [['指标','结果'],['收入','250']] },
    { kind: 'chart', objectId: objects.find(object => object.kind === 'chart').objectId, series: ['2026收入'], categories: [{ label: 'Q3', values: [31] },{ label: 'Q4', values: [42] }] },
    { kind: 'image', objectId: objects.find(object => object.kind === 'image').objectId, filePath: 'company/logo.png', sha256: hash(png) }]
  const result = await compose(input, [{ sourceSlide: 1, fills }, { sourceSlide: 1, notes: '复制页独立备注' }, { sourceSlide: 2, notes: '收尾' }], [{ filePath: 'company/logo.png', buffer: png, extension: 'png' }])
  await format.validateFile(Buffer.from(result.buffer))
  const final = await inspect(result.buffer)
  assert.deepEqual(final.issues.filter(issue => issue.blocking), [])
  assert.equal(final.slides[0].objects.find(object => object.objectId === repeated[0].objectId)?.text, repeated[0].text)
  assert.equal(final.slides[0].objects.find(object => object.objectId === repeated[1].objectId)?.text, '仅改第二个')
  assert.ok(final.slides[0].objects.find(object => object.kind === 'table')?.text.includes('250'))
  const zip = await JSZip.loadAsync(result.buffer)
  const charts = await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/charts\/[^/]+\.xml$/.test(name)).map(name => zip.file(name).async('string')))
  assert.ok(charts.some(xml => xml.includes('2026收入') && xml.includes('42')))
  assert.ok(charts.some(xml => xml.includes('Q1') && xml.includes('20')), 'Unchanged duplicate chart remains original')
  assert.equal(final.masterCount, report.masterCount)
  assert.equal(final.slides[0].notes, '企业原始备注')
  assert.equal(final.slides[1].notes, '复制页独立备注')
  const originalZip = await JSZip.loadAsync(input)
  for (const name of Object.keys(originalZip.files).filter(name => /^ppt\/slide(Masters|Layouts)\/.+\.xml$/.test(name)))
    assert.equal(await zip.file(name)?.async('string'), await originalZip.file(name).async('string'), name)
  if (process.env.PPTX_TEMPLATE_EVIDENCE_DIR) {
    await writeFile(process.env.PPTX_TEMPLATE_EVIDENCE_DIR + '/enterprise-template.pptx', input)
    await writeFile(process.env.PPTX_TEMPLATE_EVIDENCE_DIR + '/enterprise-filled.pptx', result.buffer)
  }
})
test('group containers are not misclassified as their nested table or chart slots', async () => {
  const zip = await JSZip.loadAsync(await corporate()), path = 'ppt/slides/slide1.xml'
  const xml = await zip.file(path).async('string')
  const frame = xml.match(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/)[0]
  zip.file(path, xml.replace(frame, `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="999" name="Grouped metrics"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${frame}</p:grpSp>`))
  const bytes = await zip.generateAsync({ type: 'nodebuffer' }), report = await inspect(bytes)
  const group = report.slides[0].objects.find(object => object.objectId === '999')
  assert.equal(group.kind, 'unsupported')
  assert.equal(group.fillable, false)
  assert.ok(report.slides[0].objects.some(object => object.kind === 'table' && object.fillable))
  await assert.rejects(compose(bytes, [{ sourceSlide: 1, fills: [{ kind: 'table', objectId: '999', rows: [['a', 'b'], ['c', 'd']] }] }]), /slot_mismatch/)
})

test('reject unsafe relationships, animated templates, bad slots and table dimensions', async () => {
  const input = await corporate(), report = await inspect(input)
  await assert.rejects(compose(input, [{ sourceSlide: 1, fills: [{ kind: 'text', objectId: '999999', text: 'bad' }] }]), /slot_mismatch/)
  const table = report.slides[0].objects.find(object => object.kind === 'table')
  await assert.rejects(compose(input, [{ sourceSlide: 1, fills: [{ kind: 'table', objectId: table.objectId, rows: [['x']] }] }]), /table_dimensions/)
  const zip = await JSZip.loadAsync(input), part = report.slides[0].path
  zip.file(part, (await zip.file(part).async('string')).replace('</p:sld>', '<p:timing/></p:sld>'))
  const animated = await zip.generateAsync({ type: 'nodebuffer' })
  assert.ok((await inspect(animated)).issues.some(issue => issue.code === 'animation_unsupported'))
  await assert.rejects(compose(animated, [{ sourceSlide: 1 }]), /template_incompatible/)
  assert.throws(() => templateComposeSchema.parse({ operationId: randomUUID(), title: 'x', source: { kind: 'builtin', templateId: '../secret', language: 'zh' }, slides: [{ sourceSlide: 1 }] }))
})

test('reject active content concealed inside a native chart workbook', async () => {
  const zip = await JSZip.loadAsync(await corporate())
  const entry = Object.values(zip.files).find(file => file.name.startsWith('ppt/embeddings/') && file.name.endsWith('.xlsx'))
  const workbook = await JSZip.loadAsync(await entry.async('nodebuffer'))
  workbook.file('xl/vbaProject.bin', Buffer.from('synthetic active-content fixture'))
  zip.file(entry.name, await workbook.generateAsync({ type: 'nodebuffer' }))
  const unsafe = await zip.generateAsync({ type: 'nodebuffer' })
  assert.ok((await inspect(unsafe)).issues.some(issue => issue.code === 'active_content' && issue.part.includes('!/xl/vbaProject.bin')))
  await assert.rejects(compose(unsafe, [{ sourceSlide: 1 }]), /template_incompatible/)
})
