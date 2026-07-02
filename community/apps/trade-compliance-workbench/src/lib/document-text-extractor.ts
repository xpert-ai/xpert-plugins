// @ts-nocheck
import { PDFParse } from 'pdf-parse'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export async function extractDocumentText(input) {
  const buffer = normalizeBuffer(input.buffer)
  if (!buffer?.length) return { text: '', kind: 'empty', truncated: false, originalLength: 0 }

  const fileName = String(input.fileName ?? '').toLowerCase()
  const mimeType = String(input.mimeType ?? '').toLowerCase()

  let text = ''
  let kind = 'text'
  if (isSpreadsheet(fileName, mimeType)) {
    kind = 'spreadsheet'
    text = extractWorkbookMarkdown(buffer)
  } else if (isWord(fileName, mimeType)) {
    kind = 'word'
    text = await extractWordText(buffer)
  } else if (isPdf(fileName, mimeType)) {
    kind = 'pdf'
    text = await extractPdfText(buffer)
  } else {
    text = buffer.toString('utf8')
  }

  const normalized = normalizeText(text)
  const maxChars = Number(input.maxChars ?? 120000)
  const chunks = chunkText(normalized, maxChars)
  return {
    text: chunks[0] ?? '',
    chunks,
    kind,
    truncated: false,
    chunked: chunks.length > 1,
    chunkCount: chunks.length,
    originalLength: normalized.length
  }
}

function normalizeBuffer(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return undefined
}

function isSpreadsheet(fileName, mimeType) {
  return mimeType.includes('spreadsheet') || mimeType.includes('excel') || fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv')
}

function isWord(fileName, mimeType) {
  return mimeType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')
}

function isPdf(fileName, mimeType) {
  return mimeType.includes('pdf') || fileName.endsWith('.pdf')
}

function extractWorkbookMarkdown(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sections = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    const nonEmptyRows = rows
      .map((row, index) => ({ index: index + 1, cells: row.map((cell) => String(cell ?? '').trim()) }))
      .filter((row) => row.cells.some(Boolean))
    if (nonEmptyRows.length === 0) continue

    const headerRow = nonEmptyRows.find((row) => row.cells.filter(Boolean).length >= 2) ?? nonEmptyRows[0]
    const headers = ['行号', ...headerRow.cells.map((cell, index) => cell || `列${index + 1}`)]
    const tableRows = nonEmptyRows.map((row) => [String(row.index), ...padCells(row.cells, headers.length - 1)])
    sections.push([
      `工作表：${sheetName}`,
      markdownRow(headers),
      markdownRow(headers.map(() => '---')),
      ...tableRows.map(markdownRow)
    ].join('\n'))
  }
  return sections.join('\n\n')
}

async function extractWordText(buffer) {
  const result = await mammoth.extractRawText({ buffer })
  return result.value ?? ''
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text ?? ''
  } finally {
    await parser.destroy()
  }
}

function padCells(cells, length) {
  return Array.from({ length }, (_, index) => cells[index] ?? '')
}

function markdownRow(cells) {
  return `| ${cells.map(escapeMarkdownCell).join(' | ')} |`
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
}

function chunkText(value, maxChars) {
  const text = String(value ?? '')
  const size = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 120000
  if (text.length <= size) return text ? [text] : []

  const chunks = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + size, text.length)
    if (end < text.length) {
      const breakAt = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('\n\n', end))
      if (breakAt > start + Math.floor(size * 0.6)) end = breakAt + 1
    }
    chunks.push(text.slice(start, end).trim())
    start = end
  }
  return chunks.filter(Boolean)
}
