import { Injectable } from '@nestjs/common'
import { Client } from '@notionhq/client'
import { NOTION_API_BASE_URL, NOTION_API_TIMEOUT_MS, NOTION_API_VERSION } from './constants.js'
import { NotionConnectorError, isRecord, providerError, readNumber, readString } from './errors.js'
import {
  mapDataSource,
  mapPageDetail,
  mapPageSummary,
  type NotionBlock,
  type NotionDataSource,
  type NotionPageDetail,
  type NotionPageSummary
} from './notion-mapper.js'
import { NotionRateLimiter } from './notion-rate-limiter.js'

export type NotionRuntimeCredential = {
  connectorId: string
  accessToken: string
}

export type NotionPageResult = {
  items: NotionPageSummary[]
  nextCursor?: string
  hasMore: boolean
}

export type NotionBlockPage = {
  items: NotionBlock[]
  nextCursor?: string
  hasMore: boolean
}

export type NotionQueryFilter = {
  property: string
  type: 'title' | 'rich_text' | 'select' | 'status' | 'checkbox' | 'number'
  value: string | number | boolean
  operator: 'contains' | 'equals' | 'greater_than' | 'less_than'
}

export type NotionSort = { property: string; direction: 'ascending' | 'descending' }

@Injectable()
export class NotionApiClient {
  constructor(private readonly limiter: NotionRateLimiter = new NotionRateLimiter()) {}

  async search(
    credential: NotionRuntimeCredential,
    input: { query?: string; resultType?: 'page' | 'data_source'; cursor?: string; pageSize: number }
  ): Promise<NotionPageResult> {
    const body: Record<string, unknown> = { page_size: input.pageSize }
    if (input.query) body.query = input.query
    if (input.resultType) body.filter = { value: input.resultType, property: 'object' }
    if (input.cursor) body.start_cursor = input.cursor
    const value = await this.request<Record<string, unknown>>(credential, 'search', 'post', body)
    return mapList(value)
  }

  async retrievePage(credential: NotionRuntimeCredential, pageId: string): Promise<NotionPageDetail> {
    return mapPageDetail(
      await this.request<Record<string, unknown>>(credential, `pages/${encodeURIComponent(pageId)}`, 'get')
    )
  }

  async retrieveDataSource(credential: NotionRuntimeCredential, dataSourceId: string): Promise<NotionDataSource> {
    return mapDataSource(
      await this.request<Record<string, unknown>>(credential, `data_sources/${encodeURIComponent(dataSourceId)}`, 'get')
    )
  }

  async queryDataSource(
    credential: NotionRuntimeCredential,
    input: {
      dataSourceId: string
      filter?: NotionQueryFilter
      sorts?: NotionSort[]
      cursor?: string
      pageSize: number
      filterProperties?: string[]
    }
  ): Promise<NotionPageResult> {
    const body: Record<string, unknown> = { page_size: input.pageSize }
    if (input.cursor) body.start_cursor = input.cursor
    if (input.filter) body.filter = providerFilter(input.filter)
    if (input.sorts?.length) body.sorts = input.sorts
    if (input.filterProperties?.length) body.filter_properties = input.filterProperties
    const value = await this.request<Record<string, unknown>>(
      credential,
      `data_sources/${encodeURIComponent(input.dataSourceId)}/query`,
      'post',
      body
    )
    return mapList(value)
  }

  async listBlockChildren(
    credential: NotionRuntimeCredential,
    blockId: string,
    cursor?: string,
    pageSize = 100
  ): Promise<NotionBlockPage> {
    const query: Record<string, string | number> = { page_size: pageSize }
    if (cursor) query.start_cursor = cursor
    const value = await this.request<Record<string, unknown>>(
      credential,
      `blocks/${encodeURIComponent(blockId)}/children`,
      'get',
      undefined,
      query
    )
    return {
      items: Array.isArray(value.results)
        ? value.results.filter(isRecord).map((item) => ({
            id: readString(item.id) ?? 'unknown',
            type: readString(item.type) ?? 'unknown',
            hasChildren: item.has_children === true,
            ...mapBlockText(item)
          }))
        : [],
      nextCursor: readString(value.next_cursor),
      hasMore: value.has_more === true
    }
  }

  async currentUser(credential: NotionRuntimeCredential): Promise<{ id: string; name?: string; avatarUrl?: string }> {
    const value = await this.request<Record<string, unknown>>(credential, 'users/me', 'get')
    return {
      id: readString(value.id) ?? 'unknown',
      name: readString(value.name),
      avatarUrl: readString(value.avatar_url)
    }
  }

  private async request<T extends Record<string, unknown>>(
    credential: NotionRuntimeCredential,
    path: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    body?: Record<string, unknown>,
    query?: Record<string, string | number>
  ): Promise<T> {
    return this.limiter.execute(credential.connectorId, async () => {
      const client = new Client({
        auth: credential.accessToken,
        baseUrl: NOTION_API_BASE_URL,
        notionVersion: NOTION_API_VERSION,
        timeoutMs: NOTION_API_TIMEOUT_MS,
        retry: false
      })
      try {
        const value = await client.request<T>({ path, method, body, query })
        return value
      } catch (error) {
        throw normalizeProviderError(error)
      }
    })
  }
}

function mapList(value: Record<string, unknown>): NotionPageResult {
  const items = Array.isArray(value.results) ? value.results.filter(isRecord).map(mapPageSummary) : []
  return { items, nextCursor: readString(value.next_cursor), hasMore: value.has_more === true }
}

function providerFilter(filter: NotionQueryFilter): Record<string, unknown> {
  const operator = filter.operator
  const value = filter.value
  const key = filter.type
  return { property: filter.property, [key]: { [operator]: value } }
}

function mapBlockText(value: Record<string, unknown>): Pick<NotionBlock, 'text'> {
  const type = readString(value.type)
  const payload = type && isRecord(value[type]) ? value[type] : undefined
  if (!payload) return {}
  if (type === 'child_page' || type === 'child_database') return { text: readString(payload.title) }
  if (type === 'divider') return { text: '---' }
  if (Array.isArray(payload.rich_text)) {
    const text = payload.rich_text
      .filter(isRecord)
      .map((item) => readString(item.plain_text) ?? '')
      .join('')
    return text ? { text } : {}
  }
  return {}
}

function normalizeProviderError(error: unknown): NotionConnectorError {
  if (error instanceof NotionConnectorError) return error
  const record = isRecord(error) ? error : undefined
  const status = readNumber(record?.status) ?? 0
  const retryAfterValue = headerValue(record?.headers, 'retry-after')
  const retryAfter = retryAfterValue ? Number(retryAfterValue) : undefined
  return providerError(status, readString(record?.message) ?? 'Notion API request failed.', retryAfter)
}

function headerValue(value: unknown, name: string): string | undefined {
  if (isRecord(value)) {
    const direct = readString(value[name])
    if (direct) return direct
    const get = value.get
    if (typeof get === 'function') return readString(get.call(value, name))
  }
  return undefined
}
