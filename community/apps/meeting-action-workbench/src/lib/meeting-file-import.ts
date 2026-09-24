import { extname, parse } from 'node:path'
import mammoth = require('mammoth')

export const MEETING_FILE_MAX_BYTES = 5 * 1024 * 1024
export const MEETING_SOURCE_MAX_CHARACTERS = 30_000

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.log', '.srt', '.vtt'])
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, '.docx'])

export type MeetingFileImportErrorCode =
  | 'MEETING_FILE_REQUIRED'
  | 'MEETING_FILE_EMPTY'
  | 'MEETING_FILE_TOO_LARGE'
  | 'MEETING_FILE_TYPE_UNSUPPORTED'
  | 'MEETING_FILE_CONTENT_EMPTY'
  | 'MEETING_FILE_CONTENT_TOO_SHORT'
  | 'MEETING_FILE_CONTENT_TOO_LONG'
  | 'MEETING_FILE_READ_FAILED'

export class MeetingFileImportError extends Error {
  constructor(readonly code: MeetingFileImportErrorCode, message: string) {
    super(message)
    this.name = 'MeetingFileImportError'
  }
}

export interface MeetingFileImportInput {
  buffer: Buffer
  fileName?: string
  mimeType?: string
  size?: number
}

export interface MeetingFileImportResult {
  fileName: string
  mimeType: string
  title: string
  sourceText: string
  characterCount: number
}

export async function extractMeetingFile(input: MeetingFileImportInput): Promise<MeetingFileImportResult> {
  const fileName = normalizeFileName(input.fileName)
  const size = input.size ?? input.buffer.length
  if (!input.buffer.length || size <= 0) {
    throw new MeetingFileImportError('MEETING_FILE_EMPTY', 'The meeting file is empty.')
  }
  if (size > MEETING_FILE_MAX_BYTES || input.buffer.length > MEETING_FILE_MAX_BYTES) {
    throw new MeetingFileImportError('MEETING_FILE_TOO_LARGE', 'The meeting file exceeds the 5 MB limit.')
  }

  const extension = extname(fileName).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new MeetingFileImportError(
      'MEETING_FILE_TYPE_UNSUPPORTED',
      'Only TXT, Markdown, CSV, LOG, SRT, VTT, and DOCX meeting files are supported.'
    )
  }

  let sourceText: string
  try {
    sourceText = extension === '.docx'
      ? (await mammoth.extractRawText({ buffer: input.buffer })).value
      : input.buffer.toString('utf8')
  } catch {
    throw new MeetingFileImportError('MEETING_FILE_READ_FAILED', 'The meeting file could not be read.')
  }

  sourceText = normalizeSourceText(sourceText)
  if (!sourceText) {
    throw new MeetingFileImportError('MEETING_FILE_CONTENT_EMPTY', 'No readable meeting text was found in the file.')
  }
  if (sourceText.length < 20) {
    throw new MeetingFileImportError('MEETING_FILE_CONTENT_TOO_SHORT', 'The meeting text must contain at least 20 characters.')
  }
  if (sourceText.length > MEETING_SOURCE_MAX_CHARACTERS) {
    throw new MeetingFileImportError(
      'MEETING_FILE_CONTENT_TOO_LONG',
      `The meeting text contains ${sourceText.length} characters and exceeds the 30,000 character limit.`
    )
  }

  return {
    fileName,
    mimeType: input.mimeType?.trim() || defaultMimeType(extension),
    title: deriveTitle(fileName),
    sourceText,
    characterCount: sourceText.length
  }
}

function normalizeFileName(value?: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new MeetingFileImportError('MEETING_FILE_REQUIRED', 'A meeting file name is required.')
  }
  return normalized.replace(/[\\/]+/g, '_').slice(0, 240)
}

function normalizeSourceText(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function deriveTitle(fileName: string) {
  const baseName = parse(fileName).name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (baseName || 'Meeting record').slice(0, 200)
}

function defaultMimeType(extension: string) {
  if (extension === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (extension === '.md' || extension === '.markdown') return 'text/markdown'
  if (extension === '.csv') return 'text/csv'
  if (extension === '.srt') return 'application/x-subrip'
  if (extension === '.vtt') return 'text/vtt'
  return 'text/plain'
}
