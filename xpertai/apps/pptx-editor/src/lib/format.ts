import { BadRequestException, Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import type PptxGenJS from 'pptxgenjs'
import { XMLValidator } from 'fast-xml-parser'
import { validateZipBudget } from './zip-budget.js'
export { validateZipBudget } from './zip-budget.js'
import { PPTX_EDITOR, PPTX_ENTRY, PPTX_MAX_BYTES, PPTX_MIME, PPTX_VIEW, PPTX_VIEW_PROVIDER } from './constants.js'
import { PPTX_RESOURCE_TYPE } from './resource-editor.js'

// PptxGenJS 4 ships CJS declaration metadata for its ESM export. Keep that interop here.
const Presentation = createRequire(import.meta.url)('pptxgenjs') as typeof PptxGenJS.default

@Injectable()
@ContentEditorProvider(PPTX_EDITOR)
export class PptxFormat implements ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration = {
    kind: 'file', protocolVersion: 2, key: PPTX_EDITOR, title: 'PowerPoint (PPTX)',
    formatId: 'pptx', extension: 'pptx', mimeType: PPTX_MIME, concurrency: 'versioned',
    resourceType: PPTX_RESOURCE_TYPE,
    view: { providerKey: PPTX_VIEW_PROVIDER, viewKey: PPTX_VIEW, entry: PPTX_ENTRY }
  }
  async create(): Promise<Buffer> {
    const deck = new Presentation()
    deck.layout = 'LAYOUT_WIDE'
    deck.author = 'Xpert'
    deck.addSlide().addNotes('')
    const result = await deck.write({ outputType: 'nodebuffer' })
    if (!Buffer.isBuffer(result)) throw new Error('pptx.export_failed')
    return result
  }
  async validateFile(buffer: Buffer): Promise<void> {
    if (!buffer.length || buffer.length > PPTX_MAX_BYTES) throw new BadRequestException('pptx.file_size_limit')
    try {
      validateZipBudget(buffer)
      const zip = await JSZip.loadAsync(buffer)
      for (const name of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']) {
        const xml = await zip.file(name)?.async('string')
        if (!xml || XMLValidator.validate(xml) !== true) throw new Error('invalid_part')
        if (name === '[Content_Types].xml' && !xml.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')) throw new Error('not_pptx')
      }
      const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/[^/]+\.xml$/.test(name))
      if (!slides.length || slides.length > 500) throw new Error('slide_limit')
    } catch {
      throw new BadRequestException('pptx.invalid_package')
    }
  }
}
