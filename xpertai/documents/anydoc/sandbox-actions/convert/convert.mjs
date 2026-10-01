import { createRequire } from 'node:module'
import path from 'node:path'
import { INPUT_LIMIT, ASSET_LIMIT, asset, fail, finish, readBounded } from './result.mjs'
import { convertPdfPages } from './pdf.mjs'

export const FORMATS = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'odt', 'ods', 'odp', 'rtf', 'epub', 'pdf']

export async function convert(file, extension, output, suppliedApi) {
  if (!FORMATS.includes(extension)) fail('UNSUPPORTED_FORMAT')
  let bytes
  try {
    bytes = await readBounded(file, INPUT_LIMIT)
  } catch (error) {
    if (error.code === 'OUTPUT_TOO_LARGE') fail('INPUT_TOO_LARGE')
    throw error
  }
  if (!bytes.length) fail('EMPTY_FILE')
  let api = suppliedApi
  if (!api) {
    const root = process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
    if (!root || !path.isAbsolute(root)) fail('RUNTIME_INVALID')
    try {
      api = createRequire(path.join(root, 'package.json'))('@firecrawl/anydoc')
    } catch {
      fail('RUNTIME_INVALID')
    }
  }
  try {
    const format = api.formatFromExtension(extension)
    const detected = api.formatFromBytes(bytes)
    if (!format || (detected && detected !== format)) fail('INVALID_DOCUMENT')
    if (!detected && extension !== 'csv') fail('INVALID_DOCUMENT')
    if (extension === 'csv') {
      if (bytes.includes(0)) fail('INVALID_DOCUMENT')
      let text
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        fail('UNSUPPORTED_ENCODING')
      }
      if (!text.trim()) fail('EMPTY_TEXT')
    }
    // Never delegate to Firecrawl hosted OCR, even when the host has a Firecrawl API key.
    let markdown
    try {
      markdown = await api.toMarkdownBytes(bytes, format, { ocr: 'reject' })
    } catch (error) {
      if (extension !== 'pdf' || error?.code !== 'needsOcr') throw error
      return await convertPdfPages(bytes, api)
    }
    const assets = []
    if (extension !== 'pdf') {
      const document = await api.toDocument(bytes, format)
      if (document.assets.length > ASSET_LIMIT) fail('OUTPUT_TOO_LARGE')
      for (const source of document.assets) {
        const suffix =
          { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[
            source.mediaType
          ] ?? 'bin'
        const name = `asset-${assets.length + 1}.${suffix}`
        assets.push(asset(name, source.mediaType, Buffer.from(source.data)))
        // Native Markdown omits embedded images. Export them explicitly without inventing page/position data.
        if (['png', 'jpg', 'gif', 'webp'].includes(suffix))
          markdown += `\n\n![Embedded image ${assets.length}](xpert-asset://${name})\n`
      }
    }
    return finish({ markdown, assets })
  } catch (error) {
    const code = {
      needsOcr: 'NEEDS_OCR',
      encrypted: 'ENCRYPTED',
      unsupported: 'UNSUPPORTED_FORMAT',
      malformed: 'INVALID_DOCUMENT',
      missingPart: 'INVALID_DOCUMENT',
      resourceLimit: 'RESOURCE_LIMIT'
    }[error?.code]
    if (code) fail(code, error.pages)
    throw error
  }
}
