import { Injectable } from '@nestjs/common'

const API_BASE_URL = 'https://api.dingtalk.com'
const LEGACY_API_BASE_URL = 'https://oapi.dingtalk.com'
const REQUEST_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_SKEW_SECONDS = 120

export type DingTalkAppCredential = {
  integrationId: string
  clientId: string
  clientSecret: string
}

export type DingTalkAccount = {
  name?: string
  avatarUrl?: string
  openId?: string
  unionId?: string
  corpId?: string
}

export type DingTalkDepartment = {
  departmentId: number
  name: string
  parentDepartmentId?: number
}

export type DingTalkUser = {
  userId: string
  name: string
  title?: string
  avatarUrl?: string
  active?: boolean
  admin?: boolean
  boss?: boolean
  departmentIds: number[]
  organizationEmail?: string
}

export type DingTalkConversation = {
  openConversationId: string
  title: string
  iconUrl?: string
}

export type DingTalkPage<T> = {
  items: T[]
  hasMore: boolean
  nextCursor?: number
}

export type DingTalkSendMessageInput = {
  appAccessToken: string
  robotCode: string
  recipientType: 'user_id' | 'open_conversation_id'
  recipientId: string
  format: 'text' | 'markdown'
  content: string
  title?: string
}

@Injectable()
export class DingTalkConnectorApiClient {
  private readonly appTokens = new Map<string, { token: string; expiresAt: number }>()

