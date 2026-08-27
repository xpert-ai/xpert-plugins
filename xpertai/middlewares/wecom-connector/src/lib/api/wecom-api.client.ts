import { Injectable } from '@nestjs/common'
import { WECOM_API_BASE_URL, WECOM_REQUEST_TIMEOUT_MS } from '../constants.js'
import { WeComConnectorError, providerError } from '../errors.js'
import type { WeComApiPayload, WeComSendMessageInput } from './types.js'

@Injectable()
export class WeComApiClient {
  getAgent(accessToken: string, agentId: string) {
    return this.get('/agent/get', accessToken, { agentid: agentId })
  }

  listDepartments(accessToken: string, parentDepartmentId: number) {
    return this.get('/department/simplelist', accessToken, { id: parentDepartmentId })
  }

  getDepartment(accessToken: string, departmentId: number) {
    return this.get('/department/get', accessToken, { id: departmentId })
  }

  listDepartmentMembers(accessToken: string, departmentId: number) {
    return this.get('/user/simplelist', accessToken, { department_id: departmentId })
  }

  getMember(accessToken: string, userId: string) {
    return this.get('/user/get', accessToken, { userid: userId })
  }

  listTags(accessToken: string) {
    return this.get('/tag/list', accessToken)
  }

  getTagMembers(accessToken: string, tagId: number) {
    return this.get('/tag/get', accessToken, { tagid: tagId })
  }

  async uploadFile(input: { accessToken: string; fileName: string; mimeType?: string; buffer: Buffer }) {
    const form = new FormData()
    form.append('media', new Blob([input.buffer], { type: input.mimeType ?? 'application/octet-stream' }), input.fileName)
    return this.request('/media/upload', input.accessToken, { type: 'file' }, { method: 'POST', body: form })
  }

  sendMessage(input: WeComSendMessageInput) {
    const body: Record<string, unknown> = {
      touser: input.userIds.join('|'),
      agentid: /^\d+$/.test(input.agentId) ? Number(input.agentId) : input.agentId,
      safe: 0,
      enable_duplicate_check: 1,
      duplicate_check_interval: 1_800
    }
    if (input.message.type === 'file') {
      body.msgtype = 'file'
      body.file = { media_id: input.message.mediaId }
    } else {
      body.msgtype = input.message.type
      body[input.message.type] = { content: input.message.content }
    }
    return this.post('/message/send', input.accessToken, body)
  }

  recallMessage(accessToken: string, messageId: string) {
    return this.post('/message/recall', accessToken, { msgid: messageId })
  }

  private get(path: string, accessToken: string, query: Record<string, string | number> = {}) {
    return this.request(path, accessToken, query)
  }

  private post(path: string, accessToken: string, body: Record<string, unknown>) {
    return this.request(path, accessToken, {}, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  }

  private async request(
    path: string,
    accessToken: string,
    query: Record<string, string | number>,
    init: RequestInit = {}
  ): Promise<WeComApiPayload> {
    const url = new URL(`${WECOM_API_BASE_URL}${path}`)
    url.searchParams.set('access_token', accessToken)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, `${value}`)

    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: init.headers ?? { accept: 'application/json' },
        signal: init.signal ?? AbortSignal.timeout(WECOM_REQUEST_TIMEOUT_MS)
      })
    } catch {
      throw new WeComConnectorError('NETWORK_ERROR', 'The WeCom API request failed. Retry later.', undefined, true)
    }

    const payload = await readPayload(response)
    if (!response.ok) {
      throw new WeComConnectorError(
        'NETWORK_ERROR',
        `The WeCom API returned HTTP ${response.status}.`,
        undefined,
        response.status >= 500
      )
    }
    const code = readNumber(payload.errcode) ?? 0
    if (code !== 0) throw providerError(code, readString(payload.errmsg))
    return payload
  }
}

async function readPayload(response: Response): Promise<WeComApiPayload> {
  try {
    const value: unknown = await response.json()
    return isRecord(value) ? value : {}
  } catch {
    throw new WeComConnectorError('NETWORK_ERROR', 'The WeCom API returned an invalid JSON response.')
  }
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
