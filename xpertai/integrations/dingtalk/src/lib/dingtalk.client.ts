import axios, { AxiosInstance } from 'axios'
import { createHmac } from 'crypto'
import { IIntegration } from '@metad/contracts'
import {
  TIntegrationDingTalkOptions,
  normalizeDingTalkRobotCode,
  parseDingTalkClientError,
  formatDingTalkErrorToMarkdown
} from './types.js'

type DingTalkRecipient = {
  type: 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email'
  id: string
}

type SendMessageInput = {
  recipient: DingTalkRecipient
  msgType: 'text' | 'markdown' | 'interactive'
  content: Record<string, unknown>
  timeoutMs?: number
  sessionWebhook?: string | null
  allowFallback?: boolean
  robotCodeOverride?: string
}

type DingTalkListResultItem = {
  id: string
  name: string
  avatar?: string
}

type NormalizedInteractiveButton = {
  title: string
  url?: string
  value?: string
}

type NormalizedInteractiveCard = {
  title: string
  markdown: string
  buttons: NormalizedInteractiveButton[]
}

type ParsedTemplatePayload = {
  msgKey: string
  msgParam: Record<string, unknown>
}

export class DingTalkClient {
  private readonly options: TIntegrationDingTalkOptions
  private readonly integrationId: string
  private readonly apiBaseUrl: string
  private readonly legacyApiBaseUrl: string
  private readonly http: AxiosInstance

  private cachedToken: {
    token: string
    expiredAt: number
  } | null = null

  constructor(integration: IIntegration<TIntegrationDingTalkOptions>) {
    this.integrationId = integration.id
    this.options = this.normalizeOptions(integration.options)
    this.apiBaseUrl = this.options.apiBaseUrl || 'https://api.dingtalk.com'
    this.legacyApiBaseUrl = this.options.legacyApiBaseUrl || 'https://oapi.dingtalk.com'
    this.http = axios.create({ timeout: 15_000 })
  }

  private normalizeOptions(options: TIntegrationDingTalkOptions): TIntegrationDingTalkOptions {
    const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
    return {
      ...options,
      clientId: trim(options?.clientId),
      clientSecret: trim(options?.clientSecret),
      robotCode: trim(options?.robotCode) || undefined,
      callbackToken: trim(options?.callbackToken) || undefined,
      callbackAesKey: trim(options?.callbackAesKey) || undefined,
      appKey: trim(options?.appKey) || undefined,
      webhookAccessToken: trim(options?.webhookAccessToken) || undefined,
      webhookSignSecret: trim(options?.webhookSignSecret) || undefined,
      apiBaseUrl: trim(options?.apiBaseUrl) || options?.apiBaseUrl,
      legacyApiBaseUrl: trim(options?.legacyApiBaseUrl) || options?.legacyApiBaseUrl
    }
  }

