import { parentPort, workerData } from 'node:worker_threads'
import { JSDOM } from 'jsdom'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parsePptx, savePptx } from '../src/core/pptx-file.utils'
import { paragraphsForShapeText } from '../src/core/pptx-editor-model.utils'
import { pptxShapeStyle, pptxSlideBackground } from '../src/core/pptx-editor-view.utils'
import { PptxShapeContent } from '../remote/canvas/PptxShapeContent'
import type { EngineInput, EngineOutput, ValidationIssue } from '../src/lib/ai-schema'
import type { TemplateEngineInput } from '../src/lib/template-schema'
import { composeNative, inspectNative } from './template-native'

// No resources/scripts are enabled. These globals exist only in this disposable worker.
const dom = new JSDOM('')
Object.assign(globalThis, { DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer })

async function run(input: EngineInput | TemplateEngineInput): Promise<EngineOutput> {
  if (input.action === 'templateInspect') {
    const template = await inspectNative(input.buffer)
    return { slideCount: template.slideCount, template }
  }
  if (input.action === 'templateCompose') return composeNative(input)
  const source = Uint8Array.from(input.buffer).buffer, deck = await parsePptx(source)
  const output: EngineOutput = { slideCount: deck.slides.length }
  const offset = input.offset ?? 0, limit = input.limit ?? 1
  if (input.action === 'inspect') {
    output.slides = deck.slides.slice(offset, offset + limit).map((slide, n) => ({ slideId: slide.path, index: offset + n + 1,
      notes: (slide.notes ?? '').slice(0, 2000), notesTruncated: (slide.notes?.length ?? 0) > 2000,
      objectsTruncated: slide.shapes.filter(shape => !shape.deleted).length > (input.objectOffset ?? 0) + 25,
      objects: slide.shapes.filter(shape => !shape.deleted).slice(input.objectOffset ?? 0, (input.objectOffset ?? 0) + 25).map(shape => ({ objectId: shape.id,
        name: shape.name.slice(0, 120), kind: shape.kind, editable: shape.editable, text: shape.text.slice(0, 600), textTruncated: shape.text.length > 600,
        bounds: { x: shape.x * 100 / deck.width, y: shape.y * 100 / deck.height, width: shape.width * 100 / deck.width, height: shape.height * 100 / deck.height } })) }))
    output.hasMore = offset + limit < deck.slides.length
  }
  if (input.action === 'apply') {
    for (const op of input.operations ?? []) {
      const slide = deck.slides.find(page => page.path === op.slideId)
      if (!slide) throw new Error('pptx.slide_not_found')
      if (op.kind === 'setNotes') { slide.notes = op.notes; continue }
      const shape = slide.shapes.find(item => item.id === op.objectId && !item.deleted)
      if (!shape?.editable) throw new Error('pptx.object_not_editable')
      if (op.kind === 'setText') {
        if (shape.kind !== 'shape') throw new Error('pptx.text_target_required')
        shape.text = op.text
        shape.paragraphs = paragraphsForShapeText(shape, op.text)
      } else {
        if (op.x + op.width > 100 || op.y + op.height > 100) throw new Error('pptx.bounds_outside_slide')
        Object.assign(shape, { x: Math.round(op.x * deck.width / 100), y: Math.round(op.y * deck.height / 100),
          width: Math.round(op.width * deck.width / 100), height: Math.round(op.height * deck.height / 100) })
      }
    }
    output.buffer = new Uint8Array(await savePptx(deck, source))
  }
  if (input.action === 'validate') {
    const issues: ValidationIssue[] = []
    for (const slide of deck.slides) {
      if (!slide.notes?.trim()) issues.push({ slideId: slide.path, code: 'notes_empty' })
      for (const shape of slide.shapes.filter(item => !item.deleted)) {
        if (shape.x < -1 || shape.y < -1 || shape.x + shape.width > deck.width + 1 || shape.y + shape.height > deck.height + 1)
          issues.push({ slideId: slide.path, objectId: shape.id, code: 'object_outside_slide' })
      }
    }
    output.issues = issues.slice(0, 100)
    output.issuesTruncated = issues.length > 100
  }
  if (input.action === 'render') {
    if (offset >= deck.slides.length) throw new Error('pptx.slide_not_found')
    const content = renderToStaticMarkup(<>{deck.slides.slice(offset, offset + limit).map((slide, n) => <section key={slide.path}>
      <p>Slide {offset + n + 1} · Xpert PPTX preview</p>
      <div style={{ position: 'relative', width: '100%', aspectRatio: `${deck.width}/${deck.height}`, containerType: 'inline-size', overflow: 'hidden', background: pptxSlideBackground(slide) }}>
        {slide.shapes.filter(shape => !shape.deleted).map(shape => <div key={shape.id} style={{ ...pptxShapeStyle(shape, deck), position: 'absolute', borderStyle: 'solid', boxSizing: 'border-box', whiteSpace: shape.wrap ? 'pre-wrap' : 'pre' }}>
          <PptxShapeContent shape={shape} deck={deck} />
        </div>)}
      </div>
    </section>)}</>)
    // Static, network-disabled HTML uses the same shape content/styles as the editor. Notes stay private.
    output.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>PPTX preview</title><style>body{background:#e5e7eb;margin:24px;font-family:Arial,sans-serif}section{max-width:1280px;margin:0 auto 24px}*{box-sizing:border-box}p{margin:0 0 8px}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}.max-w-none{max-width:none}.overflow-visible{overflow:visible}.overflow-hidden{overflow:hidden}.flex{display:flex}.flex-col{flex-direction:column}.table-fixed{table-layout:fixed}.border-collapse{border-collapse:collapse}img{display:block}table{border-spacing:0}</style></head><body>${content}</body></html>`
    if (Buffer.byteLength(output.html) > 20 * 1024 * 1024) throw new Error('pptx.preview_size_limit')
  }
  return output
}

run(workerData as EngineInput | TemplateEngineInput).then(result => parentPort?.postMessage({ result })).catch((error: unknown) => {
  const code = error instanceof Error && /^pptx\.[a-z_]+$/.test(error.message) ? error.message : 'pptx.processing_failed'
  parentPort?.postMessage({ error: code })
}).finally(() => dom.window.close())
