import { BadRequestException, ConflictException } from '@nestjs/common'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { OfficeExcelCellPatch, OfficeExcelPatchTarget } from './types.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false
})

const MAX_PATCHES = 10_000
const CELL_ADDRESS = /^[A-Z]{1,3}[1-9][0-9]{0,6}$/

type XmlRecord = Record<string, unknown>

export interface ExcelOoxmlPatchResult {
  buffer: Buffer
  editedCellCount: number
  changedEntries: string[]
  summaries: string[]
}

export type WorkbookOoxmlEdit =
  | { sheetName: string; address: string; kind: 'number'; value: number }
  | { sheetName: string; address: string; kind: 'string'; value: string }
  | { sheetName: string; address: string; kind: 'boolean'; value: boolean }
  | { sheetName: string; address: string; kind: 'clear' }
  | { sheetName: string; address: string; kind: 'formula'; value: string }

/**
 * Applies value/formula changes directly to worksheet XML. JSZip rebuilds the
 * container, but every unmodified OOXML entry keeps byte-identical contents.
 */
export async function applyExcelOoxmlPatches(
  source: Buffer,
  patches: OfficeExcelCellPatch[]
): Promise<ExcelOoxmlPatchResult> {
  if (!patches.length || patches.length > MAX_PATCHES) {
    throw new BadRequestException(`Excel patch count must be between 1 and ${MAX_PATCHES}.`)
  }

  const zip = await JSZip.loadAsync(source, { checkCRC32: true })
  const workbookXml = await requireZipText(zip, 'xl/workbook.xml')
  const relationshipsXml = await requireZipText(zip, 'xl/_rels/workbook.xml.rels')
  const sheetParts = resolveWorksheetParts(workbookXml, relationshipsXml)
  const grouped = new Map<string, OfficeExcelCellPatch[]>()

  for (const patch of patches) {
    const sheetName = patch.sheetName.trim()
    const address = patch.address.trim().toUpperCase()
    if (!sheetName || !CELL_ADDRESS.test(address)) {
      throw new BadRequestException(`Invalid Excel patch target ${patch.sheetName}!${patch.address}.`)
    }
    if (patch.kind === 'number') {
      requireFiniteDecimal(patch.value, `${sheetName}!${address} value`)
    } else {
      validateFormula(patch.value, `${sheetName}!${address} formula`)
      requireFiniteDecimal(patch.cachedValue, `${sheetName}!${address} cachedValue`)
    }
    const key = `${sheetName}\u0000${address}`
    if (grouped.has(key)) {
      throw new BadRequestException(`Duplicate Excel patch target ${sheetName}!${address}.`)
    }
    grouped.set(key, [{ ...patch, sheetName, address }])
  }

  const patchesByPart = new Map<string, OfficeExcelCellPatch[]>()
  for (const [key, value] of grouped) {
    const sheetName = key.slice(0, key.indexOf('\u0000'))
    const part = sheetParts.get(sheetName)
    if (!part) throw new BadRequestException(`Excel sheet "${sheetName}" was not found.`)
    patchesByPart.set(part, [...(patchesByPart.get(part) ?? []), value[0]])
  }

  const changedEntries: string[] = []
  const summaries: string[] = []
  for (const [part, partPatches] of patchesByPart) {
    const before = await requireZipText(zip, part)
    let after = before
    for (const patch of partPatches) {
      after = patchWorksheetCell(after, patch)
      summaries.push(`Patched ${patch.sheetName}!${patch.address}.`)
    }
    if (after !== before) {
      zip.file(part, after)
      changedEntries.push(part)
    }
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX'
  })
  return { buffer, editedCellCount: patches.length, changedEntries, summaries }
}

