import { BadRequestException, Injectable } from '@nestjs/common'
import type { KnowledgebaseApi, KnowledgebaseDocument, KnowledgebaseListItem, KnowledgebaseRetrievalMode } from '@xpert-ai/plugin-sdk'
import type { XpertScope } from './types.js'

const MAX_CONNECTED_KNOWLEDGEBASES = 20
const MAX_RESULTS = 80

export type KnowledgebaseSearchRole = 'consumption' | 'price'

const CONSUMPTION_KNOWLEDGEBASE_TERMS = /消耗量|定额|工程量消耗|quota|consumption|norm/i
const PRICE_KNOWLEDGEBASE_TERMS = /价格|信息价|市场价|询价|价目|price|pricing/i

export type ConnectedKnowledgebaseSearchInput = {
  scope: XpertScope
  knowledgebase: KnowledgebaseApi | null | undefined
  knowledgebaseIds: string[]
  query: string
  topK: number
  source: string
  requestId: string
  retrievalMode?: KnowledgebaseRetrievalMode
  role?: KnowledgebaseSearchRole
}

export type ConnectedKnowledgebaseSearchResult = {
  documents: KnowledgebaseDocument[]
  knowledgebaseIds: string[]
  failedKnowledgebaseIds: string[]
}

/** Keeps platform retrieval inside the current Agent's connected knowledgebase boundary. */
@Injectable()
export class XpertQuotationKnowledgebaseAdapter {
  async searchConnected(input: ConnectedKnowledgebaseSearchInput): Promise<ConnectedKnowledgebaseSearchResult> {
    const connectedIds = normalizeKnowledgebaseIds(input.knowledgebaseIds)
    if (!connectedIds.length) {
      throw new BadRequestException('The current Agent is not connected to a knowledgebase.')
    }
    if (!input.knowledgebase) {
      throw new BadRequestException('Knowledgebase runtime capability is unavailable.')
    }
    const knowledgebaseIds = input.role
      ? await this.resolveKnowledgebaseRole(input, connectedIds)
      : connectedIds
    const query = input.query.replace(/\u0000/g, '').trim()
    if (!query) throw new BadRequestException('Knowledgebase search query is required.')
    const topK = clamp(input.topK, 1, MAX_RESULTS)

    // Search one connected knowledgebase at a time because the platform result
    // contract does not require each returned chunk to carry knowledgebaseId.
    const settled = await Promise.allSettled(knowledgebaseIds.map(async (knowledgebaseId, index) => {
      const documents = await input.knowledgebase!.search({
        tenantId: normalizeOptional(input.scope.tenantId),
        organizationId: normalizeOptional(input.scope.organizationId),
        knowledgebaseIds: [knowledgebaseId],
        query,
        k: topK,
        retrieval: { mode: input.retrievalMode ?? 'hybrid' },
        source: input.source,
        requestId: `${input.requestId}:${index + 1}`
      })
      return documents.map((document) => withKnowledgebaseProvenance(document, knowledgebaseId))
    }))

    const failedKnowledgebaseIds = settled.flatMap((result, index) =>
      result.status === 'rejected' ? [knowledgebaseIds[index]] : []
    )
    const documents = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .sort((left, right) => documentRank(right) - documentRank(left))
      .slice(0, topK)

    if (failedKnowledgebaseIds.length === knowledgebaseIds.length) {
      throw new BadRequestException('All connected knowledgebase searches failed.')
    }
    return { documents, knowledgebaseIds, failedKnowledgebaseIds }
  }

  private async resolveKnowledgebaseRole(input: ConnectedKnowledgebaseSearchInput, connectedIds: string[]) {
    if (connectedIds.length === 1) return connectedIds
    if (!input.knowledgebase?.list) {
      throw new BadRequestException('Platform knowledgebase metadata is unavailable; cannot route the connected knowledgebases by role.')
    }
    let listed: KnowledgebaseListItem[]
    try {
      listed = await input.knowledgebase.list({
        workspaceId: normalizeOptional(input.scope.workspaceId),
        limit: 100
      })
      const missingIds = connectedIds.filter((id) => !listed.some((item) => item.id === id))
      if (missingIds.length && input.scope.workspaceId) {
        const fallback = await input.knowledgebase.list({ limit: 100 }).catch(() => [])
        listed = [...listed, ...fallback.filter((item) => missingIds.includes(item.id))]
      }
    } catch {
      throw new BadRequestException('Platform knowledgebase names could not be loaded; cannot determine the consumption or price knowledgebase.')
    }
    const byId = new Map(listed.map((item) => [item.id, item]))
    const selected = connectedIds.filter((id) => inferKnowledgebaseRole(byId.get(id)) === input.role)
    if (selected.length) return selected

    const roleLabel = input.role === 'consumption' ? '消耗量定额' : '价格'
    const available = connectedIds
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => item.name?.trim() || item.id)
    throw new BadRequestException(
      `当前 Agent 没有可识别的${roleLabel}知识库。请将平台知识库命名为包含“消耗量/定额”或“价格/信息价”的名称；已连接：${available.join('、') || '未返回名称'}。`
    )
  }
}

/** Classify only from platform-visible metadata; IDs are never used as routing rules. */
export function inferKnowledgebaseRole(item?: { name?: string; description?: string | null } | null): KnowledgebaseSearchRole | null {
  if (!item) return null
  const text = `${item.name ?? ''}\n${item.description ?? ''}`.trim()
  const consumption = CONSUMPTION_KNOWLEDGEBASE_TERMS.test(text)
  const price = PRICE_KNOWLEDGEBASE_TERMS.test(text)
  if (consumption === price) return null
  return consumption ? 'consumption' : 'price'
}

export function normalizeKnowledgebaseIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, MAX_CONNECTED_KNOWLEDGEBASES)
}

function withKnowledgebaseProvenance(document: KnowledgebaseDocument, knowledgebaseId: string): KnowledgebaseDocument {
  const metadata = record(document.metadata)
  const relatedDocument = 'document' in document ? record(document.document) : {}
  const documentId = firstString(metadata, ['documentId', 'knowledgeDocumentId', 'knowledgeId'])
    ?? firstString(relatedDocument, ['id'])
  const documentName = firstString(metadata, ['documentName', 'originalFileName', 'filename', 'title'])
    ?? firstString(relatedDocument, ['name', 'title', 'originalFileName'])
  return {
    ...document,
    metadata: {
      ...metadata,
      knowledgebaseId,
      ...(documentId ? { documentId } : {}),
      ...(documentName ? { documentName } : {})
    }
  }
}

function documentRank(document: KnowledgebaseDocument) {
  const metadata = record(document.metadata)
  return firstNumber(metadata, ['relevanceScore', 'score']) ?? 0
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.floor(Number.isFinite(value) ? value : minimum)))
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim()
  return normalized || undefined
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstString(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 600)
  }
  return undefined
}

function firstNumber(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}
