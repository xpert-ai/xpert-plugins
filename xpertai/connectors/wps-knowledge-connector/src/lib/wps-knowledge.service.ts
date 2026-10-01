import { Injectable } from '@nestjs/common'
import { WPS_MAX_ANSWER_CHARS, WPS_MAX_CITATIONS, WPS_MAX_SNIPPET_CHARS } from './constants.js'
import { WpsKnowledgeConnectorError } from './errors.js'
import {
  WpsKnowledgeSkillHubClient,
  type WpsKnowledgeRuntimeCredential
} from './wps-knowledge-skillhub.client.js'

export type WpsKnowledgeRuntime = { credential: WpsKnowledgeRuntimeCredential }

export type KnowledgeLibraryDto = {
  kuid: string
  driveId: string | null
  name: string
  description: string | null
  coverUrl: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type KnowledgeLibraryPageDto = {
  items: KnowledgeLibraryDto[]
  nextCursor: string | null
}

export type KnowledgeFileDto = {
  kuid: string
  fileId: string | null
  driveId: string | null
  name: string
  docType: string | null
  originType: string | null
  folder: boolean
  modifiedAt: string | null
  linkUrl: string | null
}

export type KnowledgeFilePageDto = {
  items: KnowledgeFileDto[]
  nextCursor: string | null
}

export type KnowledgeCitationDto = {
  kuid: string | null
  fileId: string | null
  title: string
  sourceUrl: string | null
  snippet: string | null
}

export type WpsKnowledgeAnswerDto = {
  status: 'completed' | 'empty'
  answer: string
  requestId: string | null
  citations: KnowledgeCitationDto[]
  truncated: boolean
}

@Injectable()
export class WpsKnowledgeService {
  constructor(private readonly skillHub: WpsKnowledgeSkillHubClient) {}

  async listLibraries(
    runtime: WpsKnowledgeRuntime,
    input: { keyword?: string; pageSize: number; cursor?: string }
  ): Promise<KnowledgeLibraryPageDto> {
    const payload = await this.skillHub.getJson(runtime.credential, 'knowledge_view/list', {
      keyword: input.keyword,
      page_size: input.pageSize,
      page_token: input.cursor
    })
    const data = payload.data
    return {
      items: records(data, ['items', 'list', 'knowledge_views']).map(mapLibrary).filter(hasLibraryIdentity),
      nextCursor: nextCursor(data)
    }
  }

  async getLibrary(
    runtime: WpsKnowledgeRuntime,
    input: { kuid?: string; name?: string }
  ): Promise<{ status: 'found' | 'not_found'; library: KnowledgeLibraryDto | null }> {
    const payload = await this.skillHub.getJson(runtime.credential, 'knowledge_view', {
      kuid: input.kuid,
      name: input.name
    })
    const candidates = records(payload.data, ['items', 'list', 'knowledge_views'])
    const value = candidates[0] ?? object(payload.data)
    const library = value ? mapLibrary(value) : null
    return library && hasLibraryIdentity(library)
      ? { status: 'found', library }
      : { status: 'not_found', library: null }
  }

  async listFiles(
    runtime: WpsKnowledgeRuntime,
    input: { kuid: string; pageSize: number; cursor?: string }
  ): Promise<KnowledgeFilePageDto> {
    const payload = await this.skillHub.getJson(runtime.credential, 'file/list', {
      kuid: input.kuid,
      page_size: input.pageSize,
      page_token: input.cursor
    })
    const data = payload.data
    return {
      items: records(data, ['items', 'list', 'files', 'children']).map(mapFile).filter((item) => !!item.kuid),
      nextCursor: nextCursor(data)
    }
  }

  async getShareLink(runtime: WpsKnowledgeRuntime, kuid: string): Promise<{ kuid: string; shareUrl: string }> {
    const payload = await this.skillHub.getJson(runtime.credential, 'knowledge_view/share_link', { kuid })
    const data = object(payload.data)
    const shareUrl = safeWpsUrl(
      readString(data?.share_link) ?? readString(data?.share_url) ?? readString(data?.url) ?? readString(payload.data)
    )
    if (!shareUrl) {
      throw new WpsKnowledgeConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS Knowledge did not return a valid share link.')
    }
    return { kuid, shareUrl }
  }

  async ask(runtime: WpsKnowledgeRuntime, input: {
    query: string
    libraryKuids?: string[]
    webSearch: boolean
    switchThinking: boolean
  }): Promise<WpsKnowledgeAnswerDto> {
    const events = await this.skillHub.postSse(runtime.credential, 'knowledge_view/ask', {
      input: input.query,
      ...(input.libraryKuids?.length ? { kuids: input.libraryKuids } : { scope: 'all_wiki' }),
      use_web_search: input.webSearch,
      switch_thinking: input.switchThinking
    })
    let answer = ''
    let requestId: string | null = null
    const citations = new Map<string, KnowledgeCitationDto>()
    for await (const event of events) {
      const root = parseEventData(event.data)
      if (!root) {
        throw new WpsKnowledgeConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS Knowledge stream returned invalid JSON.')
      }
      assertStreamSuccess(root)
      const data = object(root.data) ?? root
      const dynamic = object(data.dynamic) ?? data
      requestId = requestId ?? readString(data.request_id) ?? readString(data.x_request_id) ?? readString(dynamic.request_id) ?? null

      const answerParts = array(dynamic.answer_citations)
        .map((item) => object(item))
        .filter((item): item is Record<string, unknown> => !!item)
      if (answerParts.length) {
        answer += answerParts.map((item) => readString(item.text) ?? '').join('')
        for (const part of answerParts) {
          addSources(citations, part.reply_sources)
          addSources(citations, part.citations)
        }
      } else {
        answer += readString(dynamic.answer_delta) ?? readString(dynamic.text_delta) ?? ''
      }
      addSources(citations, dynamic.reply_sources)
      addSources(citations, dynamic.citations)
      addSources(citations, dynamic.sources)
    }
    const boundedAnswer = answer.slice(0, WPS_MAX_ANSWER_CHARS)
    return {
      status: boundedAnswer || citations.size ? 'completed' : 'empty',
      answer: boundedAnswer,
      requestId,
      citations: Array.from(citations.values()).slice(0, WPS_MAX_CITATIONS),
      truncated: answer.length > WPS_MAX_ANSWER_CHARS
    }
  }
}

function mapLibrary(input: Record<string, unknown>): KnowledgeLibraryDto {
  const value = object(input.knowledge_view) ?? input
  return {
    // `knowledge_view/list` uses the space_* field names, while some SkillHub
    // responses and older fixtures use the shorter or camelCase variants.
    kuid: identifier(value.space_kuid) ?? identifier(value.spaceKuid) ?? identifier(value.kuid) ?? identifier(value.id) ?? '',
    driveId: identifier(value.drive_id) ?? identifier(value.driveId) ?? null,
    name: boundedString(value.space_name, 240) ?? boundedString(value.spaceName, 240) ?? boundedString(value.name, 240) ?? boundedString(value.title, 240) ?? '',
    description: boundedString(value.space_desc, 2_000) ?? boundedString(value.space_description, 2_000) ?? boundedString(value.desc, 2_000) ?? boundedString(value.description, 2_000) ?? null,
    coverUrl: safeWpsUrl(readString(value.space_cover_img) ?? readString(value.cover_img) ?? readString(value.cover_url)),
    createdAt: timestamp(value.space_ctime ?? value.ctime ?? value.create_time ?? value.created_at),
    updatedAt: timestamp(value.space_utime ?? value.utime ?? value.update_time ?? value.updated_at)
  }
}

function hasLibraryIdentity(value: KnowledgeLibraryDto): boolean {
  return !!value.kuid && !!value.name
}

function mapFile(input: Record<string, unknown>): KnowledgeFileDto {
  const value = object(input.file) ?? input
  const docType = boundedString(value.doc_type, 64) ?? boundedString(value.type, 64) ?? null
  return {
    kuid: identifier(value.kuid) ?? identifier(value.link_id) ?? identifier(value.id) ?? '',
    fileId: identifier(value.file_id) ?? identifier(value.fileid) ?? null,
    driveId: identifier(value.drive_id) ?? null,
    name: boundedString(value.title, 500) ?? boundedString(value.name, 500) ?? '',
    docType,
    originType: boundedString(value.doc_origin_type, 64) ?? boundedString(value.origin_type, 64) ?? null,
    folder: value.is_folder === true || docType === 'folder',
    modifiedAt: timestamp(value.mtime ?? value.modified_at ?? value.update_time),
    linkUrl: safeWpsUrl(readString(value.link_url) ?? readString(value.url))
  }
}

function addSources(target: Map<string, KnowledgeCitationDto>, input: unknown): void {
  for (const entry of array(input)) {
    const source = object(entry)
    if (!source) continue
    const file = object(source.file) ?? object(source.file_meta) ?? source
    const kuid = identifier(file.kuid) ?? identifier(file.link_id) ?? null
    const fileId = identifier(file.file_id) ?? identifier(file.fileid) ?? null
    const sourceUrl = safeWpsUrl(readString(file.link_url) ?? readString(file.url))
    const title = boundedString(file.title, 500) ?? boundedString(file.name, 500) ?? boundedString(file.fname, 500) ?? 'WPS Knowledge source'
    const snippet = boundedString(source.snippet, WPS_MAX_SNIPPET_CHARS) ?? boundedString(source.content, WPS_MAX_SNIPPET_CHARS) ?? null
    const key = kuid ?? fileId ?? sourceUrl ?? `${title}:${snippet ?? ''}`
    if (!target.has(key)) target.set(key, { kuid, fileId, title, sourceUrl, snippet })
  }
}

function assertStreamSuccess(payload: Record<string, unknown>): void {
  const code = integerCode(payload.code)
  if (code === null || code === 0 || code === 100000) return
  const codeClass = code >= 100_000_000 ? Math.floor(code / 1_000_000) : null
  if (codeClass === 401) throw new WpsKnowledgeConnectorError('TOKEN_EXPIRED', 'WPS Knowledge SkillHub authorization has expired.')
  if (codeClass === 403) throw new WpsKnowledgeConnectorError('PERMISSION_DENIED', 'WPS denied the knowledge query.')
  if (codeClass === 429) throw new WpsKnowledgeConnectorError('RATE_LIMITED', 'WPS Knowledge query was rate limited.', true)
  throw new WpsKnowledgeConnectorError('PROVIDER_RESPONSE_INVALID', `WPS Knowledge query failed with code ${code}.`)
}

function records(value: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(object).filter((item): item is Record<string, unknown> => !!item)
  const container = object(value)
  if (!container) return []
  for (const key of keys) {
    const values = array(container[key]).map(object).filter((item): item is Record<string, unknown> => !!item)
    if (values.length) return values
  }
  return []
}

function nextCursor(value: unknown): string | null {
  const data = object(value)
  return readString(data?.next_page_token) ?? readString(data?.page_token) ?? readString(data?.next_cursor) ?? null
}

function parseEventData(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return object(parsed) ?? null
  } catch {
    return null
  }
}

function safeWpsUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !isWpsHost(url.hostname)) return null
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function isWpsHost(hostname: string): boolean {
  return ['wps.cn', 'kdocs.cn', 'wpscdn.cn'].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

function timestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
    if (/^\d+$/.test(value)) return timestamp(Number(value))
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const millis = value < 10_000_000_000 ? value * 1_000 : value
    const date = new Date(millis)
    if (Number.isFinite(date.getTime())) return date.toISOString()
  }
  return null
}

function identifier(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return boundedString(value, 256)
}

function boundedString(value: unknown, max: number): string | undefined {
  const text = readString(value)
  return text ? text.slice(0, max) : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function integerCode(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) ? number : null
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
