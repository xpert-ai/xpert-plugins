import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { posix as pathPosix } from 'node:path'
import type {
  OfficeDocumentType,
  OfficeImportConversionResult,
  OfficeImportFormat
} from './types.js'

const requireFromHere = createRequire(import.meta.url)

export const OFFICE_IMPORT_MAX_BYTES = 25 * 1024 * 1024
export const OFFICE_IMPORT_MAX_ZIP_ENTRIES = 2000
export const OFFICE_IMPORT_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024

type ConversionInput = {
  importFormat: OfficeImportFormat
  documentType: OfficeDocumentType
  title: string
  fileName: string
  mimeType?: string | null
  buffer: Buffer
}

type ZipLike = {
  files: Record<string, any>
  file(path: string): any
}

type PptxSlideSize = {
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
}

export async function convertOfficeImport(input: ConversionInput): Promise<OfficeImportConversionResult> {
  if (input.importFormat === 'xlsx') {
    return convertXlsx(input)
  }
  if (input.importFormat === 'docx') {
    return convertDocx(input)
  }
  if (input.importFormat === 'pptx') {
    return convertPptx(input)
  }
  throw new Error(`Unsupported importFormat: ${String(input.importFormat)}`)
}

async function convertXlsx(input: ConversionInput): Promise<OfficeImportConversionResult> {
  await loadZipWithLimits(input.buffer, 'XLSX')
  const XLSX = requireFromHere('xlsx') as any
  const workbook = XLSX.read(input.buffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: true,
    cellNF: true
  })
  const unitId = randomUUID()
  const sheetOrder: string[] = []
  const sheets: Record<string, any> = {}
  const warnings = [
    'XLSX import is best-effort: charts, images, pivot tables, macros, data validation, and complex styles are not preserved.'
  ]

  const sheetNames = Array.isArray(workbook.SheetNames) && workbook.SheetNames.length
    ? workbook.SheetNames
    : ['Sheet1']
  sheetNames.forEach((sheetName: string, index: number) => {
    const sheetId = randomUUID()
    const worksheet = workbook.Sheets?.[sheetName] ?? {}
    const ref = typeof worksheet['!ref'] === 'string' ? worksheet['!ref'] : 'A1:A1'
    const range = XLSX.utils.decode_range(ref)
    const rowCount = Math.max(range.e.r + 1, 100)
    const columnCount = Math.max(range.e.c + 1, 26)
    const cellData: Record<number, Record<number, unknown>> = {}

    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column })
        const sourceCell = worksheet[address]
        const cell = convertXlsxCell(sourceCell)
        if (!cell) {
          continue
        }
        cellData[row] ??= {}
        cellData[row][column] = cell
      }
    }

    const mergeData = Array.isArray(worksheet['!merges'])
      ? worksheet['!merges'].map((merge: any) => ({
          startRow: merge.s.r,
          endRow: merge.e.r,
          startColumn: merge.s.c,
          endColumn: merge.e.c
        }))
      : []
    const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ? 1 : 0

    sheetOrder.push(sheetId)
    sheets[sheetId] = {
      id: sheetId,
      name: sheetName || `Sheet${index + 1}`,
      tabColor: '',
      hidden,
      freeze: {},
      rowCount,
      columnCount,
      zoomRatio: 1,
      scrollTop: 0,
      scrollLeft: 0,
      defaultColumnWidth: 88,
      defaultRowHeight: 24,
      mergeData,
      cellData,
      rowData: {},
      columnData: {},
      rowHeader: {
        width: 46
      },
      columnHeader: {
        height: 20
      },
      showGridlines: 1,
      rightToLeft: 0
    }
  })

  const snapshot = {
    id: unitId,
    name: input.title,
    sheetOrder,
    sheets,
    styles: {},
    resources: []
  }

  return {
    documentType: 'spreadsheet',
    importFormat: 'xlsx',
    snapshot,
    snapshotText: summarizeSpreadsheet(snapshot),
    warnings,
    fidelity: 'best_effort'
  }
}

