import JSZip from 'jszip'
import { posix } from 'node:path'
import { createRequire } from 'node:module'
import type * as AutomizerModule from 'pptx-automizer'
import type { TemplateEngineInput, TemplateObject, TemplateReport } from '../src/lib/template-schema'
import { validateZipBudget } from '../src/lib/zip-budget'

// pptx-automizer is CJS; keep its interop at this boundary, never in document/UI models.
const { Automizer, modify, NullLogger } = createRequire(import.meta.url)('pptx-automizer') as typeof AutomizerModule
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const q = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name))
const xml = (text: string) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('pptx.template_unsafe_xml')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (q(doc, 'parsererror').length) throw new Error('pptx.template_invalid_xml')
  return doc
}
const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc)
const relPath = (part: string) => posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels')
function targetPath(part: string, target: string) {
  if (!target || /[\\\u0000-\u001f]/.test(target)) throw new Error('pptx.template_invalid_relationship')
  const path = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(part), target))
  if (path.startsWith('../') || path.includes(':')) throw new Error('pptx.template_invalid_relationship')
  return path
}
async function readXml(zip: JSZip, part: string) {
  const text = await zip.file(part)?.async('string')
  if (!text) throw new Error('pptx.template_missing_part')
  return xml(text)
}
async function relations(zip: JSZip, part: string) {
  const text = await zip.file(relPath(part))?.async('string')
  return text ? q(xml(text), 'Relationship') : []
}
async function orderedSlides(zip: JSZip) {
  const rels = await relations(zip, 'ppt/presentation.xml')
  return q(await readXml(zip, 'ppt/presentation.xml'), 'sldId').map(slide => {
    const rel = rels.find(item => item.getAttribute('Id') === slide.getAttributeNS(R, 'id'))
    if (!rel) throw new Error('pptx.template_invalid_relationship')
    return targetPath('ppt/presentation.xml', rel.getAttribute('Target')!)
  })
}
async function notes(zip: JSZip, part: string) {
  const rel = (await relations(zip, part)).find(item => item.getAttribute('Type') === R + '/notesSlide')
  if (!rel) return ''
  const doc = await readXml(zip, targetPath(part, rel.getAttribute('Target')!))
  return q(doc, 'sp').filter(shape => q(shape, 'ph').some(ph => ph.getAttribute('type') === 'body'))
    .flatMap(shape => q(shape, 'p').map(p => q(p, 't').map(t => t.textContent).join(''))).join('\n')
}
export async function inspectNative(buffer: Uint8Array): Promise<TemplateReport> {
  validateZipBudget(Buffer.from(buffer))
  const zip = await JSZip.loadAsync(buffer)
  const report: TemplateReport = { slideCount: 0, masterCount: 0, layoutCount: 0, slides: [], issues: [] }
  const issue = (code: string, part: string, blocking = true) => report.issues.push({ code, part, blocking })
  let embeddedBytes = 0
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    if (/vbaProject|activeX|oleObject|\.bin$|^ppt\/media\/.*\.(mp4|mp3|wav|avi|wmv)$/i.test(entry.name)) issue('active_content', entry.name)
    if (/^ppt\/embeddings\//.test(entry.name)) {
      if (!entry.name.endsWith('.xlsx')) issue('embedded_file_unsupported', entry.name)
      else {
        const bytes = await entry.async('nodebuffer')
        embeddedBytes += validateZipBudget(bytes)
        if (embeddedBytes > 100 * 1024 * 1024) throw new Error('pptx.template_embedded_size_limit')
        // Chart workbooks are packages too: a benign .xlsx suffix must not hide active content.
        const workbook = await JSZip.loadAsync(bytes)
        for (const nested of Object.values(workbook.files)) {
          if (nested.dir) continue
          const part = `${entry.name}!/${nested.name}`
          if (/vbaProject|activeX|embeddings\/|externalLinks\/|connections\.xml|\.bin$/i.test(nested.name)) issue('active_content', part)
          if (!/\.(xml|rels)$/.test(nested.name)) continue
          const doc = xml(await nested.async('string'))
          for (const rel of q(doc, 'Relationship')) if (rel.getAttribute('TargetMode') === 'External' &&
            (rel.getAttribute('Type') !== R + '/hyperlink' || !/^https?:\/\//i.test(rel.getAttribute('Target') ?? ''))) issue('external_resource', part)
        }
      }
    }
    if (/^ppt\/slideMasters\/[^/]+\.xml$/.test(entry.name)) report.masterCount++
    if (/^ppt\/slideLayouts\/[^/]+\.xml$/.test(entry.name)) report.layoutCount++
    if (!/\.(xml|rels)$/.test(entry.name)) continue
    const doc = xml(await entry.async('string'))
    if (q(doc, 'timing').length) issue('animation_unsupported', entry.name)
    if (q(doc, 'transition').length) issue('transition_preservation_unverified', entry.name, false)
    if (q(doc, 'relIds').some(node => node.namespaceURI?.includes('/diagram'))) issue('smartart_unsupported', entry.name)
    if (entry.name.endsWith('.rels')) {
      const part = entry.name === '_rels/.rels' ? '' : posix.join(posix.dirname(posix.dirname(entry.name)), posix.basename(entry.name, '.rels'))
      for (const rel of q(doc, 'Relationship')) {
        const target = rel.getAttribute('Target') ?? ''
        if (/\/(video|audio|oleObject|control|webextension)$/.test(rel.getAttribute('Type') ?? '')) issue('active_content', entry.name)
        if (rel.getAttribute('TargetMode') === 'External') {
          if (rel.getAttribute('Type') !== R + '/hyperlink' || !/^https?:\/\//i.test(target)) issue('external_resource', entry.name)
        } else if (!zip.file(targetPath(part, target))) issue('missing_relationship_target', entry.name)
      }
    }
  }
  const paths = await orderedSlides(zip)
  if (!paths.length || paths.length > 500) throw new Error('pptx.template_slide_limit')
  for (const [index, path] of paths.entries()) {
    const doc = await readXml(zip, path), objects: TemplateObject[] = [], names = new Map<string, number>(), ids = new Set<string>()
    const rels = await relations(zip, path)
    for (const identity of q(doc, 'cNvPr')) {
      const shape = identity.parentElement?.parentElement
      if (!shape || shape.localName === 'spTree') continue
      const objectId = identity.getAttribute('id') ?? '', name = identity.getAttribute('name') ?? ''
      if (!/^\d{1,12}$/.test(objectId) || ids.has(objectId)) throw new Error('pptx.template_ambiguous_object')
      ids.add(objectId)
      const nameIndex = names.get(name) ?? 0; names.set(name, nameIndex + 1)
      // A group may contain several frames; it is never itself a table/chart slot.
      const tbl = shape.localName === 'graphicFrame' ? q(shape, 'tbl')[0] : undefined
      const chart = shape.localName === 'graphicFrame' ? q(shape, 'chart')[0] : undefined
      const kind: TemplateObject['kind'] = shape.localName === 'pic' ? 'image' : tbl ? 'table' : chart ? 'chart' :
        shape.localName === 'sp' && q(shape, 'txBody').length ? 'text' : 'unsupported'
      const object: TemplateObject = { objectId, name, nameIndex, kind, fillable: !!name && kind !== 'unsupported',
        text: q(shape, 'p').map(p => q(p, 't').map(t => t.textContent).join('')).join('\n').slice(0, 4000) }
      const transform = q(shape, 'xfrm')[0], off = transform && q(transform, 'off')[0], ext = transform && q(transform, 'ext')[0]
      if (off && ext) object.bounds = { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), width: Number(ext.getAttribute('cx')), height: Number(ext.getAttribute('cy')) }
      if (tbl) {
        object.rows = q(tbl, 'tr').length; object.columns = q(tbl, 'gridCol').length
        if (q(tbl, 'tc').some(cell => ['gridSpan', 'rowSpan', 'hMerge', 'vMerge'].some(attr => cell.hasAttribute(attr)))) object.fillable = false
      }
      if (chart) {
        const rel = rels.find(rel => rel.getAttribute('Id') === chart.getAttributeNS(R, 'id'))
        if (!rel) throw new Error('pptx.template_invalid_relationship')
        const chartPath = targetPath(path, rel.getAttribute('Target')!), chartDoc = await readXml(zip, chartPath)
        const plot = q(chartDoc, 'plotArea')[0]
        const types = plot ? Array.from(plot.children).filter(node => node.localName.endsWith('Chart')).map(node => node.localName) : []
        object.chartType = types.join(',')
        object.fillable = types.length === 1 && ['barChart','lineChart','areaChart','pieChart','doughnutChart'].includes(types[0]) &&
          (await relations(zip, chartPath)).some(rel => rel.getAttribute('Type') === R + '/package')
      }
      objects.push(object)
    }
    report.slides.push({ number: index + 1, path, notes: await notes(zip, path), objects })
  }
  report.slideCount = report.slides.length
  return report
}

/** Patch only the speaker-note body, retaining page-image placeholders and existing master relations. */
async function setNotes(zip: JSZip, part: string, text: string, index: number) {
  const rels = xml(await zip.file(relPath(part))?.async('string') ?? `<Relationships xmlns="${REL}"/>`)
  let rel = q(rels, 'Relationship').find(item => item.getAttribute('Type') === R + '/notesSlide')
  let notesPath: string
  if (rel) notesPath = targetPath(part, rel.getAttribute('Target')!)
  else {
    notesPath = `ppt/notesSlides/xpert-note-${index}.xml`
    rel = rels.createElementNS(REL, 'Relationship'); rel.setAttribute('Id', `xpertNotes${index}`)
    rel.setAttribute('Type', R + '/notesSlide'); rel.setAttribute('Target', posix.relative(posix.dirname(part), notesPath))
    rels.documentElement.appendChild(rel); zip.file(relPath(part), serialize(rels))
    zip.file(relPath(notesPath), `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/slide" Target="${posix.relative(posix.dirname(notesPath), part)}"/></Relationships>`)
    const types = await readXml(zip, '[Content_Types].xml'), override = types.createElementNS(types.documentElement.namespaceURI, 'Override')
    override.setAttribute('PartName', '/' + notesPath); override.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')
    types.documentElement.appendChild(override); zip.file('[Content_Types].xml', serialize(types))
  }
  const doc = xml(await zip.file(notesPath)?.async('string') ?? `<p:notes xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`)
  let shape = q(doc, 'sp').find(shape => q(shape, 'ph').some(ph => ph.getAttribute('type') === 'body'))
  if (!shape) {
    const id = Math.max(1, ...q(doc, 'cNvPr').map(node => Number(node.getAttribute('id')) || 0)) + 1
    shape = xml(`<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${id}" name="Speaker notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp>`).documentElement
    shape = doc.importNode(shape, true); q(doc, 'spTree')[0].appendChild(shape)
  }
  let body = q(shape, 'txBody')[0]
  if (!body) { body = doc.createElementNS(P, 'p:txBody'); body.append(doc.createElementNS(A, 'a:bodyPr'), doc.createElementNS(A, 'a:lstStyle')); shape.appendChild(body) }
  q(body, 'p').forEach(p => p.remove())
  for (const line of text.split('\n')) {
    const p = doc.createElementNS(A, 'a:p'), r = doc.createElementNS(A, 'a:r'), t = doc.createElementNS(A, 'a:t')
    t.textContent = line; r.appendChild(t); p.appendChild(r); body.appendChild(p)
  }
  zip.file(notesPath, serialize(doc))
}

export async function composeNative(input: TemplateEngineInput) {
  const report = await inspectNative(input.buffer), plan = input.plan
  if (!plan) throw new Error('pptx.template_plan_required')
  if (report.issues.some(issue => issue.blocking)) throw new Error('pptx.template_incompatible')
  // Root and source are the same native package: keep existing master/layout parts rather than re-importing them.
  const deck = new Automizer({ removeExistingSlides: true, autoImportSlideMasters: false, logger: new NullLogger() })
    .loadRoot(Buffer.from(input.buffer)).load(Buffer.from(input.buffer), 'source')
  const media = new Map<string, string>()
  for (const [index, image] of (input.images ?? []).entries()) {
    const name = `xpert-fill-${index}.${image.extension}`
    deck.loadMediaBuffer(name, Buffer.from(image.buffer)); media.set(image.filePath, name)
  }
  for (const requested of plan.slides) {
    const source = report.slides[requested.sourceSlide - 1]
    if (!source) throw new Error('pptx.template_slide_not_found')
    for (const fill of requested.fills) {
      const object = source.objects.find(object => object.objectId === fill.objectId)
      if (!object?.fillable || object.kind !== fill.kind) throw new Error('pptx.template_slot_mismatch')
      if (fill.kind === 'table' && (fill.rows.length !== object.rows || fill.rows.some(row => row.length !== object.columns))) throw new Error('pptx.template_table_dimensions')
    }
    deck.addSlide('source', requested.sourceSlide, slide => {
      for (const fill of requested.fills) {
        const object = source.objects.find(object => object.objectId === fill.objectId)!
        const selector = { name: object.name, nameIdx: object.nameIndex }
        if (fill.kind === 'text') slide.modifyElement(selector, modify.setText(fill.text))
        if (fill.kind === 'table') slide.modifyElement(selector, modify.setTableData({ body: fill.rows.map(row => ({ values: row })) }))
        if (fill.kind === 'chart') slide.modifyElement(selector, modify.setChartData({ series: fill.series.map(label => ({ label })), categories: fill.categories }))
        if (fill.kind === 'image') {
          const name = media.get(fill.filePath)
          if (!name) throw new Error('pptx.template_image_missing')
          const replaceImage: AutomizerModule.ShapeModificationCallback = (element, relation) => {
            if (!relation) throw new Error('pptx.template_image_missing')
            modify.setRelationTarget(name)(element, relation)
          }
          slide.modifyElement(selector, replaceImage)
        }
      }
    })
  }
  const zip = await deck.getJSZip(), paths = await orderedSlides(zip)
  // No cross-template master import is needed. Retain the root's immutable brand parts byte-for-byte.
  const original = await JSZip.loadAsync(input.buffer)
  for (const entry of Object.values(original.files)) if (!entry.dir && /^ppt\/(slideMasters|slideLayouts|theme)\//.test(entry.name))
    zip.file(entry.name, await entry.async('uint8array'))
  for (const [index, requested] of plan.slides.entries()) await setNotes(zip, paths[index], requested.notes ?? report.slides[requested.sourceSlide - 1].notes, index + 1)
  const core = await zip.file('docProps/core.xml')?.async('string')
  if (core) { const doc = xml(core), title = q(doc, 'title')[0]; if (title) title.textContent = plan.title; zip.file('docProps/core.xml', serialize(doc)) }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const final = await inspectNative(buffer)
  if (final.slideCount !== plan.slides.length || final.issues.some(issue => issue.blocking)) throw new Error('pptx.template_invalid_result')
  return { buffer: new Uint8Array(buffer), slideCount: final.slideCount }
}
