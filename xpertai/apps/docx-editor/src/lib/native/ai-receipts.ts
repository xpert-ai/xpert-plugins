import { ConflictException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { z } from 'zod/v3'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

const part = 'customXml/xpertDocxOperations.xml'
const namespace = 'urn:xpert:docx:operations:1'
const receiptSchema = z.object({ id: z.string().uuid(), actor: z.string().length(64), hash: z.string().length(64) }).strict()
const journalSchema = z.object({ creation: receiptSchema.optional(), operations: z.array(receiptSchema).max(128) }).strict()
export type Receipt = z.infer<typeof receiptSchema>
type Journal = z.infer<typeof journalSchema>
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Receipts share the same CAS commit as the edited OOXML, so a lost response is safe to retry. */
export async function readReceipts(buffer: Buffer): Promise<Journal> {
  const zip = await JSZip.loadAsync(buffer), file = zip.file(part)
  if (!file) return { operations: [] }
  const xml = await file.async('string')
  if (xml.length > 98000 || XMLValidator.validate(xml) !== true) throw new ConflictException('docx.receipt_invalid')
  const document: Record<string, Record<string, unknown>> = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml)
  const [key, root] = Object.entries(document).find(([key]) => key === 'operations' || key.endsWith(':operations')) ?? []
  const prefix = key?.includes(':') ? `:${key.split(':')[0]}` : ''
  const data = root?.['#text']
  if (root?.[`@_xmlns${prefix}`] !== namespace || typeof data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data))
    throw new ConflictException('docx.receipt_invalid')
  return journalSchema.parse(JSON.parse(Buffer.from(data, 'base64').toString('utf8')))
}
export function matchReceipt(journal: Journal, request: Receipt, creation = false) {
  const previous = creation ? journal.creation : journal.operations.find(item => item.id === request.id && item.actor === request.actor)
  if (!previous) return false
  if (previous.id !== request.id || previous.actor !== request.actor || previous.hash !== request.hash)
    throw new ConflictException('docx.operation_reused')
  return true
}
export async function recordReceipt(buffer: Buffer, receipt: Receipt, creation = false): Promise<Buffer> {
  const journal = await readReceipts(buffer), zip = await JSZip.loadAsync(buffer)
  if (creation) journal.creation = receipt
  else journal.operations = [...journal.operations, receipt].slice(-128)
  zip.file(part, `<?xml version="1.0" encoding="UTF-8"?><operations xmlns="${namespace}">${Buffer.from(JSON.stringify(journal)).toString('base64')}</operations>`)
  const relationships = await zip.file('word/_rels/document.xml.rels')?.async('string') ?? '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  if (!relationships.includes(`Target="../${part}"`)) {
    let id = 'rIdXpertDocxOperations'
    while (relationships.includes(`Id="${id}"`)) id += '_'
    zip.file('word/_rels/document.xml.rels', relationships.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${part}"/></Relationships>`))
  }
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes(`PartName="/${part}"`)) zip.file('[Content_Types].xml', types.replace('</Types>', `<Override PartName="/${part}" ContentType="application/xml"/></Types>`))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