async function convertDocx(input: ConversionInput): Promise<OfficeImportConversionResult> {
  const zip = await loadZipWithLimits(input.buffer, 'DOCX')
  const parser = createOrderedXmlParser()
  const extracted = await extractDocxContent(zip, parser)
  const warnings = [
    'DOCX import is best-effort: paragraphs and table text are preserved as editable text, while comments, tracked changes, precise layout, and images are not fully preserved.'
  ]
  warnings.push(...extracted.warnings)
  if (hasZipEntryPrefix(zip, 'word/media/')) {
    warnings.push('Images were detected in the DOCX file and were not imported into the Univer document snapshot.')
  }

  let snapshotText = normalizeImportedText(extracted.text)
  if (!snapshotText) {
    const mammothResult = await extractDocxRawText(input.buffer)
    snapshotText = normalizeImportedText(mammothResult.value)
    for (const message of mammothResult.messages ?? []) {
      const text = typeof message?.message === 'string' ? message.message : ''
      if (text) {
        warnings.push(text)
      }
    }
  }

  const snapshot = createDocumentSnapshot(input.title, snapshotText)
  return {
    documentType: 'document',
    importFormat: 'docx',
    snapshot,
    snapshotText,
    warnings: dedupeWarnings(warnings),
    fidelity: 'best_effort'
  }
}

async function convertPptx(input: ConversionInput): Promise<OfficeImportConversionResult> {
  const zip = await loadZipWithLimits(input.buffer, 'PPTX')
  const parser = createXmlParser()
  const slidePaths = await readPptxSlidePaths(zip, parser)
  const slideSize = await readPptxSlideSize(zip, parser)
  const pages: Record<string, any> = {}
  const pageOrder: string[] = []
  const textLines: string[] = []
  const warnings = [
    'PPTX import is experimental and best-effort: themes, masters, transitions, animations, speaker notes, and complex shapes are not preserved.'
  ]

  for (let index = 0; index < slidePaths.length; index += 1) {
    const slidePath = slidePaths[index]
    const slideXml = await readZipText(zip, slidePath)
    if (!slideXml) {
      continue
    }
    const parsedSlide = parser.parse(slideXml)
    const textShapes = collectPptxTextShapes(parsedSlide, slideSize)
    const fallbackTexts = textShapes.length ? [] : collectXmlText(parsedSlide).map((value) => value.trim()).filter(Boolean)
    const title = textShapes[0]?.text.split('\n').find(Boolean) || fallbackTexts[0] || `Slide ${index + 1}`
    const imageElements = await collectPptxImageElements(zip, slidePath, parser, parsedSlide, slideSize)
    if (imageElements.length) {
      warnings.push(`Slide ${index + 1} contains images that were imported with approximate placement.`)
    }

    const pageId = randomUUID()
    const pageElements: Record<string, any> = {}
    const readableTexts = textShapes.length ? textShapes.map((shape) => shape.text) : fallbackTexts
    if (textShapes.length) {
      textShapes.forEach((shape, shapeIndex) => {
        addSlideTextElement(pageElements, shape.text, {
          ...shape.layout,
          fontSize: shape.fontSize,
          zIndex: 22 + shapeIndex
        })
      })
    } else {
      addSlideTextElement(pageElements, title, {
        top: 54,
        left: 72,
        width: 816,
        height: 80,
        fontSize: 34,
        zIndex: 22
      })
      const body = fallbackTexts.slice(1).join('\n')
      if (body) {
        addSlideTextElement(pageElements, body, {
          top: 150,
          left: 88,
          width: imageElements.length ? 470 : 784,
          height: 310,
          fontSize: 20,
          zIndex: 23
        })
      }
    }
    imageElements.slice(0, 12).forEach((image, imageIndex) => {
      addSlideImageElement(pageElements, image.contentUrl, {
        ...image.layout,
        zIndex: 40 + imageIndex,
        title: `Image ${imageIndex + 1}`
      })
    })

    pageOrder.push(pageId)
    pages[pageId] = {
      id: pageId,
      pageType: 0,
      zIndex: index,
      title,
      description: '',
      pageBackgroundFill: {
        rgb: 'rgb(255,255,255)'
      },
      pageElements
    }
    textLines.push(`Slide ${index + 1}: ${readableTexts.join('\n')}`)
  }

  if (!pageOrder.length) {
    const pageId = randomUUID()
    pageOrder.push(pageId)
    pages[pageId] = {
      id: pageId,
      pageType: 0,
      zIndex: 0,
      title: input.title,
      description: '',
      pageBackgroundFill: {
        rgb: 'rgb(255,255,255)'
      },
      pageElements: {}
    }
    warnings.push('No readable slides were found; an empty presentation was created.')
  }

  return {
    documentType: 'presentation',
    importFormat: 'pptx',
    snapshot: {
      id: randomUUID(),
      title: input.title,
      pageSize: {
        width: slideSize.width,
        height: slideSize.height
      },
      body: {
        pageOrder,
        pages
      }
    },
    snapshotText: textLines.join('\n\n').slice(0, 10000),
    warnings: dedupeWarnings(warnings),
    fidelity: 'best_effort'
  }
}

