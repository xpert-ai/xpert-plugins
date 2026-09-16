import { z } from 'zod'
import { readFileSync } from 'node:fs'
export const PACKAGE_NAME = '@xpert-ai/plugin-anydoc'
export const PARSER_NAME = 'anydoc'
export const FILE_TYPES = [
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'csv',
  'odt',
  'ods',
  'odp',
  'rtf',
  'epub',
  'pdf'
]
export const ACTION = 'anydoc.convert'
export const ACTION_VERSION = '1.0.3'
export const PROFILE = 'document/node-20/v1'
export const ConfigSchema = z.object({}).strict()
export const Icon = {
  type: 'svg' as const,
  value: readFileSync(new URL('../_assets/icon.svg', import.meta.url), 'utf8')
}

/** Host uploads usually supply an extension; MIME-only callers use the same upstream format. */
export function documentExtension(type?: string, mimeType?: string): string {
  const value =
    (type && type !== 'unknown' ? type : mimeType)
      ?.split(';')[0]
      .trim()
      .toLowerCase()
      .replace(/^.*\//, '')
      .replace(/^\./, '') ?? ''
  const aliases: Record<string, string> = {
    msword: 'doc',
    'vnd.ms-powerpoint': 'ppt',
    'vnd.ms-excel': 'xls',
    'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'vnd.oasis.opendocument.text': 'odt',
    'vnd.oasis.opendocument.spreadsheet': 'ods',
    'vnd.oasis.opendocument.presentation': 'odp',
    'epub+zip': 'epub',
    'x-rtf': 'rtf'
  }
  return Object.prototype.hasOwnProperty.call(aliases, value) ? aliases[value] : value
}