  async getAppAccessToken(credential: DingTalkAppCredential): Promise<string> {
    const cached = this.appTokens.get(credential.integrationId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token
    }

    const payload = await this.request(`${API_BASE_URL}/v1.0/oauth2/accessToken`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ appKey: credential.clientId, appSecret: credential.clientSecret })
    })
    const token = requireString(
      payload,
      ['accessToken', 'access_token'],
      'DingTalk app token response is missing accessToken'
    )
    const expiresIn = readNumber(payload, ['expireIn', 'expiresIn', 'expires_in']) ?? 7_200
    this.appTokens.set(credential.integrationId, {
      token,
      expiresAt: Date.now() + Math.max(300, expiresIn - TOKEN_REFRESH_SKEW_SECONDS) * 1_000
    })
    return token
  }

  async getCurrentUser(userAccessToken: string): Promise<DingTalkAccount> {
    const payload = await this.request(`${API_BASE_URL}/v1.0/contact/users/me`, {
      headers: {
        accept: 'application/json',
        'x-acs-dingtalk-access-token': requireText(userAccessToken, 'DingTalk user access token is required')
      }
    })
    return {
      name: readString(payload, ['nick', 'name']) ?? undefined,
      avatarUrl: readString(payload, ['avatarUrl', 'avatar_url']) ?? undefined,
      openId: readString(payload, ['openId', 'open_id']) ?? undefined,
      unionId: readString(payload, ['unionId', 'union_id']) ?? undefined,
      corpId: readString(payload, ['corpId', 'corp_id']) ?? undefined
    }
  }

  async listDepartments(input: {
    appAccessToken: string
    parentDepartmentId: number
    language: 'zh_CN' | 'en_US'
  }): Promise<{ items: DingTalkDepartment[]; truncated: boolean }> {
    const payload = await this.requestLegacy('/topapi/v2/department/listsub', input.appAccessToken, {
      dept_id: input.parentDepartmentId,
      language: input.language
    })
    const items = readResultList(payload)
      .map(mapDepartment)
      .filter((item): item is DingTalkDepartment => item !== null)
    return { items: items.slice(0, 100), truncated: items.length > 100 }
  }

  async listDepartmentMembers(input: {
    appAccessToken: string
    departmentId: number
    cursor: number
    limit: number
    language: 'zh_CN' | 'en_US'
  }): Promise<DingTalkPage<DingTalkUser>> {
    const payload = await this.requestLegacy('/topapi/v2/user/list', input.appAccessToken, {
      dept_id: input.departmentId,
      cursor: input.cursor,
      size: input.limit,
      language: input.language,
      contain_access_limit: false
    })
    const result = readRecord(payload['result'])
    const items = readArray(result?.['list'])
      .map(mapUser)
      .filter((item): item is DingTalkUser => item !== null)
    const nextCursor = readNumber(result, ['next_cursor', 'nextCursor']) ?? undefined
    return {
      items,
      hasMore: readBoolean(result, ['has_more', 'hasMore']) ?? nextCursor != null,
      ...(nextCursor != null ? { nextCursor } : {})
    }
  }

  async getUser(input: { appAccessToken: string; userId: string; language: 'zh_CN' | 'en_US' }): Promise<DingTalkUser> {
    const payload = await this.requestLegacy('/topapi/v2/user/get', input.appAccessToken, {
      userid: requireText(input.userId, 'DingTalk user ID is required'),
      language: input.language
    })
    const user = mapUser(payload['result'])
    if (!user) {
      throw new Error('DingTalk user response did not include a user ID')
    }
    return user
  }

  async listConversations(input: {
    appAccessToken: string
    cursor: number
    limit: number
  }): Promise<DingTalkPage<DingTalkConversation>> {
    let payload: Record<string, unknown>
    try {
      payload = await this.requestLegacy('/topapi/im/chat/scenegroup/list', input.appAccessToken, {
        cursor: input.cursor,
        size: input.limit
      })
    } catch (error) {
      if (!errorMessage(error).toLowerCase().includes('invalid method')) throw error
      payload = await this.requestLegacy('/chat/list', input.appAccessToken, {
        offset: input.cursor,
        size: input.limit
      })
    }
    const result = readRecord(payload['result'])
    const items = readArray(result?.['chat_list'] ?? payload['chat_list'])
      .map(mapConversation)
      .filter((item): item is DingTalkConversation => item !== null)
    const nextCursor = readNumber(result ?? payload, ['next_cursor', 'nextCursor']) ?? undefined
    return {
      items,
      hasMore: readBoolean(result ?? payload, ['has_more', 'hasMore']) ?? nextCursor != null,
      ...(nextCursor != null ? { nextCursor } : {})
    }
  }

  async sendMessage(input: DingTalkSendMessageInput): Promise<{ messageId?: string }> {
    const msgKey = input.format === 'text' ? 'sampleText' : 'sampleMarkdown'
    const msgParam =
      input.format === 'text'
        ? JSON.stringify({ content: input.content })
        : JSON.stringify({ title: input.title ?? 'Xpert Notification', text: input.content })
    const group = input.recipientType === 'open_conversation_id'
    const payload = await this.request(
      `${API_BASE_URL}${group ? '/v1.0/robot/groupMessages/send' : '/v1.0/robot/oToMessages/batchSend'}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-acs-dingtalk-access-token': requireText(input.appAccessToken, 'DingTalk app access token is required')
        },
        body: JSON.stringify({
          robotCode: requireText(input.robotCode, 'DingTalk Robot Code is not configured'),
          ...(group ? { openConversationId: input.recipientId } : { userIds: [input.recipientId] }),
          msgKey,
          msgParam
        })
      }
    )
    return {
      messageId: readString(payload, ['processQueryKey', 'taskId', 'messageId']) ?? undefined
    }
  }

  clear() {
    this.appTokens.clear()
  }

  private async requestLegacy(path: string, accessToken: string, body: Record<string, unknown>) {
    const url = new URL(path, LEGACY_API_BASE_URL)
    url.searchParams.set('access_token', requireText(accessToken, 'DingTalk app access token is required'))
    const payload = await this.request(url.toString(), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const errorCode = readNumber(payload, ['errcode', 'code'])
    if (errorCode != null && errorCode !== 0) {
      const message = readString(payload, ['errmsg', 'message', 'msg']) ?? 'DingTalk OpenAPI request failed'
      throw new Error(`DingTalk OpenAPI error ${errorCode}: ${message}`)
    }
    return payload
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch (error) {
      throw new Error(`DingTalk request failed: ${errorMessage(error)}`)
    }

    let payload: unknown
    try {
      const text = await response.text()
      payload = text ? JSON.parse(text) : {}
    } catch {
      throw new Error('DingTalk returned an invalid JSON response')
    }
    const record = readRecord(payload) ?? {}
    if (!response.ok) {
      const message = readString(record, ['message', 'errmsg', 'msg']) ?? `HTTP ${response.status}`
      throw new Error(`DingTalk request failed: ${message}`)
    }
    return record
  }
}

function mapDepartment(value: unknown): DingTalkDepartment | null {
  const record = readRecord(value)
  const departmentId = readNumber(record, ['dept_id', 'deptId'])
  const name = readString(record, ['name'])
  if (departmentId == null || !name) return null
  const parentDepartmentId = readNumber(record, ['parent_id', 'parentId']) ?? undefined
  return { departmentId, name, ...(parentDepartmentId != null ? { parentDepartmentId } : {}) }
}

function mapUser(value: unknown): DingTalkUser | null {
  const record = readRecord(value)
  const userId = readString(record, ['userid', 'userId'])
  const name = readString(record, ['name'])
  if (!userId || !name) return null
  return {
    userId,
    name,
    title: readString(record, ['title']) ?? undefined,
    avatarUrl: readString(record, ['avatar']) ?? undefined,
    active: readBoolean(record, ['active']) ?? undefined,
    admin: readBoolean(record, ['admin']) ?? undefined,
    boss: readBoolean(record, ['boss']) ?? undefined,
    departmentIds: readNumberArray(record?.['dept_id_list'] ?? record?.['deptIdList']),
    organizationEmail: readString(record, ['org_email', 'orgEmail']) ?? undefined
  }
}

function mapConversation(value: unknown): DingTalkConversation | null {
  const record = readRecord(value)
  const openConversationId = readString(record, ['open_conversation_id', 'openConversationId', 'chatid'])
  if (!openConversationId) return null
  return {
    openConversationId,
    title: readString(record, ['title', 'name']) ?? openConversationId,
    iconUrl: readString(record, ['icon']) ?? undefined
  }
}

function readResultList(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload['result'])) return payload['result']
  const result = readRecord(payload['result'])
  return readArray(result?.['list'])
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown, keys: string[]): string | null {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function requireString(value: unknown, keys: string[], message: string) {
  const result = readString(value, keys)
  if (!result) throw new Error(message)
  return result
}

function requireText(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function readNumber(value: unknown, keys: string[]): number | null {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate)))
      return Number(candidate)
  }
  return null
}

function readBoolean(value: unknown, keys: string[]): boolean | null {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'boolean') return candidate
  }
  return null
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : Number.NaN))
        .filter((item) => Number.isFinite(item))
    : []
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