function convertXlsxCell(sourceCell: any) {
  if (!sourceCell) {
    return null
  }
  const cell: Record<string, unknown> = {}
  const value = normalizeXlsxCellValue(sourceCell)
  if (value !== undefined) {
    cell.v = value
  }
  if (typeof sourceCell.f === 'string' && sourceCell.f.trim()) {
    cell.f = sourceCell.f.trim().startsWith('=') ? sourceCell.f.trim() : `=${sourceCell.f.trim()}`
  }
  if (typeof sourceCell.z === 'string' && sourceCell.z.trim() && sourceCell.z !== 'General') {
    cell.s = {
      n: {
        pattern: sourceCell.z
      }
    }
  }
  return Object.keys(cell).length ? cell : null
}

function normalizeXlsxCellValue(sourceCell: any) {
  if (sourceCell.v instanceof Date) {
    return sourceCell.v.toISOString().slice(0, 10)
  }
  if (['string', 'number', 'boolean'].includes(typeof sourceCell.v)) {
    return sourceCell.v
  }
  if (typeof sourceCell.w === 'string') {
    return sourceCell.w
  }
  return undefined
}

async function extractDocxRawText(buffer: Buffer) {
  const mammoth = requireFromHere('mammoth') as any
  return mammoth.extractRawText({ buffer }) as Promise<{
    value: string
    messages?: Array<{ message?: string }>
  }>
}

async function extractDocxContent(zip: ZipLike, parser: any) {
  const warnings: string[] = []
  const document = await extractDocxPart(zip, parser, 'word/document.xml')
  if (!document.lines.length) {
    warnings.push('No readable text was found in word/document.xml; Mammoth fallback will be attempted.')
  }
  if (document.tableCount) {
    warnings.push('DOCX tables were converted to editable tab-delimited text.')
  }

  const headerParts = await extractDocxPartsByPattern(zip, parser, /^word\/header\d+\.xml$/i)
  const footerParts = await extractDocxPartsByPattern(zip, parser, /^word\/footer\d+\.xml$/i)
  const headerLines = headerParts.flatMap((part) => part.lines)
  const footerLines = footerParts.flatMap((part) => part.lines)
  if (headerLines.length || footerLines.length) {
    warnings.push('Headers and footers were imported as plain editable text.')
  }

  return {
    text: [
      headerLines.join('\n'),
      document.lines.join('\n'),
      footerLines.join('\n')
    ].filter(Boolean).join('\n\n'),
    warnings
  }
}

async function extractDocxPartsByPattern(zip: ZipLike, parser: any, pattern: RegExp) {
  const parts = await Promise.all(
    Object.keys(zip.files)
      .filter((path) => pattern.test(path))
      .sort()
      .map((path) => extractDocxPart(zip, parser, path))
  )
  return parts.filter((part) => part.lines.length)
}

async function extractDocxPart(zip: ZipLike, parser: any, path: string) {
  const xml = await readZipText(zip, path)
  if (!xml) {
    return { lines: [] as string[], tableCount: 0 }
  }
  const parsed = parser.parse(xml)
  const root = firstOrderedChild(parsed, 'document')
    ?? firstOrderedChild(parsed, 'hdr')
    ?? firstOrderedChild(parsed, 'ftr')
    ?? parsed
  const body = firstOrderedChild(root, 'body') ?? root
  const result = extractDocxBlockLines(body)
  return {
    lines: collapseBlankLines(result.lines),
    tableCount: result.tableCount
  }
}