export async function findOccupiedExcelPatchTargets(
  source: Buffer,
  patches: OfficeExcelCellPatch[]
): Promise<OfficeExcelPatchTarget[]> {
  if (!patches.length || patches.length > MAX_PATCHES) {
    throw new BadRequestException(`Excel patch count must be between 1 and ${MAX_PATCHES}.`)
  }

  const zip = await JSZip.loadAsync(source, { checkCRC32: true })
  const workbookXml = await requireZipText(zip, 'xl/workbook.xml')
  const relationshipsXml = await requireZipText(zip, 'xl/_rels/workbook.xml.rels')
  const sheetParts = resolveWorksheetParts(workbookXml, relationshipsXml)
  const worksheetXml = new Map<string, string>()
  const targets = new Set<string>()
  const occupied: OfficeExcelPatchTarget[] = []

  for (const patch of patches) {
    const sheetName = patch.sheetName.trim()
    const address = patch.address.trim().toUpperCase()
    if (!sheetName || !CELL_ADDRESS.test(address)) {
      throw new BadRequestException(`Invalid Excel patch target ${patch.sheetName}!${patch.address}.`)
    }
    const key = `${sheetName}\u0000${address}`
    if (targets.has(key)) throw new BadRequestException(`Duplicate Excel patch target ${sheetName}!${address}.`)
    targets.add(key)
    const part = sheetParts.get(sheetName)
    if (!part) throw new BadRequestException(`Excel sheet "${sheetName}" was not found.`)
    const xml = worksheetXml.get(part) ?? await requireZipText(zip, part)
    worksheetXml.set(part, xml)
    const inner = worksheetCellInner(xml, sheetName, address)
    if (!isCellEmpty(inner)) occupied.push({ sheetName, address })
  }

  return occupied
}

/** Applies user value edits without rebuilding the workbook or changing cell styles. */
export async function applyWorkbookOoxmlEdits(
  source: Buffer,
  edits: WorkbookOoxmlEdit[]
): Promise<ExcelOoxmlPatchResult> {
  if (!edits.length || edits.length > MAX_PATCHES) {
    throw new BadRequestException(`Workbook edit count must be between 1 and ${MAX_PATCHES}.`)
  }

  const zip = await JSZip.loadAsync(source, { checkCRC32: true })
  const workbookXml = await requireZipText(zip, 'xl/workbook.xml')
  const relationshipsXml = await requireZipText(zip, 'xl/_rels/workbook.xml.rels')
  const sheetParts = resolveWorksheetParts(workbookXml, relationshipsXml)
  const editsByPart = new Map<string, WorkbookOoxmlEdit[]>()
  const targets = new Set<string>()

  for (const edit of edits) {
    const sheetName = edit.sheetName.trim()
    const address = edit.address.trim().toUpperCase()
    if (!sheetName || !CELL_ADDRESS.test(address)) {
      throw new BadRequestException(`Invalid workbook edit target ${edit.sheetName}!${edit.address}.`)
    }
    validateWorkbookEdit({ ...edit, sheetName, address })
    const key = `${sheetName}\u0000${address}`
    if (targets.has(key)) throw new BadRequestException(`Duplicate workbook edit target ${sheetName}!${address}.`)
    targets.add(key)
    const part = sheetParts.get(sheetName)
    if (!part) throw new BadRequestException(`Excel sheet "${sheetName}" was not found.`)
    editsByPart.set(part, [...(editsByPart.get(part) ?? []), { ...edit, sheetName, address }])
  }

  const changedEntries: string[] = []
  const summaries: string[] = []
  for (const [part, partEdits] of editsByPart) {
    const before = await requireZipText(zip, part)
    let after = before
    for (const edit of partEdits) {
      after = editWorksheetCell(after, edit)
      summaries.push(`Edited ${edit.sheetName}!${edit.address}.`)
    }
    if (after !== before) {
      zip.file(part, after)
      changedEntries.push(part)
    }
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX'
  })
  return { buffer, editedCellCount: edits.length, changedEntries, summaries }
}

function resolveWorksheetParts(workbookXml: string, relationshipsXml: string) {
  const workbook = parser.parse(workbookXml) as XmlRecord
  const relationships = parser.parse(relationshipsXml) as XmlRecord
  const sheets = asArray(readPath(workbook, ['workbook', 'sheets', 'sheet']))
  const rels = asArray(readPath(relationships, ['Relationships', 'Relationship']))
  const targets = new Map<string, string>()
  for (const relationship of rels) {
    if (!isRecord(relationship)) continue
    const id = stringAttribute(relationship, '@_Id')
    const target = stringAttribute(relationship, '@_Target')
    if (id && target) targets.set(id, normalizeWorksheetPart(target))
  }
  const result = new Map<string, string>()
  for (const sheet of sheets) {
    if (!isRecord(sheet)) continue
    const name = stringAttribute(sheet, '@_name')
    const relationshipId = stringAttribute(sheet, '@_id') ?? stringAttribute(sheet, '@_r:id')
    const part = relationshipId ? targets.get(relationshipId) : undefined
    if (name && part) result.set(name, part)
  }
  return result
}

