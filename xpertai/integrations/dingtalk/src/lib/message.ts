import { Serializable } from '@langchain/core/load/serializable'
import { I18nObject, IChatMessage, TSensitiveOperation, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import type { DingTalkEventRenderItem, DingTalkRenderItem } from './handoff/dingtalk-chat.types.js'
import { translate } from './i18n.js'
import type { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'
import { resolveConversationUserKey } from './conversation-user-key.js'
import { ChatDingTalkContext, DINGTALK_CONFIRM, DINGTALK_END_CONVERSATION, DINGTALK_REJECT, DingTalkRenderElement, DingTalkStructuredElement, TDingTalkConversationStatus } from './types.js'

export type ChatDingTalkMessageStatus = IChatMessage['status'] | 'continuing' | 'waiting' | 'done' | TDingTalkConversationStatus

export interface ChatDingTalkMessageFields {
  // ID of dingtalk message
  id: string
  // ID of IChatMessage
  messageId: string
  // Status of dingtalk message
  status: ChatDingTalkMessageStatus
  language: string
  header: any
  elements: DingTalkRenderElement[]
}

type DingTalkMessageChannel = Pick<
  DingTalkChannelStrategy,
  'interactiveMessage' | 'patchInteractiveMessage' | 'deleteMessage'
>

export class ChatDingTalkMessage extends Serializable implements ChatDingTalkMessageFields {
  lc_namespace: string[] = ['dingtalk']
  override lc_serializable = true

  override get lc_attributes() {
    return {
      status: this.status,
      id: this.id,
      messageId: this.messageId,
      header: this.header,
      elements: this.elements,
      language: this.language
    }
  }

  static readonly headerTemplate = 'indigo'
  static readonly logoImgKey = 'img_v3_02v2_ea22de8a-06c9-4e0e-a0da-9e2b22f5de2g'
  static readonly logoIcon = {
    tag: 'custom_icon',
    img_key: ChatDingTalkMessage.logoImgKey,
    corner_radius: '30%'
  }
  static readonly helpUrl = 'https://docs.xpertai.cn/en/ai/toolset/chatbi-toolset/bot'

  private readonly logger = new Logger(ChatDingTalkMessage.name)

  // ID of dingtalk message
  public id: string = null
  // private prevStatus: ChatDingTalkMessageStatus = null
  public status: ChatDingTalkMessageStatus = 'thinking'
  // ID of IChatMessage
  public messageId: string
  public language: string

  get dingtalkChannel() {
    return this.chatContext.dingtalkChannel
  }

  get integrationId() {
    return this.chatContext.integrationId
  }

  get chatId() {
    return this.chatContext.chatId
  }

  get dingtalkUserId() {
    return this.chatContext.userId
  }

  /**
   * Get DingTalk sender's open_id for @mention and private message
   */
  get senderOpenId() {
    return this.chatContext.senderOpenId
  }

  get sessionWebhook() {
    return this.chatContext.sessionWebhook
  }

  get robotCode() {
    return (this.chatContext as any).robotCode
  }

  public header = null
  public elements: DingTalkRenderElement[] = []
  private degradedWithoutMessageId = false
  private terminalDelivered = false
  set renderItems(value: DingTalkRenderItem[]) {
    this.elements = this.serializeRenderItems(value)
  }

  constructor(
    private chatContext: ChatDingTalkContext & { dingtalkChannel: DingTalkMessageChannel },
    private options: {
      text?: string
      degradedWithoutMessageId?: boolean
      terminalDelivered?: boolean
    } & Partial<ChatDingTalkMessageFields>
  ) {
    super(options)
    this.id = options.id
    this.messageId = options.messageId
    this.status = options.status
    this.language = options.language
    this.header = options.header
    this.elements = options.elements ?? []
    this.degradedWithoutMessageId = options.degradedWithoutMessageId === true
    this.terminalDelivered = options.terminalDelivered === true
  }

  async getTitle() {
    const status = await this.translate('integration.DingTalk.Status_' + this.status, { lng: this.language })
    switch (this.status) {
      case 'thinking':
        return status
      case 'continuing':
        return status
      case 'waiting':
        return status
      case 'interrupted':
        return status
      default:
        return ''
    }
  }

  getSubtitle() {
    return this.options.text
  }

  async getHeader() {
    const title = await this.getTitle()
    const subTitle = this.getSubtitle()
    return title || subTitle
      ? {
          title: {
            tag: 'plain_text',
            content: title
          },
          subtitle: {
            tag: 'plain_text',
            content: subTitle
          },
          template: ChatDingTalkMessage.headerTemplate,
          ud_icon: {
            token: 'myai_colorful',
            style: {
              color: 'red'
            }
          }
        }
      : null
  }

  async getCard() {
    const elements = [...this.elements]

    if (['end', 'error'].includes(this.status)) {
      if (elements[elements.length - 1]?.tag !== 'hr') {
        elements.push({ tag: 'hr' })
      }
      elements.push({
        tag: 'markdown',
        content: await this.translate('integration.DingTalk.ConversationEnded', { lng: this.language })
      })
    } else if (this.status !== 'done') {
      if (elements[elements.length - 1]?.tag !== 'hr') {
        elements.push({ tag: 'hr' })
      }
      elements.push(await this.getEndAction())
    }

    return {
      elements
    }
  }

  async getEndAction() {
    const endActionUrl = this.getEndActionUrl()
    return {
      tag: 'action',
      layout: 'default',
      actions: [
        ...(this.status === 'interrupted' ? await this.getInterruptedActions() : []),
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: await this.translate('integration.DingTalk.EndConversation', { lng: this.language })
          },
          type: 'text',
          complex_interaction: true,
          width: 'default',
          size: 'medium',
          ...(endActionUrl
            ? {
                multi_url: {
                  url: endActionUrl
                }
              }
            : {
                value: DINGTALK_END_CONVERSATION
              })
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: await this.translate('integration.DingTalk.HelpDoc', { lng: this.language })
          },
          type: 'text',
          complex_interaction: true,
          width: 'default',
          size: 'medium',
          multi_url: {
            url: ChatDingTalkMessage.helpUrl
          }
        }
      ]
    }
  }

  private getEndActionUrl(): string | null {
    const apiBaseUrl = typeof process.env.API_BASE_URL === 'string' ? process.env.API_BASE_URL.trim() : ''
    if (!apiBaseUrl) {
      return null
    }

    const conversationUserKey = resolveConversationUserKey({
      integrationId: this.integrationId,
      conversationId: this.chatId,
      senderOpenId: this.senderOpenId,
      fallbackUserId: this.dingtalkUserId
    })

    if (!conversationUserKey) {
      return null
    }

    const query = new URLSearchParams({
      integrationId: this.integrationId,
      conversationUserKey,
      action: DINGTALK_END_CONVERSATION
    })

    return `${apiBaseUrl}/api/dingtalk/action?${query.toString()}`
  }

  async getInterruptedActions() {
    return [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: await this.translate('integration.DingTalk.Confirm', { lng: this.language })
        },
        type: 'primary',
        width: 'default',
        size: 'medium',
        value: DINGTALK_CONFIRM
      },
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: await this.translate('integration.DingTalk.Reject', { lng: this.language })
        },
        type: 'danger',
        width: 'default',
        size: 'medium',
        value: DINGTALK_REJECT
      }
    ]
  }

  /**
   * Complete this message and a new message will be opened
   */
  async done() {
    await this.update({ status: 'done' })
  }

  /**
   * Ending a Session (Conversation)
   */
  async end() {
    await this.update({ status: 'end' })
  }

  /**
   * Reply to error message
   *
   * @param message Error message
   */
  async error(message: string) {
    await this.update({
      status: XpertAgentExecutionStatusEnum.ERROR,
      elements: [
        {
          tag: 'markdown',
          content: message
        }
      ]
    })
  }

  async update(options?: {
    status?: ChatDingTalkMessageStatus
    elements?: DingTalkRenderElement[]
    header?: any
    language?: string
    action?: (action) => void
  }) {
    if (options?.language) {
      this.language = options.language
    }
    if (options?.status) {
      this.status = options.status
    }
    if (options?.elements) {
      this.elements.push(...options.elements)
    }
    if (options?.header) {
      this.header = options.header
    }

    if (this.terminalDelivered) {
      return
    }

    // Do not send standalone "thinking" placeholder message.
    // DingTalk webhook fallback usually cannot patch the same message afterwards,
    // so placeholder delivery causes noisy extra messages.
    if (!this.id && this.status === 'thinking' && this.elements.length === 0) {
      return
    }

    const terminalUpdate = this.isTerminalStatus(this.status)
    if (this.degradedWithoutMessageId && !terminalUpdate) {
      return
    }

    const elements = await this.getCard()

    if (this.degradedWithoutMessageId && terminalUpdate) {
      if (this.id) {
        try {
          const terminalPatch = await this.dingtalkChannel.patchInteractiveMessage(
            this.chatContext.integrationId,
            this.id,
            {
              ...elements,
              header: this.header ?? (await this.getHeader())
            },
            this.chatContext.sessionWebhook,
            true
          )
          if ((terminalPatch as any)?.success !== false && (terminalPatch as any)?.degraded !== true) {
            this.terminalDelivered = true
            this.degradedWithoutMessageId = false
            return
          }
        } catch {
          // no-op: fallback to resend below
        }

        try {
          await this.dingtalkChannel.deleteMessage(this.chatContext.integrationId, this.id, {
            chatId: this.chatContext.chatId,
            robotCodeOverride: this.robotCode || null
          })
        } catch {
          // keep going: fallback resend still better than drop final answer
        }
      }

      const result = await this.dingtalkChannel.interactiveMessage(this.chatContext, {
        ...elements,
        header: this.header ?? (await this.getHeader())
      })
      const messageId = (result as any)?.data?.message_id || (result as any)?.messageId || null
      if (messageId) {
        this.id = messageId
      }
      this.terminalDelivered = true
      return
    }

    if (this.id) {
      try {
        const patchResult = await this.dingtalkChannel.patchInteractiveMessage(
          this.chatContext.integrationId,
          this.id,
          {
          ...elements,
          header: this.header ?? (await this.getHeader())
          },
          this.chatContext.sessionWebhook,
          true
        )

        if ((patchResult as any)?.degraded === true || (patchResult as any)?.success === false) {
          this.logger.warn(
            `Patch DingTalk message ${this.id} degraded(success=${String((patchResult as any)?.success)}, degraded=${String(
              (patchResult as any)?.degraded
            )}), switch to degraded mode`
          )
          this.degradedWithoutMessageId = true
        }
      } catch {
        this.logger.warn(`Failed to patch DingTalk message ${this.id}, switch to degraded mode`)
        this.degradedWithoutMessageId = true
      }
    } else {
      let result: any = null
      try {
        result = await this.dingtalkChannel.interactiveMessage(
          this.chatContext,
          {
            ...elements,
            header: this.header ?? (await this.getHeader())
          },
          {
            // For non-terminal streaming updates, avoid webhook fallback that cannot be patched,
            // otherwise users see a short partial message then a separate final message.
            allowFallback: terminalUpdate
          }
        )
      } catch (error) {
        if (!terminalUpdate) {
          this.logger.warn(
            `Skip non-terminal DingTalk send because primary path failed: ${String((error as Error)?.message || error)}`
          )
          this.degradedWithoutMessageId = true
          return
        }
        throw error
      }

      const messageId = (result as any)?.data?.message_id || (result as any)?.messageId || null
      if (messageId) {
        this.id = messageId
      } else if ((result as any)?.degraded === true) {
        // Session webhook fallback may not return message id, so interactive patch is impossible.
        // Avoid repeating intermediate "thinking" messages on every stream flush.
        this.degradedWithoutMessageId = true
      }
    }

    if (terminalUpdate) {
      this.terminalDelivered = true
    }
  }

  async confirm(operation: TSensitiveOperation) {
    await this.update({
      status: 'interrupted',
      elements: createConfirmMessage(operation)
    })
  }

  async translate(key: string, options?: Parameters<typeof translate>[1]) {
    return translate(key, options)
  }

  private serializeRenderItems(items: readonly DingTalkRenderItem[] | undefined): DingTalkRenderElement[] {
    const elements: DingTalkRenderElement[] = []
    for (const item of items ?? []) {
      const element = this.serializeRenderItem(item)
      if (element) {
        elements.push(element)
      }
    }
    return elements
  }

  private serializeRenderItem(item: DingTalkRenderItem): DingTalkRenderElement | null {
    switch (item.kind) {
      case 'stream_text': {
        const text = this.normalizeRenderableText(item.text)
        if (!text) {
          return null
        }
        return {
          tag: 'markdown',
          content: text
        }
      }
      case 'event':
        return {
          tag: 'markdown',
          content: this.serializeEventContent(item)
        }
      case 'structured': {
        if (
          item.element?.tag === 'markdown' &&
          this.isPlaceholderText(String((item.element as Record<string, unknown>).content ?? ''))
        ) {
          return null
        }
        return cloneStructuredElement(item.element)
      }
      default:
        return null
    }
  }

  private serializeEventContent(item: DingTalkEventRenderItem): string {
    const lines: string[] = []
    if (item.eventType) {
      lines.push(`**Event:** ${item.eventType}`)
    }
    if (item.tool) {
      lines.push(`**Tool:** ${item.tool}`)
    }
    if (item.title) {
      lines.push(`**Title:** ${item.title}`)
    }
    if (item.message) {
      lines.push(item.message)
    }
    if (item.status) {
      lines.push(`**Status:** ${item.status}`)
    }
    if (item.error) {
      lines.push(`**Error:** ${item.error}`)
    }
    return lines.join('\n')
  }

  private normalizeRenderableText(value: string): string {
    return value
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => !this.isPlaceholderText(line))
      .join('\n')
      .trim()
  }

  private isPlaceholderText(value: string): boolean {
    return value.trim().toLowerCase() === '#text#'
  }

  isDegradedWithoutMessageId(): boolean {
    return this.degradedWithoutMessageId
  }

  isTerminalDelivered(): boolean {
    return this.terminalDelivered
  }

  private isTerminalStatus(status: ChatDingTalkMessageStatus | undefined): boolean {
    if (!status) {
      return false
    }
    const normalized = String(status).toLowerCase()
    return (
      normalized === XpertAgentExecutionStatusEnum.SUCCESS ||
      normalized === XpertAgentExecutionStatusEnum.ERROR ||
      normalized === XpertAgentExecutionStatusEnum.INTERRUPTED ||
      normalized === 'end' ||
      normalized === 'done'
    )
  }

}

// Construct DingTalk message card
function createConfirmMessage(operation: TSensitiveOperation) {
  // Helper: handle multi-language or default value
  const resolveI18n = (i18n: I18nObject | string): string =>
    typeof i18n === 'string' ? i18n : i18n?.zh_Hans || i18n?.en_US || ''

  const toolElements = operation.tasks?.map((toolCall) => {
    const { call, parameters } = toolCall
    const paramsElements = []
    parameters?.forEach((param) => {
      paramsElements.push({
        tag: 'markdown',
        content: `**${resolveI18n(param.title || param.name)}** <text_tag color='turquoise'>${param.name}</text_tag>: ${call.args[param.name]}`
      })
    })

    return [
      {
        tag: 'markdown',
        content: `**${toolCall.info.title || toolCall.info.name}**: *${toolCall.info.description}*`
      },
      ...paramsElements
    ]
  })

  return [
    ...toolElements.flat(),
    {
      tag: 'hr',
      margin: '0px 0px 10px 0px'
    }
  ]
}

export function cloneStructuredElement<T extends DingTalkStructuredElement>(element: T): T {
    if (element && typeof element === 'object') {
      return { ...(element as Record<string, unknown>) } as T
    }
    return element
  }