function extractDocxBlockLines(nodes: unknown): { lines: string[]; tableCount: number } {
  const lines: string[] = []
  let tableCount = 0
  for (const entry of toOrderedEntries(nodes)) {
    if (entry.p) {
      const paragraph = normalizeDocxLine(extractDocxParagraphText(entry.p))
      if (paragraph || lines.at(-1)) {
        lines.push(paragraph)
      }
    } else if (entry.tbl) {
      tableCount += 1
      const tableLines = extractDocxTableLines(entry.tbl)
      if (tableLines.length) {
        if (lines.at(-1)) {
          lines.push('')
        }
        lines.push(...tableLines)
        lines.push('')
      }
    } else if (entry.sdt) {
      const nested = extractDocxBlockLines(entry.sdt)
      lines.push(...nested.lines)
      tableCount += nested.tableCount
    }
  }
  return { lines, tableCount }
}

function extractDocxTableLines(nodes: unknown) {
  const rows: string[] = []
  for (const row of orderedChildren(nodes, 'tr')) {
    const cells = orderedChildren(row, 'tc').map((cell) => {
      const nested = extractDocxBlockLines(cell)
      return nested.lines.filter(Boolean).join(' / ')
    })
    const line = cells.map((cell) => cell.trim()).join('\t').trimEnd()
    if (line.trim()) {
      rows.push(line)
    }
  }
  return rows
}

function extractDocxParagraphText(nodes: unknown) {
  const text = collectDocxInlineText(nodes)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
  const prefix = hasOrderedDescendant(nodes, 'numPr') && text.trim() ? '- ' : ''
  return `${prefix}${text}`
}

function collectDocxInlineText(nodes: unknown): string {
  let output = ''
  for (const entry of toOrderedEntries(nodes)) {
    if ('#text' in entry) {
      output += String(entry['#text'] ?? '')
    } else if (entry.t) {
      output += collectDocxInlineText(entry.t)
    } else if (entry.tab) {
      output += '\t'
    } else if (entry.br || entry.cr) {
      output += '\n'
    } else if (entry.pict || entry.drawing) {
      continue
    } else {
      for (const [key, value] of Object.entries(entry)) {
        if (key === ':@' || key === 'delText') {
          continue
        }
        output += collectDocxInlineText(value)
      }
    }
  }
  return output
}