function patchWorksheetCell(xml: string, patch: OfficeExcelCellPatch) {
  const escapedAddress = escapeRegExp(patch.address)
  const cellTag = qualifiedTagPattern('c')
  const cellPattern = new RegExp(
    `<(${cellTag})\\b([^>]*\\br=["']${escapedAddress}["'][^>]*)\\/>|<(${cellTag})\\b([^>]*\\br=["']${escapedAddress}["'][^>]*)>([\\s\\S]*?)<\\/\\3>`,
    'i'
  )
  const match = cellPattern.exec(xml)
  if (!match) {
    throw new ConflictException(`Target cell ${patch.sheetName}!${patch.address} does not exist in the source OOXML.`)
  }
  const tagName = match[1] ?? match[3] ?? 'c'
  const namespacePrefix = tagName.slice(0, -1)
  const attributes = match[2] ?? match[4] ?? ''
  const inner = match[5] ?? ''
  if (patch.expectedCellState.kind === 'empty' && !isCellEmpty(inner)) {
    throw new ConflictException(`Target cell ${patch.sheetName}!${patch.address} is not empty.`)
  }

  const cleanAttributes = attributes.replace(/\s+t\s*=\s*(["'])[^"']*\1/gi, '')
  const preserved = stripCellPayload(inner)
  const formulaTag = `${namespacePrefix}f`
  const valueTag = `${namespacePrefix}v`
  const content = patch.kind === 'number'
    ? `<${valueTag}>${escapeXmlText(patch.value)}</${valueTag}>`
    : `<${formulaTag}>${escapeXmlText(stripLeadingEquals(patch.value))}</${formulaTag}><${valueTag}>${escapeXmlText(patch.cachedValue)}</${valueTag}>`
  const replacement = `<${tagName}${cleanAttributes}>${preserved}${content}</${tagName}>`
  return `${xml.slice(0, match.index)}${replacement}${xml.slice(match.index + match[0].length)}`
}

function worksheetCellInner(xml: string, sheetName: string, address: string) {
  const escapedAddress = escapeRegExp(address)
  const cellTag = qualifiedTagPattern('c')
  const cellPattern = new RegExp(
    `<(${cellTag})\\b([^>]*\\br=["']${escapedAddress}["'][^>]*)\\/>|<(${cellTag})\\b([^>]*\\br=["']${escapedAddress}["'][^>]*)>([\\s\\S]*?)<\\/\\3>`,
    'i'
  )
  const match = cellPattern.exec(xml)
  if (!match) throw new ConflictException(`Target cell ${sheetName}!${address} does not exist in the source OOXML.`)
  return match[5] ?? ''
}

function editWorksheetCell(xml: string, edit: WorkbookOoxmlEdit) {
  const escapedAddress = escapeRegExp(edit.address)
  const cellTag = qualifiedTagPattern('c')
  const cellPattern = new RegExp(
    `<(${cellTag})\\b([^>]*\\br=["']${escapedAddress}["'][^>]*)\\/>|<(${cellTag})\\b([^>]*\\br=["']${escapedAddress}["'][^>]*)>([\\s\\S]*?)<\\/\\3>`,
    'i'
  )
  const match = cellPattern.exec(xml)
  if (!match) {
    throw new ConflictException(`Target cell ${edit.sheetName}!${edit.address} does not exist in the source OOXML.`)
  }
  const tagName = match[1] ?? match[3] ?? 'c'
  const namespacePrefix = tagName.slice(0, -1)
  const attributes = (match[2] ?? match[4] ?? '').replace(/\s+t\s*=\s*(["'])[^"']*\1/gi, '')
  const preserved = stripCellPayload(match[5] ?? '')
  const payload = workbookEditPayload(edit, namespacePrefix)
  const typeAttribute = edit.kind === 'string' ? ' t="inlineStr"' : edit.kind === 'boolean' ? ' t="b"' : ''
  const replacement = `<${tagName}${attributes}${typeAttribute}>${payload}${preserved}</${tagName}>`
  return `${xml.slice(0, match.index)}${replacement}${xml.slice(match.index + match[0].length)}`
}

function workbookEditPayload(edit: WorkbookOoxmlEdit, namespacePrefix: string) {
  const formulaTag = `${namespacePrefix}f`
  const valueTag = `${namespacePrefix}v`
  const inlineStringTag = `${namespacePrefix}is`
  const textTag = `${namespacePrefix}t`
  switch (edit.kind) {
    case 'number': return `<${valueTag}>${String(edit.value)}</${valueTag}>`
    case 'boolean': return `<${valueTag}>${edit.value ? '1' : '0'}</${valueTag}>`
    case 'string': return `<${inlineStringTag}><${textTag} xml:space="preserve">${escapeXmlText(edit.value)}</${textTag}></${inlineStringTag}>`
    case 'formula': return `<${formulaTag}>${escapeXmlText(stripLeadingEquals(edit.value))}</${formulaTag}>`
    case 'clear': return ''
  }
}

function validateWorkbookEdit(edit: WorkbookOoxmlEdit) {
  if (edit.kind === 'number') {
    if (!Number.isFinite(edit.value)) throw new BadRequestException(`${edit.sheetName}!${edit.address} must contain a finite number.`)
    return
  }
  if (edit.kind === 'string') {
    if (edit.value.length > 32_767 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(edit.value)) {
      throw new BadRequestException(`${edit.sheetName}!${edit.address} contains invalid XLSX text.`)
    }
    return
  }
  if (edit.kind === 'formula') validateWorkbookFormula(edit.value, `${edit.sheetName}!${edit.address} formula`)
}

function validateWorkbookFormula(value: string, label: string) {
  const formula = stripLeadingEquals(value).trim()
  if (!formula || formula.length > 8_192 || /[\[\]\u0000-\u001F]/.test(formula) || /(?:https?|file|ftp):\/\//i.test(formula)) {
    throw new BadRequestException(`${label} contains an unsupported external reference or invalid expression.`)
  }
}

function isCellEmpty(inner: string) {
  if (new RegExp(`<${qualifiedTagPattern('f')}\\b`, 'i').test(inner) || new RegExp(`<${qualifiedTagPattern('is')}\\b`, 'i').test(inner)) return false
  const valueTag = qualifiedTagPattern('v')
  const value = new RegExp(`<${valueTag}\\b[^>]*>([\\s\\S]*?)<\\/${valueTag}>`, 'i').exec(inner)?.[1]
  return value === undefined || value.trim() === ''
}

function stripCellPayload(inner: string) {
  return ['f', 'v', 'is'].reduce((result, localName) => {
    const tag = qualifiedTagPattern(localName)
    return result.replace(new RegExp(`<${tag}\\b[^>]*\\/\\s*>|<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '')
  }, inner)
}

function qualifiedTagPattern(localName: string) {
  return `(?:[A-Za-z_][A-Za-z0-9_.-]*:)?${localName}`
}

function validateFormula(value: string, label: string) {
  const formula = stripLeadingEquals(value).trim()
  if (!formula || formula.length > 512 || /[\[\]{};'"!]/.test(formula)) {
    throw new BadRequestException(`${label} is not an allowed generated formula.`)
  }
  if (!/^(?:ROUND\([A-Z]{1,3}[1-9][0-9]{0,6}\*[A-Z]{1,3}[1-9][0-9]{0,6},2\)|SUM\([A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?(?:,[A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?)*\))$/.test(formula)) {
    throw new BadRequestException(`${label} is outside the quotation formula allowlist.`)
  }
}

function requireFiniteDecimal(value: string, label: string) {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || !Number.isFinite(Number(value))) {
    throw new BadRequestException(`${label} must be a finite decimal string.`)
  }
}

async function requireZipText(zip: JSZip, path: string) {
  const entry = zip.file(path)
  if (!entry) throw new BadRequestException(`XLSX is missing required OOXML entry ${path}.`)
  return entry.async('string')
}

function normalizeWorksheetPart(target: string) {
  const normalized = target.replace(/\\/g, '/').replace(/^\//, '')
  if (normalized.startsWith('xl/')) return normalized
  return `xl/${normalized.replace(/^\.\//, '')}`
}

function stripLeadingEquals(value: string) {
  return value.startsWith('=') ? value.slice(1) : value
}

function escapeXmlText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function asArray(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function isRecord(value: unknown): value is XmlRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringAttribute(value: XmlRecord, key: string) {
  return typeof value[key] === 'string' ? value[key] : undefined
}
