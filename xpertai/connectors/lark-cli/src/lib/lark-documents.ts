import { createHash } from 'node:crypto'
import axios from 'axios'
import { z } from 'zod'
import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common'
import type { ConnectorDocumentEntry, ConnectorDocumentSource, ConnectorRuntimeCredentialV2 } from '@xpert-ai/plugin-sdk'

const tokenPattern = /^[A-Za-z0-9_-]{10,200}$/u
const token = z.string().regex(tokenPattern)
const envelopeSchema = z.object({ code: z.number(), data: z.unknown().optional() })
const listingSchema = z.object({ docs_entities: z.array(z.unknown()).optional(), files: z.array(z.unknown()).optional(),
  has_more: z.boolean().optional(), next_page_token: z.string().optional() })
const searchEntrySchema = z.object({ docs_token: token, docs_type: z.literal('docx'), title: z.string().optional(), url: z.string().optional() })
const driveEntrySchema = z.object({ token, type: z.literal('docx'), name: z.string().optional(), url: z.string().optional() })
const nodeSchema = z.object({ node: z.object({ node_token: token, obj_token: token, obj_type: z.string() }) })
const metadataSchema = z.object({ document: z.object({ document_id: token, title: z.string(), revision_id: z.number().int().safe() }) })
const textSchema = z.object({ content: z.string() })
type DocumentLocator = { kind: 'docx' | 'wiki'; id: string; url: string | null }

/** Never fetch a pasted URL. Wiki links resolve through the fixed OpenAPI endpoint and must
 * explicitly identify a docx object; a wiki token is never guessed to be a document token.
 */
