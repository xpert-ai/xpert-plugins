import { Injectable } from '@nestjs/common'
import { IIntegration } from '@xpert-ai/contracts'
import {
  normalizeApiVersion,
  normalizeBaseUrl,
  normalizeString,
  normalizeTimeoutMs,
  normalizeWechatPersonalConnectionMode,
  TIntegrationWechatPersonalOptions
} from './types.js'
import { WechatPersonalTunnelBrokerService } from './wechat-personal-tunnel-broker.service.js'

export interface WechatPersonalSendTextInput {
  uuid: string
  contactId: string
  content: string
  atUsers?: string[]
}

export interface WechatPersonalSendResult {
  success: boolean
  messageId?: string
  error?: string
  raw?: unknown
}

@Injectable()
export class WechatPersonalClient {
  constructor(private readonly tunnelBroker?: WechatPersonalTunnelBrokerService) {}

  async sendText(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    input: WechatPersonalSendTextInput
  ): Promise<WechatPersonalSendResult> {
    const options = integration.options || ({} as TIntegrationWechatPersonalOptions)
    const primary = await this.postJson(
      integration,
      this.buildV2Url(options, 'message/sendtext'),
      this.buildV2Path(options, 'message/sendtext'),
      {
        uuid: input.uuid,
        contactid: input.contactId,
        textcontent: input.content,
        atusers: input.atUsers ?? []
      }
    )

    if (primary.success || options.fallbackToLegacySendText === false) {
      return primary
    }

    const legacyPath = `/message/SendTextMessage?key=${encodeURIComponent(input.uuid)}`
    const legacy = await this.postJson(
      integration,
      `${normalizeBaseUrl(options.baseUrl)}${legacyPath}`,
      legacyPath,
      {
        MsgItem: [
          {
            ToUserName: input.contactId,
            TextContent: input.content,
            MsgType: 1,
            AtWxIDList: input.atUsers ?? []
          }
        ]
      }
    )

    if (!legacy.success) {
      return {
        ...legacy,
        error: `${primary.error || 'primary send failed'}; fallback: ${legacy.error || 'legacy send failed'}`
      }
    }

    return legacy
  }

  async registerCallback(params: {
    integration: IIntegration<TIntegrationWechatPersonalOptions>
    uuid: string
    callbackUrl: string
    enabled?: boolean
  }): Promise<WechatPersonalSendResult> {
    const baseUrl = normalizeBaseUrl(params.integration.options?.baseUrl)
    const path = `/message/SetCallback?key=${encodeURIComponent(params.uuid)}`
    return this.postJson(
      params.integration,
      `${baseUrl}${path}`,
      path,
      {
        CallbackURL: params.callbackUrl,
        Enabled: params.enabled !== false
      }
    )
  }

  private buildV2Url(options: TIntegrationWechatPersonalOptions, path: string): string {
    const baseUrl = normalizeBaseUrl(options.baseUrl)
    const apiVersion = normalizeApiVersion(options.apiVersion)
    return `${baseUrl}${apiVersion}${path.replace(/^\/+/, '')}`
  }

  private buildV2Path(options: TIntegrationWechatPersonalOptions, path: string): string {
    const apiVersion = normalizeApiVersion(options.apiVersion)
    return `${apiVersion}${path.replace(/^\/+/, '')}`
  }

  private async postJson(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    url: string,
    tunnelPath: string,
    body: Record<string, unknown>
  ): Promise<WechatPersonalSendResult> {
    const options = integration.options || ({} as TIntegrationWechatPersonalOptions)
    const connectionMode = normalizeWechatPersonalConnectionMode(options.connectionMode)
    if (connectionMode === 'reverse_tunnel') {
      return this.postJsonViaTunnel(integration, tunnelPath, body)
    }

    if (!normalizeBaseUrl(options.baseUrl)) {
      return {
        success: false,
        error: 'wx2.0 baseUrl is required for direct_http mode'
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), normalizeTimeoutMs(options.timeoutMs))
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      const token = normalizeString(options.apiToken)
      if (token) {
        headers.token = token
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })
      return this.resolveHttpResult(response.status, response.ok, await response.text().catch(() => ''))
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private async postJsonViaTunnel(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    path: string,
    body: Record<string, unknown>
  ): Promise<WechatPersonalSendResult> {
    const options = integration.options || ({} as TIntegrationWechatPersonalOptions)
    const clientId = normalizeString(options.tunnelClientId)
    if (!clientId) {
      return {
        success: false,
        error: 'wechat reverse tunnel client id is required'
      }
    }
    if (!this.tunnelBroker) {
      return {
        success: false,
        error: 'wechat reverse tunnel broker is unavailable'
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      const token = normalizeString(options.apiToken)
      if (token) {
        headers.token = token
      }

      const response = await this.tunnelBroker.sendHttpRequest({
        clientId,
        method: 'POST',
        path,
        headers,
        body: JSON.stringify(body),
        timeoutMs: normalizeTimeoutMs(options.timeoutMs)
      })
      return this.resolveHttpResult(response.status, response.status >= 200 && response.status < 300, response.text)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private parsePayload(text: string): unknown {
    if (!text) {
      return null
    }
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  private resolveHttpResult(status: number, ok: boolean, text: string): WechatPersonalSendResult {
    const payload = this.parsePayload(text)
    if (!ok) {
      return {
        success: false,
        error: `wx2.0 HTTP ${status}`,
        raw: payload
      }
    }

    const code = this.resolveResponseCode(payload)
    if (typeof code === 'number' && code !== 0 && code !== 200) {
      return {
        success: false,
        error: this.resolveResponseText(payload) || `wx2.0 returned code ${code}`,
        raw: payload
      }
    }

    return {
      success: true,
      messageId: this.resolveMessageId(payload),
      raw: payload
    }
  }

  private resolveResponseCode(payload: unknown): number | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }
    const record = payload as Record<string, unknown>
    const value = record.code ?? record.Code
    return typeof value === 'number' ? value : undefined
  }

  private resolveResponseText(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return typeof payload === 'string' ? payload : undefined
    }
    const record = payload as Record<string, unknown>
    return normalizeString(record.text || record.Text || record.message || record.Message) || undefined
  }

  private resolveMessageId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }
    const record = payload as Record<string, unknown>
    const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
    return normalizeString(data.newmsgid || data.newMsgId || data.messageId || data.msgid) || undefined
  }
}
