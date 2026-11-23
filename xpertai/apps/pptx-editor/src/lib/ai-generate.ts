import { createRequire } from 'node:module'
import type PptxGenJS from 'pptxgenjs'
import { createSchema, type DeckPlan } from './ai-schema.js'

const Presentation = createRequire(import.meta.url)('pptxgenjs') as typeof PptxGenJS.default

/** The plan is a new-file compiler input, never a replacement authority for an existing deck. */
export async function generatePresentation(input: DeckPlan): Promise<Buffer> {
  const plan = createSchema.parse(input), deck = new Presentation(), brand = plan.brand
  deck.layout = 'LAYOUT_WIDE'
  deck.author = brand.company || 'Xpert'
  deck.company = brand.company
  deck.title = plan.title
  deck.subject = 'Structured editable presentation'
  deck.theme = { headFontFace: brand.font, bodyFontFace: brand.font }
  plan.slides.forEach((page, index) => {
    const slide = deck.addSlide(), dark = page.layout === 'cover' || page.layout === 'section'
    const ink = dark ? brand.background : brand.primary
    slide.background = { color: dark ? brand.primary : brand.background }
    const label = (value: string, x: number, y: number, w: number, h: number, fontSize: number, bold = false, color = ink) =>
      slide.addText(value, { x, y, w, h, fontFace: brand.font, fontSize, bold, color, margin: 0, breakLine: false, valign: 'middle' })
    label(brand.company, 0.6, 0.3, 11.8, 0.35, 11, false, dark ? brand.accent : ink)
    label(String(index + 1).padStart(2, '0'), 12, 7.05, 0.65, 0.22, 10, false, brand.accent)
    if (dark) {
      slide.addShape(deck.ShapeType.rect, { x: 0.65, y: 1.5, w: 0.1, h: 0.7, fill: { color: brand.accent }, line: { color: brand.accent } })
      label(page.title, 1.05, 1.45, 11.1, 2, page.layout === 'cover' ? 36 : 32, true)
      label(page.subtitle, 1.05, 4.1, 11.1, 1.25, 21, false, brand.accent)
    } else {
      label(page.title, 0.65, 0.95, 12, 0.8, 28, true)
      if (page.layout === 'bullets') page.points.forEach((point, n) => {
        const y = 2.05 + n * 0.72
        slide.addShape(deck.ShapeType.ellipse, { x: 0.72, y: y + 0.17, w: 0.09, h: 0.09, line: { color: brand.accent }, fill: { color: brand.accent } })
        label(point, 1.02, y, 11.55, 0.62, 20)
      })
      if (page.layout === 'process') {
        const width = (11.8 - (page.steps.length - 1) * 0.36) / page.steps.length
        page.steps.forEach((step, n) => {
          const x = 0.7 + n * (width + 0.36)
          slide.addShape(deck.ShapeType.roundRect, { x, y: 2.65, w: width, h: 2.45,
            fill: { color: brand.primary }, line: { color: brand.primary } })
          label(step.title, x + 0.15, 2.92, width - 0.3, 0.7, 19, true, brand.background)
          label(step.detail, x + 0.15, 3.8, width - 0.3, 0.95, 14, false, brand.background)
          if (n < page.steps.length - 1) slide.addShape(deck.ShapeType.chevron, { x: x + width + 0.08, y: 3.67, w: 0.2, h: 0.35,
            line: { color: brand.accent }, fill: { color: brand.accent } })
        })
      }
      if (page.layout === 'table') slide.addTable([page.headers.map(text => ({ text, options: { bold: true, color: brand.background, fill: { color: brand.primary } } })), ...page.rows.map(row => row.map(text => ({ text })))],
        { x: 0.65, y: 2.05, w: 12, h: 4.45, colW: 12 / page.headers.length, fontFace: brand.font, fontSize: 16,
          color: brand.primary, fill: { color: 'FFFFFF' }, border: { color: brand.background, pt: 1 }, margin: 0.1, autoPage: false })
    }
    slide.addNotes(page.notes)
  })
  const result = await deck.write({ outputType: 'nodebuffer' })
  if (!Buffer.isBuffer(result)) throw new Error('pptx.export_failed')
  return result
}