export function larkDocumentLocator(locator: string): DocumentLocator {
  if (tokenPattern.test(locator)) return { kind: 'docx', id: locator, url: null }
  try {
    const url = new URL(locator)
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['feishu.cn', 'larksuite.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error()
    const match = /^\/(docx|wiki)\/([A-Za-z0-9_-]{10,200})\/?$/u.exec(url.pathname)
    if (!match || (match[1] !== 'docx' && match[1] !== 'wiki')) throw new Error()
    return { kind: match[1], id: match[2], url: `${url.origin}/${match[1]}/${match[2]}` }
  } catch { throw new BadRequestException('lark.documents.unsupported_locator') }
}
const safeUrl = (value: string | undefined, id: string) => {
  try { const target = larkDocumentLocator(value ?? ''); return target.kind === 'docx' && target.id === id ? target.url : null } catch { return null }
}

/** Read-only adapter. Plain-text copies are explicitly labelled; no remote write or rich-format promise. */
export class LarkDocumentSource implements ConnectorDocumentSource {
  private async request<T>(credential: ConnectorRuntimeCredentialV2, path: string, schema: z.ZodType<T>, body?: object, params?: object): Promise<T> {
    const accessToken = credential.credentials.accessToken
    if (typeof accessToken !== 'string' || !accessToken) throw new ForbiddenException('lark.documents.connection_required')
    const brand = credential.credentials.brand
    if (brand !== undefined && brand !== 'feishu' && brand !== 'lark') throw new BadRequestException('lark.documents.unsupported_brand')
    const origin = brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
    let response: { data: unknown }
    try {
      response = await axios.request({ url: `${origin}/open-apis${path}`, method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }, data: body, params,
        timeout: 15000, maxRedirects: 0, maxContentLength: 2_000_000 })
    } catch (error) {
      // Axios errors retain request headers. Never forward/log them, provider body or a credential.
      const status = axios.isAxiosError(error) && Number.isInteger(error.response?.status) ? error.response?.status : 'network'
      throw new BadGatewayException(`lark.documents.request_failed:${status}`)
    }
    const envelope = envelopeSchema.safeParse(response.data)
    if (!envelope.success) throw new BadGatewayException('lark.documents.invalid_response')
    if (envelope.data.code === 131006) throw new ForbiddenException('lark.documents.source_access_denied')
    if (envelope.data.code !== 0) throw new BadGatewayException(`lark.documents.provider_rejected:${envelope.data.code}`)
    const result = schema.safeParse(envelope.data.data)
    if (!result.success) throw new BadGatewayException('lark.documents.invalid_response')
    return result.data
  }
  private async resolveWiki(credential: ConnectorRuntimeCredentialV2, target: DocumentLocator) {
    // Use the current CLI endpoint with the granular wiki:node:retrieve permission.
    const { node } = await this.request(credential, '/wiki/v2/spaces/node_by_token', nodeSchema, undefined, { token: target.id })
    if (node.node_token !== target.id) throw new BadGatewayException('lark.documents.invalid_response')
    if (node.obj_type !== 'docx') throw new BadRequestException('lark.documents.unsupported_document_type')
    return node.obj_token
  }
  search: ConnectorDocumentSource['search'] = async (credential, query) => {
    let data: z.infer<typeof listingSchema>, nextCursor: string | null
    if (query.query.trim()) {
      const offset = query.cursor === undefined ? 0 : Number(query.cursor)
      if (!Number.isInteger(offset) || offset < 0 || offset >= 199) throw new BadRequestException('lark.documents.invalid_cursor')
      const count = Math.min(query.pageSize, 199 - offset)
      data = await this.request(credential, '/suite/docs-api/search/object', listingSchema, { search_key: query.query.trim(), count, offset, docs_types: ['docx'] })
      nextCursor = data.has_more === true && offset + count < 199 ? String(offset + count) : null
    } else {
      data = await this.request(credential, '/drive/v1/files', listingSchema, undefined, { page_size: query.pageSize, ...(query.cursor ? { page_token: query.cursor } : {}) })
      nextCursor = data.has_more === true && data.next_page_token ? data.next_page_token : null
    }
    const items: ConnectorDocumentEntry[] = []
    for (const value of query.query.trim() ? data.docs_entities ?? [] : data.files ?? []) {
      if (query.query.trim()) {
        const row = searchEntrySchema.safeParse(value)
        if (row.success) items.push({ id: row.data.docs_token, title: row.data.title?.slice(0, 200) || row.data.docs_token,
          type: 'document', url: safeUrl(row.data.url, row.data.docs_token) })
      } else {
        const row = driveEntrySchema.safeParse(value)
        if (row.success) items.push({ id: row.data.token, title: row.data.name?.slice(0, 200) || row.data.token,
          type: 'document', url: safeUrl(row.data.url, row.data.token) })
      }
    }
    return { items, nextCursor }
  }
  read: ConnectorDocumentSource['read'] = async (credential, locator) => {
    const target = larkDocumentLocator(locator)
    const id = target.kind === 'wiki' ? await this.resolveWiki(credential, target) : target.id
    const path = `/docx/v1/documents/${id}`
    const { document: before } = await this.request(credential, path, metadataSchema)
    const raw = await this.request(credential, `${path}/raw_content`, textSchema)
    const { document: after } = await this.request(credential, path, metadataSchema)
    if (before.document_id !== id || after.document_id !== id) throw new BadGatewayException('lark.documents.invalid_response')
    if (before.revision_id !== after.revision_id || before.title !== after.title) throw new ConflictException('lark.documents.source_changed')
    // A node can be retargeted independently of its document. Recheck the mapping before accepting the snapshot.
    if (target.kind === 'wiki' && await this.resolveWiki(credential, target) !== id) throw new ConflictException('lark.documents.source_changed')
    if (Buffer.byteLength(raw.content, 'utf8') > 100_000) throw new PayloadTooLargeException('lark.documents.too_large')
    return { id, title: after.title.slice(0, 180) || id, type: 'document', url: target.url,
      revision: String(after.revision_id), contentHash: createHash('sha256').update(raw.content).digest('hex'),
      format: 'text/plain', content: raw.content,
      warnings: ['仅导入可读取的纯文本；图片、附件、公式、表格结构、排版与评论不会随副本保留。请先核对预览，完整内容请查看飞书原文。'] }
  }
}
