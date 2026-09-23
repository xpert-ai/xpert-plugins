import { z } from 'zod/v3'
import {
  NOTION_MAX_BLOCK_DEPTH,
  NOTION_MAX_BLOCKS,
  NOTION_MAX_PAGE_SIZE,
  NOTION_MAX_QUERY_LENGTH
} from '../constants.js'

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (value) => !['current', 'current_page', 'current_database', 'unknown'].includes(value.toLowerCase()),
    'Use an exact identifier returned by a Notion tool.'
  )

const cursor = z.string().trim().min(1).max(1_024).optional()
const MAX_STRINGIFIED_FILTER_LENGTH = 2_048

export const searchNotionSchema = z
  .object({
    query: z.string().trim().max(NOTION_MAX_QUERY_LENGTH).optional(),
    result_type: z.enum(['page', 'data_source']).optional(),
    start_cursor: cursor,
    page_size: z.number().int().min(1).max(NOTION_MAX_PAGE_SIZE).default(20)
  })
  .strict()

export const getNotionPageSchema = z.object({ page_id: identifier }).strict()

export const readNotionPageSchema = z
  .object({
    page_id: identifier,
    max_depth: z.number().int().min(0).max(NOTION_MAX_BLOCK_DEPTH).default(4),
    max_blocks: z.number().int().min(1).max(NOTION_MAX_BLOCKS).default(200),
    include_archived: z.boolean().default(false)
  })
  .strict()

export const getNotionDataSourceSchema = z.object({ data_source_id: identifier }).strict()

const queryFilter = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('title'),
      property: identifier,
      operator: z.enum(['contains', 'equals']),
      value: z.string().trim().min(1).max(200)
    })
    .strict(),
  z
    .object({
      type: z.literal('rich_text'),
      property: identifier,
      operator: z.enum(['contains', 'equals']),
      value: z.string().trim().min(1).max(200)
    })
    .strict(),
  z
    .object({
      type: z.literal('select'),
      property: identifier,
      operator: z.literal('equals'),
      value: z.string().trim().min(1).max(200)
    })
    .strict(),
  z
    .object({
      type: z.literal('status'),
      property: identifier,
      operator: z.literal('equals'),
      value: z.string().trim().min(1).max(200)
    })
    .strict(),
  z
    .object({ type: z.literal('checkbox'), property: identifier, operator: z.literal('equals'), value: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal('number'),
      property: identifier,
      operator: z.enum(['equals', 'greater_than', 'less_than']),
      value: z.number().finite()
    })
    .strict()
])

const compatibleQueryFilter = z.preprocess((value) => {
  if (typeof value !== 'string' || value.length > MAX_STRINGIFIED_FILTER_LENGTH) return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}, queryFilter)

const querySort = z
  .object({
    property: identifier,
    direction: z.enum(['ascending', 'descending'])
  })
  .strict()

export const queryNotionDataSourceSchema = z
  .object({
    data_source_id: identifier,
    filter: compatibleQueryFilter.optional(),
    sorts: z.array(querySort).max(3).optional(),
    start_cursor: cursor,
    page_size: z.number().int().min(1).max(NOTION_MAX_PAGE_SIZE).default(20),
    filter_properties: z.array(identifier).max(30).optional()
  })
  .strict()

export type SearchNotionInput = {
  query?: string
  result_type?: 'page' | 'data_source'
  start_cursor?: string
  page_size: number
}
export type GetNotionPageInput = { page_id: string }
export type ReadNotionPageInput = { page_id: string; max_depth: number; max_blocks: number; include_archived: boolean }
export type GetNotionDataSourceInput = { data_source_id: string }
export type NotionToolFilter = {
  type: 'title' | 'rich_text' | 'select' | 'status' | 'checkbox' | 'number'
  property: string
  operator: 'contains' | 'equals' | 'greater_than' | 'less_than'
  value: string | number | boolean
}
export type NotionToolSort = { property: string; direction: 'ascending' | 'descending' }
export type QueryNotionDataSourceInput = {
  data_source_id: string
  filter?: NotionToolFilter
  sorts?: NotionToolSort[]
  start_cursor?: string
  page_size: number
  filter_properties?: string[]
}
