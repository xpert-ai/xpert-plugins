import { BadRequestException, Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import type PptxGenJS from 'pptxgenjs'
import { XMLValidator } from 'fast-xml-parser'
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

/** Bound inflated sizes before JSZip can allocate attacker-controlled decompressed entries. */
export function validateZipBudget(buffer: Buffer) {
  let end = -1
  for (let n = buffer.length - 22; n >= Math.max(0, buffer.length - 65557); n--) {
    if (buffer.readUInt32LE(n) === 0x06054b50 && n + 22 + buffer.readUInt16LE(n + 20) === buffer.length) { end = n; break }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new Error('invalid_zip')
  const count = buffer.readUInt16LE(end + 10)
  if (!count || count > 10000) throw new Error('entry_limit')
  let offset = buffer.readUInt32LE(end + 16), total = 0
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('invalid_directory')
    const size = buffer.readUInt32LE(offset + 24)
    total += size
    if (size > 50 * 1024 * 1024 || total > 200 * 1024 * 1024) throw new Error('expanded_size_limit')
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
  if (offset > end) throw new Error('invalid_directory')
}
