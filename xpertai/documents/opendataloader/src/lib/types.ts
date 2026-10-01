import { z } from 'zod'
import { readFileSync } from 'node:fs'
export const PACKAGE_NAME = '@xpert-ai/plugin-opendataloader'
export const PARSER_NAME = 'opendataloader'
export const FILE_TYPES = ['pdf']
export const ACTION = 'opendataloader.convert'
export const ACTION_VERSION = '1.2.1'
export const PROFILE = 'document/java-17/v1'
export const ConfigSchema = z.object({}).strict()
export const ParserConfigSchema = z.object({
  ocrConfidenceThreshold: z
    .number()
    .finite()
    .min(0)
    .max(1)
    .nullish()
    .transform((value) => value ?? 0.5)
})
export type OpenDataLoaderParserConfig = z.input<typeof ParserConfigSchema>
export const Icon = {
  type: 'image' as const,
  value: `data:image/webp;base64,${readFileSync(new URL('../_assets/icon.webp', import.meta.url)).toString('base64')}`
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