function normalizeDocxLine(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

function collapseBlankLines(lines: string[]) {
  const output: string[] = []
  for (const line of lines) {
    if (!line && !output.at(-1)) {
      continue
    }
    output.push(line)
  }
  while (output.at(-1) === '') {
    output.pop()
  }
  return output
}

function createDocumentSnapshot(title: string, text: string) {
  const normalizedText = normalizeImportedText(text)
  const bodyText = normalizedText.replace(/\n/g, '\r')
  const dataStream = bodyText ? `${bodyText}\r\n` : '\r\n'
  const paragraphs = createParagraphs(dataStream)
  return {
    id: randomUUID(),
    title,
    body: {
      dataStream,
      textRuns: bodyText ? [{ st: 0, ed: Math.max(0, bodyText.length - 1) }] : [],
      paragraphs
    },
    documentStyle: {
      pageSize: {
        width: 595,
        height: 842
      },
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72
    }
  }
}

function createParagraphs(dataStream: string) {
  const paragraphs: Array<{ startIndex: number }> = []
  for (let index = 0; index < dataStream.length; index += 1) {
    if (dataStream[index] === '\r') {
      paragraphs.push({ startIndex: index })
    }
  }
  return paragraphs
}

function normalizeImportedText(value: unknown) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

async function loadZipWithLimits(buffer: Buffer, label: string): Promise<ZipLike> {
  const JSZip = requireFromHere('jszip') as any
  const zip = await JSZip.loadAsync(buffer)
  const files = Object.values(zip.files ?? {}) as any[]
  if (files.length > OFFICE_IMPORT_MAX_ZIP_ENTRIES) {
    throw new Error(`${label} file has too many OOXML entries.`)
  }
  const uncompressedSize = files.reduce((sum, file) => sum + Number(file?._data?.uncompressedSize ?? 0), 0)
  if (uncompressedSize > OFFICE_IMPORT_MAX_UNCOMPRESSED_BYTES) {
    throw new Error(`${label} file is too large after decompression.`)
  }
  return zip
}

async function readPptxSlidePaths(zip: ZipLike, parser: any) {
  const presentation = parser.parse((await readZipText(zip, 'ppt/presentation.xml')) || '')
  const relationships = parser.parse((await readZipText(zip, 'ppt/_rels/presentation.xml.rels')) || '')
  const relationshipMap = new Map<string, string>()
  for (const relationship of toArray(getXmlChild(getXmlChild(relationships, 'Relationships'), 'Relationship'))) {
    const id = getXmlAttr(relationship, 'Id')
    const target = getXmlAttr(relationship, 'Target')
    if (id && target) {
      relationshipMap.set(id, resolvePptxTarget('ppt/presentation.xml', target))
    }
  }
  const slideIds = toArray(getXmlChild(getXmlChild(getXmlChild(presentation, 'presentation'), 'sldIdLst'), 'sldId'))
  const ordered = slideIds
    .map((slide: any) => relationshipMap.get(getXmlAttr(slide, 'id') ?? getXmlAttr(slide, 'r:id') ?? ''))
    .filter((path: string | undefined): path is string => Boolean(path && zip.files[path]))
  if (ordered.length) {
    return ordered
  }
  return Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((left, right) => extractNumber(left) - extractNumber(right))
}

async function readPptxSlideSize(zip: ZipLike, parser: any): Promise<PptxSlideSize> {
  const presentation = parser.parse((await readZipText(zip, 'ppt/presentation.xml')) || '')
  const sldSz = getXmlChild(getXmlChild(presentation, 'presentation'), 'sldSz')
  const sourceWidth = Number(getXmlAttr(sldSz, 'cx')) || 12192000
  const sourceHeight = Number(getXmlAttr(sldSz, 'cy')) || 6858000
  const aspectRatio = sourceWidth / sourceHeight
  const width = 960
  return {
    sourceWidth,
    sourceHeight,
    width,
    height: Math.round(width / (Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9))
  }
}

function collectPptxTextShapes(parsedSlide: any, slideSize: PptxSlideSize) {
  const spTree = getPptxShapeTree(parsedSlide)
  const shapes = collectPptxNodes(spTree, 'sp')
  return shapes
    .map((shape, index) => {
      const text = extractPptxText(shape)
      if (!text) {
        return null
      }
      const layout = pptxTransformToLayout(getPptxTransform(shape), slideSize, {
        left: 72,
        top: 64 + index * 96,
        width: 816,
        height: index === 0 ? 72 : 82
      })
      return {
        text,
        layout,
        fontSize: estimatePptxFontSize(shape, index)
      }
    })
    .filter((shape): shape is { text: string; layout: { left: number; top: number; width: number; height: number }; fontSize: number } => Boolean(shape))
}

async function collectPptxImageElements(zip: ZipLike, slidePath: string, parser: any, parsedSlide: any, slideSize: PptxSlideSize) {
  const relationships = await readPptxRelationshipMap(zip, slidePath, parser)
  const pictures = collectPptxNodes(getPptxShapeTree(parsedSlide), 'pic')
  const images: Array<{ contentUrl: string; layout: { left: number; top: number; width: number; height: number } }> = []
  for (const [index, picture] of pictures.entries()) {
    const blip = findXmlDescendant(picture, 'blip')
    const relationshipId = getXmlAttr(blip, 'embed') ?? getXmlAttr(blip, 'link')
    const mediaPath = relationshipId ? relationships.get(relationshipId) : undefined
    const file = mediaPath ? zip.file(mediaPath) : null
    if (!file || !mediaPath) {
      continue
    }
    const buffer = await file.async('nodebuffer')
    images.push({
      contentUrl: `data:${mimeTypeForPath(mediaPath)};base64,${buffer.toString('base64')}`,
      layout: pptxTransformToLayout(getPptxTransform(picture), slideSize, {
        left: 140 + index * 42,
        top: 150 + index * 28,
        width: 680,
        height: 280
      })
    })
  }
  return images
}

async function readPptxRelationshipMap(zip: ZipLike, slidePath: string, parser: any) {
  const relationshipsPath = slidePath.replace('/slides/', '/slides/_rels/') + '.rels'
  const relationshipsXml = await readZipText(zip, relationshipsPath)
  const map = new Map<string, string>()
  if (!relationshipsXml) {
    return map
  }
  const relationships = parser.parse(relationshipsXml)
  for (const relationship of toArray(getXmlChild(getXmlChild(relationships, 'Relationships'), 'Relationship'))) {
    const id = getXmlAttr(relationship, 'Id')
    const target = getXmlAttr(relationship, 'Target')
    if (id && target) {
      map.set(id, resolvePptxTarget(slidePath, target))
    }
  }
  return map
}

function getPptxShapeTree(parsedSlide: any) {
  return getXmlChild(getXmlChild(getXmlChild(parsedSlide, 'sld'), 'cSld'), 'spTree')
}

function collectPptxNodes(node: unknown, key: string, output: any[] = []) {
  if (!node || typeof node !== 'object') {
    return output
  }
  const direct = getXmlChild(node, key)
  if (direct !== undefined) {
    output.push(...toArray(direct))
  }
  const groups = toArray(getXmlChild(node, 'grpSp'))
  for (const group of groups) {
    collectPptxNodes(group, key, output)
  }
  return output
}

function extractPptxText(shape: any) {
  const txBody = getXmlChild(shape, 'txBody')
  const paragraphs = toArray(getXmlChild(txBody, 'p'))
    .map((paragraph) => extractPptxParagraphText(paragraph))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
  return paragraphs.join('\n').trim()
}

function extractPptxParagraphText(paragraph: any) {
  const runs = toArray(getXmlChild(paragraph, 'r'))
  const fields = toArray(getXmlChild(paragraph, 'fld'))
  const texts = [...runs, ...fields]
    .map((run) => String(getXmlChild(run, 't') ?? collectXmlText(run).join('')))
    .filter(Boolean)
  const fallback = texts.length ? texts : collectXmlText(paragraph)
  return fallback.join('')
}

function estimatePptxFontSize(shape: any, index: number) {
  const values = collectPptxFontSizes(shape)
  if (values.length) {
    return Math.min(44, Math.max(10, Math.round(values[0] / 100)))
  }
  return index === 0 ? 30 : 18
}

function collectPptxFontSizes(node: unknown, output: number[] = []) {
  if (!node || typeof node !== 'object') {
    return output
  }
  const rPr = getXmlChild(node, 'rPr')
  for (const item of toArray(rPr)) {
    const size = Number(getXmlAttr(item, 'sz'))
    if (Number.isFinite(size) && size > 0) {
      output.push(size)
    }
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectPptxFontSizes(value, output)
  }
  return output
}

function getPptxTransform(node: any) {
  const properties = getXmlChild(node, 'spPr') ?? getXmlChild(node, 'picPr')
  const transform = getXmlChild(properties, 'xfrm')
  const off = getXmlChild(transform, 'off')
  const ext = getXmlChild(transform, 'ext')
  const x = Number(getXmlAttr(off, 'x'))
  const y = Number(getXmlAttr(off, 'y'))
  const cx = Number(getXmlAttr(ext, 'cx'))
  const cy = Number(getXmlAttr(ext, 'cy'))
  if (![x, y, cx, cy].every((value) => Number.isFinite(value) && value >= 0) || cx === 0 || cy === 0) {
    return null
  }
  return { x, y, cx, cy }
}

function pptxTransformToLayout(
  transform: { x: number; y: number; cx: number; cy: number } | null,
  slideSize: PptxSlideSize,
  fallback: { left: number; top: number; width: number; height: number }
) {
  if (!transform) {
    return fallback
  }
  return {
    left: clampNumber((transform.x / slideSize.sourceWidth) * slideSize.width, 0, slideSize.width),
    top: clampNumber((transform.y / slideSize.sourceHeight) * slideSize.height, 0, slideSize.height),
    width: clampNumber((transform.cx / slideSize.sourceWidth) * slideSize.width, 12, slideSize.width),
    height: clampNumber((transform.cy / slideSize.sourceHeight) * slideSize.height, 12, slideSize.height)
  }
}

function addSlideTextElement(pageElements: Record<string, any>, text: string, layout: {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  zIndex: number
}) {
  const elementId = randomUUID()
  pageElements[elementId] = {
    id: elementId,
    zIndex: layout.zIndex,
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    title: '',
    description: '',
    type: 2,
    richText: {
      text,
      fs: layout.fontSize,
      cl: {
        rgb: 'rgb(17,24,39)'
      }
    }
  }
}

function addSlideImageElement(pageElements: Record<string, any>, contentUrl: string, layout: {
  left: number
  top: number
  width: number
  height: number
  zIndex: number
  title: string
}) {
  const elementId = randomUUID()
  pageElements[elementId] = {
    id: elementId,
    zIndex: layout.zIndex,
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    title: layout.title,
    description: '',
    type: 1,
    image: {
      imageProperties: {
        contentUrl
      }
    }
  }
}

function findXmlDescendant(node: unknown, key: string): any {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  const direct = getXmlChild(node, key)
  if (direct !== undefined) {
    return Array.isArray(direct) ? direct[0] : direct
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findXmlDescendant(value, key)
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}


function createXmlParser() {
  const { XMLParser } = requireFromHere('fast-xml-parser') as any
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    trimValues: false
  })
}