  private ensureCredentials() {
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new Error('DingTalk clientId/clientSecret is required')
    }
  }

  async getAccessToken(force = false): Promise<string> {
    this.ensureCredentials()

    const now = Date.now()
    if (!force && this.cachedToken && now < this.cachedToken.expiredAt) {
      return this.cachedToken.token
    }

    try {
      const { data } = await this.http.post(
        `${this.apiBaseUrl}/v1.0/oauth2/accessToken`,
        {
          appKey: this.options.clientId,
          appSecret: this.options.clientSecret
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      const token = data?.accessToken
      if (!token) {
        throw new Error('Missing accessToken in DingTalk response')
      }

      const expiresIn = Number(data?.expireIn || 7200)
      this.cachedToken = {
        token,
        expiredAt: now + Math.max(300, expiresIn - 120) * 1000
      }

      return token
    } catch (error) {
      throw new Error(`Failed to get DingTalk access token: ${formatDingTalkErrorToMarkdown(parseDingTalkClientError(error))}`)
    }
  }

  private async requestV1<T = any>(params: {
    method: 'GET' | 'POST'
    path: string
    data?: any
    timeoutMs?: number
  }): Promise<T> {
    const token = await this.getAccessToken()
    const { data } = await this.http.request<T>({
      url: `${this.apiBaseUrl}${params.path}`,
      method: params.method,
      data: params.data,
      timeout: params.timeoutMs || 15_000,
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token
      }
    })
    return data
  }

  private async requestLegacy<T = any>(params: {
    path: string
    data?: any
    timeoutMs?: number
  }): Promise<T> {
    const token = await this.getLegacyToken()
    const { data } = await this.http.post<T>(
      `${this.legacyApiBaseUrl}${params.path}?access_token=${encodeURIComponent(token)}`,
      params.data || {},
      {
        timeout: params.timeoutMs || 15_000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    return data
  }

  private async getLegacyToken(): Promise<string> {
    this.ensureCredentials()
    const { data } = await this.http.get(`${this.legacyApiBaseUrl}/gettoken`, {
      params: {
        appkey: this.options.clientId,
        appsecret: this.options.clientSecret
      }
    })

    if (data?.errcode && data.errcode !== 0) {
      throw new Error(`Failed to get legacy DingTalk token: ${data?.errmsg || data?.errcode}`)
    }

    if (!data?.access_token) {
      throw new Error('Missing legacy access_token in DingTalk response')
    }

    return data.access_token
  }

  private resolveWebhookUrl(): string | null {
    if (!this.options.webhookAccessToken) {
      return null
    }

    const base = `${this.legacyApiBaseUrl}/robot/send?access_token=${encodeURIComponent(
      this.options.webhookAccessToken
    )}`

    if (!this.options.webhookSignSecret) {
      return base
    }

    const timestamp = Date.now()
    const signContent = `${timestamp}\n${this.options.webhookSignSecret}`
    const sign = createHmac('sha256', this.options.webhookSignSecret)
      .update(signContent)
      .digest('base64')

    return `${base}&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
  }

  private truncateMarkdownText(text: string, maxLen = 5000): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen - 20) + '\n\n...(内容过长已截断)'
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
  }

  private stringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private resolveRobotCode(override?: string | null): string {
    return normalizeDingTalkRobotCode(override) || normalizeDingTalkRobotCode(this.options.robotCode) || ''
  }

  private extractCustomMessageTemplate(content: Record<string, unknown>): { msgKey: string; msgParam: string } | null {
    const msgKey = this.stringOrEmpty((content as any)?.msgKey)
    if (!msgKey) {
      return null
    }

    const msgParamRaw = (content as any)?.msgParam ?? (content as any)?.msgParams ?? (content as any)?.params
    if (msgParamRaw == null) {
      return null
    }

    const msgParam = typeof msgParamRaw === 'string' ? msgParamRaw : JSON.stringify(msgParamRaw)
    if (!msgParam.trim()) {
      return null
    }

    return {
      msgKey,
      msgParam
    }
  }

  private parseTemplatePayload(content: Record<string, unknown>): ParsedTemplatePayload | null {
    const msgKey = this.stringOrEmpty((content as any)?.msgKey)
    if (!msgKey) {
      return null
    }

    const raw = (content as any)?.msgParam ?? (content as any)?.msgParams ?? (content as any)?.params
    if (raw == null) {
      return null
    }

    if (this.isPlainObject(raw)) {
      return {
        msgKey,
        msgParam: raw
      }
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) {
        return null
      }
      try {
        const parsed = JSON.parse(trimmed)
        if (this.isPlainObject(parsed)) {
          return {
            msgKey,
            msgParam: parsed
          }
        }
      } catch {
        // ignore malformed template json
      }
    }

    return null
  }

  private buildWebhookPayloadFromTemplate(content: Record<string, unknown>): Record<string, unknown> | null {
    const template = this.parseTemplatePayload(content)
    if (!template) {
      return null
    }

    const msgKey = template.msgKey
    const msgParam = template.msgParam
    const normalizedKey = msgKey.toLowerCase()

    if (normalizedKey === 'sampletext') {
      return {
        msgtype: 'text',
        text: {
          content: String(msgParam.content ?? msgParam.text ?? '')
        }
      }
    }

    if (normalizedKey === 'samplemarkdown') {
      return {
        msgtype: 'markdown',
        markdown: {
          title: String(msgParam.title ?? 'Xpert Notification'),
          text: this.truncateMarkdownText(String(msgParam.text ?? msgParam.markdown ?? ''))
        }
      }
    }

    const actionCardMatch = normalizedKey.match(/^sampleactioncard(\d+)?$/)
    if (actionCardMatch) {
      const count = Number(actionCardMatch[1] || 1)
      const buttons = Array.from({ length: Math.max(1, Math.min(5, count || 1)) })
        .map((_, index) => {
          const i = index + 1
          const title = this.stringOrEmpty((msgParam as any)[`actionTitle${i}`]) || `Action ${i}`
          const actionURL = this.stringOrEmpty((msgParam as any)[`actionURL${i}`]) || 'https://xpert.cn/'
          return { title, actionURL }
        })
        .filter((item) => !!item.actionURL)

      if (buttons.length > 1) {
        return {
          msgtype: 'actionCard',
          actionCard: {
            title: String(msgParam.title ?? 'Xpert Notification'),
            text: this.truncateMarkdownText(String(msgParam.markdown ?? msgParam.text ?? '')),
            btnOrientation: '0',
            btns: buttons
          }
        }
      }

      const first = buttons[0]
      return {
        msgtype: 'actionCard',
        actionCard: {
          title: String(msgParam.title ?? 'Xpert Notification'),
          text: this.truncateMarkdownText(String(msgParam.markdown ?? msgParam.text ?? '')),
          singleTitle: first?.title || 'View',
          singleURL: first?.actionURL || 'https://xpert.cn/'
        }
      }
    }

    return null
  }

  private extractElementText(element: Record<string, unknown>): string {
    const tag = this.stringOrEmpty(element.tag ?? element.type).toLowerCase()
    if (!tag) {
      return ''
    }

    if (tag === 'hr') {
      return '---'
    }

    if (tag === 'markdown' || tag === 'text') {
      const content = this.stringOrEmpty(element.content)
      return this.sanitizeFallbackText(content)
    }

    if (tag === 'div') {
      const lines: string[] = []
      const text = element.text
      if (typeof text === 'string') {
        const normalized = this.sanitizeFallbackText(text)
        if (normalized) {
          lines.push(normalized)
        }
      } else if (this.isPlainObject(text)) {
        const normalized = this.sanitizeFallbackText(this.stringOrEmpty((text as any).content || (text as any).text))
        if (normalized) {
          lines.push(normalized)
        }
      }

      const fields = Array.isArray((element as any).fields) ? ((element as any).fields as unknown[]) : []
      for (const field of fields) {
        if (!this.isPlainObject(field)) {
          continue
        }
        const fieldText = (field as any).text
        if (typeof fieldText === 'string') {
          const normalized = this.sanitizeFallbackText(fieldText)
          if (normalized) {
            lines.push(normalized)
          }
        } else if (this.isPlainObject(fieldText)) {
          const normalized = this.sanitizeFallbackText(this.stringOrEmpty((fieldText as any).content || (fieldText as any).text))
          if (normalized) {
            lines.push(normalized)
          }
        }
      }

      return lines.join('\n')
    }

    if (tag === 'note') {
      const lines: string[] = []
      const children = Array.isArray((element as any).elements) ? ((element as any).elements as unknown[]) : []
      for (const child of children) {
        if (!this.isPlainObject(child)) {
          continue
        }
        const text = this.sanitizeFallbackText(this.stringOrEmpty((child as any).content || (child as any).text))
        if (text) {
          lines.push(text)
        }
      }
      return lines.join('\n')
    }

    return ''
  }

  private extractInteractiveButtons(content: Record<string, unknown>): NormalizedInteractiveButton[] {
    const sourceActions: unknown[] = []
    if (Array.isArray((content as any)?.actions)) {
      sourceActions.push(...(content as any).actions)
    }

    const elements = Array.isArray((content as any)?.elements) ? ((content as any).elements as unknown[]) : []
    for (const element of elements) {
      if (!this.isPlainObject(element)) {
        continue
      }
      const tag = this.stringOrEmpty((element as any).tag ?? (element as any).type).toLowerCase()
      if (tag !== 'action') {
        continue
      }
      const actions = Array.isArray((element as any).actions) ? ((element as any).actions as unknown[]) : []
      sourceActions.push(...actions)
    }

    const buttons: NormalizedInteractiveButton[] = []
    for (const action of sourceActions) {
      if (!this.isPlainObject(action)) {
        continue
      }
      const textNode = (action as any).text
      const title =
        this.sanitizeFallbackText(
          this.stringOrEmpty(
            this.isPlainObject(textNode)
              ? (textNode as any).content || (textNode as any).text
              : textNode || (action as any).title || (action as any).label
          )
        ) || 'View'
      const url = this.stringOrEmpty(
        (action as any).url ||
          (action as any).href ||
          (action as any).link ||
          (action as any).actionURL ||
          (action as any)?.multi_url?.url
      )
      const value = this.stringOrEmpty((action as any).value)

      buttons.push({
        title,
        ...(url ? { url } : {}),
        ...(value ? { value } : {})
      })
    }

    return buttons
  }

  private resolveButtonUrl(button: NormalizedInteractiveButton | undefined): string {
    if (button?.url) {
      return button.url
    }
    if (button?.value) {
      return `https://xpert.cn/dingtalk-action?value=${encodeURIComponent(button.value)}`
    }
    return 'https://xpert.cn/'
  }

  private normalizeInteractiveCard(content: Record<string, unknown>): NormalizedInteractiveCard {
    const header = this.isPlainObject((content as any)?.header) ? ((content as any).header as Record<string, unknown>) : null

    const directTitle = this.sanitizeFallbackText(this.stringOrEmpty((content as any).title))
    const headerTitle =
      header && this.isPlainObject((header as any).title)
        ? this.sanitizeFallbackText(this.stringOrEmpty((header as any).title?.content || (header as any).title?.text))
        : ''
    const headerSubtitle =
      header && this.isPlainObject((header as any).subtitle)
        ? this.sanitizeFallbackText(this.stringOrEmpty((header as any).subtitle?.content || (header as any).subtitle?.text))
        : ''

    const title = directTitle || headerTitle || 'Xpert Notification'

    const directText = this.sanitizeFallbackText(
      this.stringOrEmpty((content as any).markdown || (content as any).text || (content as any).content)
    )

    const lines: string[] = []
    if (headerSubtitle) {
      lines.push(headerSubtitle)
    }

    const elements = Array.isArray((content as any)?.elements) ? ((content as any).elements as unknown[]) : []
    for (const element of elements) {
      if (!this.isPlainObject(element)) {
        continue
      }
      const text = this.extractElementText(element)
      if (text) {
        lines.push(text)
      }
    }

    const markdown = this.truncateMarkdownText((directText || lines.join('\n')).trim() || '收到消息，正在处理中...')
    const buttons = this.extractInteractiveButtons(content)

    return {
      title,
      markdown,
      buttons
    }
  }

  private buildSampleActionCardPayload(content: Record<string, unknown>): { msgKey: string; msgParam: string } {
    const card = this.normalizeInteractiveCard(content)
    const buttonCount = Math.min(card.buttons.length, 6)

    if (buttonCount <= 1) {
      const button = card.buttons[0]
      return {
        msgKey: 'sampleActionCard',
        msgParam: JSON.stringify({
          title: card.title,
          markdown: card.markdown,
          singleTitle: button?.title || 'View',
          singleURL: this.resolveButtonUrl(button)
        })
      }
    }

    const msgKey = `sampleActionCard${buttonCount}`
    const msgParam: Record<string, unknown> = {
      title: card.title,
      markdown: card.markdown
    }

    for (let i = 0; i < buttonCount; i++) {
      const button = card.buttons[i]
      const index = i + 1
      msgParam[`actionTitle${index}`] = button?.title || `Action ${index}`
      msgParam[`actionURL${index}`] = this.resolveButtonUrl(button)
    }

    return {
      msgKey,
      msgParam: JSON.stringify(msgParam)
    }
  }

  private buildRobotWebhookPayload(
    msgType: SendMessageInput['msgType'],
    content: Record<string, unknown>
  ): Record<string, unknown> {
    const templatePayload = this.buildWebhookPayloadFromTemplate(content)
    if (templatePayload) {
      return templatePayload
    }

    if (msgType === 'interactive') {
      const card = this.normalizeInteractiveCard(content)
      const buttonCount = Math.min(card.buttons.length, 5)
      if (buttonCount > 1) {
        return {
          msgtype: 'actionCard',
          actionCard: {
            title: card.title,
            text: card.markdown,
            btnOrientation: '0',
            btns: card.buttons.slice(0, buttonCount).map((button) => ({
              title: button.title || 'View',
              actionURL: this.resolveButtonUrl(button)
            }))
          }
        }
      }

      const button = card.buttons[0]
      return {
        msgtype: 'actionCard',
        actionCard: {
          title: card.title,
          text: card.markdown,
          singleTitle: button?.title || 'View',
          singleURL: this.resolveButtonUrl(button)
        }
      }
    }

    if (msgType === 'text') {
      return {
        msgtype: 'text',
        text: {
          content: String(content.text ?? '')
        }
      }
    }

    return {
      msgtype: 'markdown',
      markdown: {
        title: String(content.title ?? 'Xpert Notification'),
        text: this.truncateMarkdownText(String(content.text ?? content.markdown ?? this.resolveInteractiveFallbackText(content)))
      }
    }
  }

  private resolveInteractiveFallbackText(content: Record<string, unknown>): string {
    const template = this.parseTemplatePayload(content)
    if (template) {
      const normalizedKey = template.msgKey.toLowerCase()
      if (normalizedKey === 'samplemarkdown') {
        return this.sanitizeFallbackText(String(template.msgParam.text ?? template.msgParam.markdown ?? '').trim())
      }
      if (normalizedKey === 'sampletext') {
        return this.sanitizeFallbackText(String(template.msgParam.content ?? template.msgParam.text ?? '').trim())
      }
      if (normalizedKey.startsWith('sampleactioncard')) {
        return this.sanitizeFallbackText(String(template.msgParam.markdown ?? template.msgParam.text ?? '').trim())
      }
    }

    return this.normalizeInteractiveCard(content).markdown
  }

  private sanitizeFallbackText(text: string): string {
    if (!text) {
      return ''
    }
    return text
      .replace(/<text_tag[^>]*>([\s\S]*?)<\/text_tag>/gi, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private formatError(error: unknown): string {
    return formatDingTalkErrorToMarkdown(parseDingTalkClientError(error))
  }

  private async sendBySessionWebhook(params: {
    sessionWebhook: string
    msgType: 'text' | 'markdown' | 'interactive'
    content: Record<string, unknown>
    timeoutMs?: number
  }): Promise<{ messageId?: string | null; degraded?: boolean }> {
    const payload = this.buildRobotWebhookPayload(params.msgType, params.content)
    const { data } = await this.http.post(params.sessionWebhook, payload, {
      timeout: params.timeoutMs || 15_000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (data?.errcode && data.errcode !== 0) {
      throw new Error(`DingTalk session webhook send failed: ${data?.errmsg || data?.errcode}`)
    }

    return {
      messageId: data?.messageId || null,
      degraded: true
    }
  }

  private async sendByWebhook(params: {
    msgType: 'text' | 'markdown' | 'interactive'
    content: Record<string, unknown>
    timeoutMs?: number
  }): Promise<{ messageId?: string | null; degraded?: boolean }> {
    const webhookUrl = this.resolveWebhookUrl()
    if (!webhookUrl) {
      throw new Error('No DingTalk webhookAccessToken configured for webhook fallback')
    }

    const payload = this.buildRobotWebhookPayload(params.msgType, params.content)

    const { data } = await this.http.post(webhookUrl, payload, {
      timeout: params.timeoutMs || 15_000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (data?.errcode && data.errcode !== 0) {
      throw new Error(`DingTalk webhook send failed: ${data?.errmsg || data?.errcode}`)
    }

    return {
      messageId: null,
      degraded: true
    }
  }

  async sendMessage(input: SendMessageInput): Promise<{ messageId?: string | null; degraded?: boolean }> {
    let primaryError: unknown = null
    const allowFallback = input.allowFallback !== false

    try {
      const payload = this.buildMessagePayload(input.msgType, input.content)

      if (input.recipient.type === 'chat_id') {
        return await this.sendGroupMessage(input.recipient.id, payload, input.robotCodeOverride, input.timeoutMs)
      }

      if (['open_id', 'user_id', 'union_id', 'email'].includes(input.recipient.type)) {
        return await this.sendUserMessage(input.recipient, payload, input.robotCodeOverride, input.timeoutMs)
      }
    } catch (error) {
      primaryError = error
    }

    if (!allowFallback) {
      const errorMessage = primaryError
        ? this.formatError(primaryError)
        : 'Primary send path was not available.'
      throw new Error(`DingTalk send failed on primary path (fallback disabled). ${errorMessage}`)
    }

    if (input.sessionWebhook) {
      try {
        const sessionFallback = await this.sendBySessionWebhook({
          sessionWebhook: input.sessionWebhook,
          msgType: input.msgType,
          content: input.content,
          timeoutMs: input.timeoutMs
        })
        return {
          ...sessionFallback,
          degraded: true
        }
      } catch (sessionError) {
        primaryError = primaryError || sessionError
      }
    }

    if (this.options.webhookAccessToken) {
      const webhookFallback = await this.sendByWebhook({
        msgType: input.msgType,
        content: input.content,
        timeoutMs: input.timeoutMs
      })
      return {
        ...webhookFallback,
        degraded: true
      }
    }

    const errorMessage = primaryError
      ? this.formatError(primaryError)
      : 'Primary send path was not available and no fallback was configured.'
    throw new Error(
      `DingTalk send failed and no fallback is configured. Configure robotCode or sessionWebhook/webhookAccessToken. ${errorMessage}`
    )
  }

  private buildMessagePayload(msgType: SendMessageInput['msgType'], content: Record<string, unknown>) {
    if (msgType === 'text') {
      return {
        msgKey: 'sampleText',
        msgParam: JSON.stringify({
          content: String(content.text ?? '')
        })
      }
    }

    if (msgType === 'markdown') {
      const text = this.truncateMarkdownText(String(content.markdown ?? content.text ?? ''))
      return {
        msgKey: 'sampleMarkdown',
        msgParam: JSON.stringify({
          title: String(content.title ?? 'Xpert Notification'),
          text
        })
      }
    }

    const customTemplate = this.extractCustomMessageTemplate(content)
    if (customTemplate) {
      return customTemplate
    }

    return this.buildSampleActionCardPayload(content)
  }

  private inferMessageTypeForUpdate(content: Record<string, unknown>): SendMessageInput['msgType'] {
    const hasElements = Array.isArray((content as any)?.elements)
    const hasHeader = !!(content as any)?.header
    if (hasElements || hasHeader) {
      return 'interactive'
    }

    const markdown = String((content as any)?.markdown ?? '').trim()
    const text = String((content as any)?.text ?? '').trim()
    if (markdown && !text) {
      return 'markdown'
    }
    if (text && !markdown) {
      return 'text'
    }
    if (markdown || text) {
      return 'interactive'
    }

    return 'interactive'
  }

  private async sendGroupMessage(
    openConversationId: string,
    payload: { msgKey: string; msgParam: string },
    robotCodeOverride?: string | null,
    timeoutMs?: number
  ): Promise<{ messageId?: string | null; degraded?: boolean }> {
    const robotCode = this.resolveRobotCode(robotCodeOverride)
    if (!robotCode) {
      throw new Error('robotCode is required for group message send')
    }

    let result: any
    try {
      result = await this.requestV1({
        method: 'POST',
        path: '/v1.0/robot/groupMessages/send',
        timeoutMs,
        data: {
          robotCode,
          openConversationId,
          ...payload
        }
      })
    } catch (error) {
      const maskedRobotCode =
        robotCode.length > 6
          ? `${robotCode.slice(0, 3)}***${robotCode.slice(-3)}`
          : robotCode
      const maskedConversationId =
        openConversationId.length > 10
          ? `${openConversationId.slice(0, 4)}***${openConversationId.slice(-4)}`
          : openConversationId
      const detail = this.formatError(error)
      throw new Error(
        `groupMessages/send failed (robotCode=${maskedRobotCode}, openConversationId=${maskedConversationId}). ${detail}`
      )
    }

    return {
      messageId: result?.processQueryKey || result?.messageId || null,
      degraded: false
    }
  }

  private async sendUserMessage(
    recipient: DingTalkRecipient,
    payload: { msgKey: string; msgParam: string },
    robotCodeOverride?: string | null,
    timeoutMs?: number
  ): Promise<{ messageId?: string | null; degraded?: boolean }> {
    const robotCode = this.resolveRobotCode(robotCodeOverride)
    if (!robotCode) {
      throw new Error('robotCode is required for user message send')
    }

    const recipientPayload =
      recipient.type === 'open_id'
        ? { openIds: [recipient.id] }
        : recipient.type === 'union_id'
          ? { unionIds: [recipient.id] }
          : recipient.type === 'email'
            ? { emails: [recipient.id] }
            : { userIds: [recipient.id] }

    const result: any = await this.requestV1({
      method: 'POST',
      path: '/v1.0/robot/oToMessages/batchSend',
      timeoutMs,
      data: {
        robotCode,
        ...recipientPayload,
        ...payload
      }
    })

    return {
      messageId: result?.processQueryKey || result?.taskId || null,
      degraded: false
    }
  }

  async updateMessage(params: {
    messageId: string
    content: Record<string, unknown>
    timeoutMs?: number
    sessionWebhook?: string | null
    silentOnFailure?: boolean
  }): Promise<{ success: boolean; degraded?: boolean; messageId?: string | null }> {
    try {
      const msgType = this.inferMessageTypeForUpdate(params.content)
      const payload = this.buildMessagePayload(msgType, params.content)
      const result: any = await this.requestV1({
        method: 'POST',
        path: '/v1.0/robot/groupMessages/update',
        timeoutMs: params.timeoutMs,
        data: {
          processQueryKey: params.messageId,
          ...payload
        }
      })

      return {
        success: result?.success !== false,
        messageId: params.messageId
      }
    } catch {
      if (params.silentOnFailure) {
        return {
          success: false,
          degraded: true,
          messageId: params.messageId || null
        }
      }

      if (params.sessionWebhook) {
        try {
          const sessionFallback = await this.sendBySessionWebhook({
            sessionWebhook: params.sessionWebhook,
            msgType: 'interactive',
            content: params.content,
            timeoutMs: params.timeoutMs
          })
          return {
            success: true,
            degraded: true,
            messageId: sessionFallback.messageId || null
          }
        } catch {}
      }

      if (this.options.webhookAccessToken) {
        try {
          const fallback = await this.sendByWebhook({
            msgType: 'interactive',
            content: params.content,
            timeoutMs: params.timeoutMs
          })
          return {
            success: true,
            degraded: true,
            messageId: fallback.messageId
          }
        } catch {}
      }

      return {
        success: false,
        degraded: true,
        messageId: params.messageId || null
      }
    }
  }

  async recallMessage(params: {
    messageId: string
    robotCodeOverride?: string | null
    timeoutMs?: number
  }): Promise<{ success: boolean; degraded?: boolean }> {
    const robotCode = this.resolveRobotCode(params.robotCodeOverride)
    if (!robotCode) {
      throw new Error('robotCode is required for message recall')
    }

    try {
      const processQueryKeys = [params.messageId]
      const result: any = await this.requestV1({
        method: 'POST',
        path: '/v1.0/robot/otoMessages/batchRecall',
        timeoutMs: params.timeoutMs,
        data: {
          robotCode,
          processQueryKeys
        }
      })

      const failedResult = result?.failedResult ?? {}
      const failedReason =
        typeof failedResult?.[params.messageId] === 'string'
          ? failedResult[params.messageId]
          : typeof failedResult?.[0] === 'string'
            ? failedResult[0]
            : ''
      if (failedReason) {
        throw new Error(`oto recall failed: ${failedReason}`)
      }
      return {
        success: true
      }
    } catch (error) {
      throw new Error(`DingTalk recall message failed: oto recall: ${this.formatError(error)}`)
    }
  }

  async listUsers(params: {
    keyword?: string | null
    pageSize?: number
    pageToken?: string | null
    timeoutMs?: number
  }): Promise<{ items: DingTalkListResultItem[]; nextPageToken?: string | null }> {
    const result: any = await this.requestLegacy({
      path: '/topapi/v2/user/list',
      timeoutMs: params.timeoutMs,
      data: {
        dept_id: 1,
        cursor: Number(params.pageToken || 0),
        size: params.pageSize || 20
      }
    })

    if (result?.errcode && result.errcode !== 0) {
      throw new Error(`DingTalk list users failed: ${result?.errmsg || result?.errcode}`)
    }

    const rawList = result?.result?.list || []
    const keyword = params.keyword?.trim().toLowerCase()
    const items = (Array.isArray(rawList) ? rawList : [])
      .map((item: any) => ({
        id: item.userid || item.unionid || item.mobile,
        name: item.name || item.mobile || item.userid,
        avatar: item.avatar
      }))
      .filter((item: DingTalkListResultItem) => !!item.id)
      .filter((item: DingTalkListResultItem) =>
        keyword ? item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword) : true
      )

    return {
      items,
      nextPageToken:
        typeof result?.result?.next_cursor === 'number' ? String(result.result.next_cursor) : null
    }
  }

  async listChats(params: {
    keyword?: string | null
    pageSize?: number
    pageToken?: string | null
    timeoutMs?: number
  }): Promise<{ items: DingTalkListResultItem[]; nextPageToken?: string | null }> {
    const legacyPayload = {
      cursor: Number(params.pageToken || 0),
      size: params.pageSize || 20
    }

    let result: any
    try {
      result = await this.requestLegacy({
        path: '/topapi/im/chat/scenegroup/list',
        timeoutMs: params.timeoutMs,
        data: legacyPayload
      })
    } catch (error) {
      const message = String((error as Error)?.message || '')
      if (!message.includes('Invalid method')) {
        throw error
      }

      // Some tenants only have legacy chat list API enabled.
      result = await this.requestLegacy({
        path: '/chat/list',
        timeoutMs: params.timeoutMs,
        data: {
          offset: Number(params.pageToken || 0),
          size: params.pageSize || 20
        }
      })
    }

    if (result?.errcode && result.errcode !== 0) {
      throw new Error(`DingTalk list chats failed: ${result?.errmsg || result?.errcode}`)
    }

    const rawList = result?.result?.chat_list || result?.chat_list || []
    const keyword = params.keyword?.trim().toLowerCase()
    const items = (Array.isArray(rawList) ? rawList : [])
      .map((item: any) => ({
        id: item.open_conversation_id || item.openConversationId || item.chatid,
        name: item.title || item.name || item.chatid,
        avatar: item.icon
      }))
      .filter((item: DingTalkListResultItem) => !!item.id)
      .filter((item: DingTalkListResultItem) =>
        keyword ? item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword) : true
      )

    return {
      items,
      nextPageToken:
        typeof result?.result?.next_cursor === 'number'
          ? String(result.result.next_cursor)
          : typeof result?.next_cursor === 'number'
            ? String(result.next_cursor)
            : null
    }
  }

  async healthcheck(): Promise<{ ok: boolean; webhookUrl?: string }> {
    await this.getAccessToken()
    return {
      ok: true,
      webhookUrl: this.options.httpCallbackEnabled
        ? `/api/dingtalk/webhook/${this.integrationId}`
        : undefined
    }
  }
}
