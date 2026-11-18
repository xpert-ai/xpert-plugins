import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

/** Read display metadata from validated PPTX bytes, never from the generated storage name. */
export async function presentationSummary(buffer: Buffer, fallbackTitle: string) {
  const zip = await JSZip.loadAsync(buffer)
  const parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false,
    isArray: (_name, path) => path === 'presentation.sldIdLst.sldId' })
  const core = await zip.file('docProps/core.xml')?.async('string')
  let title: unknown
  // Optional Office metadata must not make a successfully committed export fail.
  try {
    title = core ? (parser.parse(core) as { coreProperties?: { title?: unknown } }).coreProperties?.title : undefined
  } catch { /* An absent or malformed title falls back to the authorized file descriptor. */ }
  const xml = await zip.file('ppt/presentation.xml')!.async('string')
  const presentation = parser.parse(xml) as { presentation?: { sldIdLst?: { sldId?: unknown[] } } }
  return { title: typeof title === 'string' && title.trim() ? title.trim() : fallbackTitle,
    slideCount: presentation.presentation?.sldIdLst?.sldId?.length }
}