function createOrderedXmlParser() {
  const { XMLParser } = requireFromHere('fast-xml-parser') as any
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    trimValues: false,
    preserveOrder: true
  })
}

async function readZipText(zip: ZipLike, path: string) {
  const file = zip.file(path)
  return file ? file.async('string') as Promise<string> : ''
}

function hasZipEntryPrefix(zip: ZipLike, prefix: string) {
  return Object.keys(zip.files).some((path) => path.startsWith(prefix))
}

function getXmlChild(node: any, key: string) {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  return node[key] ?? node[`p:${key}`] ?? node[`a:${key}`] ?? node[`r:${key}`]
}

function getXmlAttr(node: any, key: string) {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  return node[`@_${key}`] ?? node[`@_r:${key}`] ?? node[key]
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value
  }
  return value === undefined || value === null ? [] : [value]
}

function toOrderedEntries(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => toOrderedEntries(item))
  }
  return value && typeof value === 'object' ? [value as Record<string, any>] : []
}

function orderedChildren(node: unknown, key: string) {
  const children: any[] = []
  for (const entry of toOrderedEntries(node)) {
    const value = entry[key]
    if (value !== undefined) {
      children.push(value)
    }
  }
  return children
}

function firstOrderedChild(node: unknown, key: string) {
  return orderedChildren(node, key)[0]
}

