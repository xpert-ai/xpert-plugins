import { z } from 'zod/v3'

const identifier = z.string().trim().min(1).max(256).refine(
  (value) => !['current', 'unknown', 'current_library', 'current_file'].includes(value.toLowerCase()),
  'Use an exact WPS kuid returned by a previous tool.'
)
const cursor = z.string().trim().min(1).max(1_024).optional()
const unique = (values: string[]) => new Set(values).size === values.length

export const listLibrariesSchema = z.object({
  keyword: z.string().trim().min(1).max(200).optional(),
  pageSize: z.number().int().min(1).max(100).default(20),
  cursor
}).strict()

export const getLibrarySchema = z.object({
  kuid: identifier.optional(),
  name: z.string().trim().min(1).max(240).optional()
}).strict().refine((value) => !!value.kuid || !!value.name, 'Provide either kuid or name.')

export const listFilesSchema = z.object({
  kuid: identifier,
  pageSize: z.number().int().min(1).max(100).default(50),
  cursor
}).strict()

export const askSchema = z.object({
  query: z.string().trim().min(1).max(4_000),
  libraryKuids: z.array(identifier).max(10).refine(unique, 'libraryKuids must be unique').optional(),
  webSearch: z.boolean().default(false),
  switchThinking: z.boolean().default(false)
}).strict()

export const shareLinkSchema = z.object({ kuid: identifier }).strict()
export const connectionStatusSchema = z.object({}).strict()

export type ListLibrariesInput = { keyword?: string; pageSize: number; cursor?: string }
export type GetLibraryInput = { kuid?: string; name?: string }
export type ListFilesInput = { kuid: string; pageSize: number; cursor?: string }
export type AskInput = {
  query: string
  libraryKuids?: string[]
  webSearch: boolean
  switchThinking: boolean
}
export type ShareLinkInput = { kuid: string }