function hasOrderedDescendant(node: unknown, key: string): boolean {
  for (const entry of toOrderedEntries(node)) {
    if (entry[key] !== undefined) {
      return true
    }
    for (const [entryKey, value] of Object.entries(entry)) {
      if (entryKey !== ':@' && hasOrderedDescendant(value, key)) {
        return true
      }
    }
  }
  return false
}

function collectXmlText(node: unknown, output: string[] = []) {
  if (node === null || node === undefined) {
    return output
  }
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return output
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectXmlText(item, output)
    }
    return output
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 't' || key.endsWith(':t')) {
        if (Array.isArray(value)) {
          output.push(...value.map((item) => String(item ?? '')))
        } else {
          output.push(String(value ?? ''))
        }
      } else {
        collectXmlText(value, output)
      }
    }
  }
  return output
}

function resolvePptxTarget(basePath: string, target: string) {
  if (target.startsWith('/')) {
    return target.replace(/^\/+/, '')
  }
  return pathPosix.normalize(pathPosix.join(pathPosix.dirname(basePath), target))
}

function mimeTypeForPath(path: string) {
  const ext = path.toLowerCase().split('.').pop()
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg'
  }
  if (ext === 'gif') {
    return 'image/gif'
  }
  if (ext === 'webp') {
    return 'image/webp'
  }
  if (ext === 'svg') {
    return 'image/svg+xml'
  }
  return 'image/png'
}

function extractNumber(value: string) {
  return Number(/\d+/.exec(value)?.[0] ?? 0)
}

function summarizeSpreadsheet(snapshot: any) {
  const lines: string[] = []
  for (const sheet of Object.values(snapshot.sheets ?? {}) as any[]) {
    lines.push(`# ${sheet.name}`)
    for (const [rowIndex, row] of Object.entries(sheet.cellData ?? {}) as Array<[string, Record<string, any>]>) {
      for (const [columnIndex, cell] of Object.entries(row)) {
        const value = cell?.v ?? cell?.f
        if (value !== undefined && value !== null && value !== '') {
          lines.push(`R${Number(rowIndex) + 1}C${Number(columnIndex) + 1}: ${String(value)}`)
        }
      }
    }
  }
  return lines.join('\n').slice(0, 10000)
}

function dedupeWarnings(warnings: string[]) {
  return Array.from(new Set(warnings.map((warning) => warning.trim()).filter(Boolean)))
}
