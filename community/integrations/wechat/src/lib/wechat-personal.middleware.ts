import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  WECHAT_PERSONAL_FEATURE,
  WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_PERSONAL_ICON,
  WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
  WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_PERSONAL_WORKBENCH_FEATURE
} from './constants.js'
import { normalizeString } from './types.js'
import { WechatPersonalConversationService } from './conversation.service.js'
import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'

type WechatPersonalRuntimeMiddlewareOptions = {
  integrationId?: string
}

const integrationField = z.string().optional().describe('Personal WeChat integration id. Defaults to the middleware node option.')

const runtimeStatusSchema = z.object({
  integrationId: integrationField
})

const callbackConfigSchema = z.object({
  integrationId: integrationField
})

const listAccountsSchema = z.object({
  integrationId: integrationField,
  search: z.string().optional().describe('Keyword for uuid, owner wxid, display name, status or last error.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const listConversationsSchema = z.object({
  integrationId: integrationField,
  search: z.string().optional().describe('Keyword for account uuid, contact id, sender id, xpert id or conversation id.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const searchMessageLogsSchema = z.object({
  integrationId: integrationField,
  direction: z.enum(['inbound', 'outbound', 'system']).optional().describe('Message direction filter.'),
  status: z.enum(['received', 'dispatched', 'sent', 'skipped', 'failed']).optional().describe('Message status filter.'),
  search: z.string().optional().describe('Keyword for contact, sender, message id, content, error or conversation id.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const resetConversationSchema = z.object({
  integrationId: integrationField,
  bindingId: z.string().min(1).describe('Conversation binding id returned by wechat_personal_list_conversations.')
})

const registerCallbackSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.'),
  callbackUrl: z.string().optional().describe('Optional callback URL. Defaults to the Xpert webhook URL.'),
  enabled: z.boolean().optional().describe('Whether the wx2.0 per-account callback should be enabled. Defaults to true.')
})

const setAccountEnabledSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.'),
  enabled: z.boolean().describe('Whether this account should accept inbound callbacks.')
})

@Injectable()
@AgentMiddlewareStrategy(WECHAT_PERSONAL_MIDDLEWARE_NAME)
export class WechatPersonalRuntimeMiddleware
  implements IAgentMiddlewareStrategy<WechatPersonalRuntimeMiddlewareOptions>
{
  readonly meta: TAgentMiddlewareMeta = {
    name: WECHAT_PERSONAL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Personal WeChat Runtime',
      zh_Hans: '个人微信运行时'
    },
    description: {
      en_US: 'Expose Personal WeChat workbench discovery and runtime management tools to an assistant.',
      zh_Hans: '为助手暴露个人微信工作台发现能力和运行时管理工具。'
    },
    icon: {
      type: 'svg',
      value: WECHAT_PERSONAL_ICON,
      color: '#16a34a'
    },
    features: [WECHAT_PERSONAL_FEATURE, WECHAT_PERSONAL_RUNTIME_FEATURE, WECHAT_PERSONAL_WORKBENCH_FEATURE],
    configSchema: {
      type: 'object',
      properties: {
        integrationId: {
          type: 'string',
          title: {
            en_US: 'Personal WeChat Integration',
            zh_Hans: '个人微信集成'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/wechat-personal/integration-select-options'
          } as any
        }
      },
      required: []
    }
  }

  constructor(
    private readonly conversationService: WechatPersonalConversationService,
    private readonly wechatChannel: WechatPersonalChannelStrategy
  ) {}

  createMiddleware(
    options: WechatPersonalRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    return {
      name: WECHAT_PERSONAL_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              return this.success(
                integrationId
                  ? 'Personal WeChat runtime status was returned.'
                  : 'Organization Personal WeChat runtime status was returned.',
                integrationId
                  ? await this.conversationService.getRuntimeStatus(integrationId)
                  : await this.conversationService.getOrganizationRuntimeStatus()
              )
            }),
          {
            name: WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
            description:
              'Get Personal WeChat runtime status: callback URLs, tunnel connection state, trigger binding, summary counts, recent accounts and recent errors. Use for setup and operations questions.',
            schema: runtimeStatusSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              if (!integrationId) {
                return this.success(
                  'Organization Personal WeChat callback configurations were returned.',
                  (await this.conversationService.getOrganizationWorkbenchData({ pageSize: 1 })).integrations?.map(
                    (integration) => ({
                      id: integration.id,
                      name: integration.name,
                      callbackConfig: integration.callbackConfig
                    })
                  ) ?? []
                )
              }
              const integration = await this.wechatChannel.readIntegrationById(integrationId)
              if (!integration) {
                return this.error(`Personal WeChat integration "${integrationId}" was not found.`)
              }
              return this.success(
                'Personal WeChat callback configuration was returned.',
                this.conversationService.buildCallbackConfig(integration.id, integration.options?.callbackSecret)
              )
            }),
          {
            name: WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
            description:
              'Get the Xpert webhook URL and SetCallback curl template for configuring wx2.0 callbacks.',
            schema: callbackConfigSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              return this.success(
                integrationId ? 'Personal WeChat accounts were listed.' : 'Organization Personal WeChat accounts were listed.',
                integrationId
                  ? await this.conversationService.listAccounts(integrationId, input)
                  : await this.conversationService.listOrganizationAccounts(input)
              )
            }),
          {
            name: WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
            description:
              'List wx2.0 personal WeChat accounts captured by callbacks, including enabled state, online status and recent errors.',
            schema: listAccountsSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              return this.success(
                integrationId
                  ? 'Personal WeChat conversation bindings were listed.'
                  : 'Organization Personal WeChat conversation bindings were listed.',
                integrationId
                  ? await this.conversationService.listConversations(integrationId, input)
                  : await this.conversationService.listOrganizationConversations(input)
              )
            }),
          {
            name: WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
            description:
              'List Personal WeChat conversation bindings. Use this to find a binding id before resetting a conversation.',
            schema: listConversationsSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              return this.success(
                integrationId
                  ? 'Personal WeChat message logs were searched.'
                  : 'Organization Personal WeChat message logs were searched.',
                integrationId
                  ? await this.conversationService.searchMessageLogs(integrationId, input)
                  : await this.conversationService.searchOrganizationMessageLogs(input)
              )
            }),
          {
            name: WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
            description:
              'Search inbound, outbound and system Personal WeChat message logs for diagnostics and audit questions.',
            schema: searchMessageLogsSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              if (!integrationId) {
                return this.missingIntegrationId()
              }
              await this.conversationService.restartConversationBinding(integrationId, input.bindingId)
              return this.success('Personal WeChat conversation was reset.', {
                bindingId: input.bindingId
              })
            }),
          {
            name: WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
            description:
              'Reset one Personal WeChat conversation binding by binding id so the next inbound message starts a fresh Agent conversation.',
            schema: resetConversationSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              if (!integrationId) {
                return this.missingIntegrationId()
              }
              const integration = await this.wechatChannel.readIntegrationById(integrationId)
              if (!integration) {
                return this.error(`Personal WeChat integration "${integrationId}" was not found.`)
              }
              const callbackConfig = this.conversationService.buildCallbackConfig(
                integration.id,
                integration.options?.callbackSecret
              )
              const result = await this.wechatChannel.registerCallback({
                integrationId: integration.id,
                uuid: input.uuid,
                callbackUrl: normalizeString(input.callbackUrl) || callbackConfig.webhookUrl,
                enabled: input.enabled !== false
              })
              return result.success
                ? this.success('wx2.0 SetCallback registration succeeded.', result)
                : this.error(result.error || 'wx2.0 SetCallback registration failed.', result)
            }),
          {
            name: WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
            description:
              'Register or update a wx2.0 per-account callback for a known account uuid/key. This is an administrative setup action.',
            schema: registerCallbackSchema
          }
        ),
        tool(
          async (input) =>
            this.safeJson(async () => {
              const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
              if (!integrationId) {
                return this.missingIntegrationId()
              }
              await this.conversationService.setAccountEnabled(integrationId, input.uuid, input.enabled)
              return this.success('Personal WeChat account enabled state was updated.', {
                uuid: input.uuid,
                enabled: input.enabled
              })
            }),
          {
            name: WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
            description:
              'Enable or disable inbound processing for one wx2.0 personal WeChat account already seen by this integration.',
            schema: setAccountEnabledSchema
          }
        )
      ]
    }
  }

  private async resolveIntegrationId(
    inputIntegrationId: unknown,
    options: WechatPersonalRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): Promise<string | null> {
    const nodeOptions = context.node?.options as WechatPersonalRuntimeMiddlewareOptions | undefined
    const explicitIntegrationId =
      normalizeString(inputIntegrationId) ||
      normalizeString(options?.integrationId) ||
      normalizeString(nodeOptions?.integrationId)
    if (explicitIntegrationId) {
      return explicitIntegrationId
    }
    const xpertId = normalizeString(context.xpertId)
    return xpertId ? this.conversationService.getBoundIntegrationIdForXpert(xpertId) : null
  }

  private async safeJson(factory: () => Promise<Record<string, unknown>>): Promise<string> {
    try {
      return JSON.stringify(await factory(), null, 2)
    } catch (err) {
      return JSON.stringify(this.error(err instanceof Error ? err.message : String(err)), null, 2)
    }
  }

  private success(message: string, data?: unknown): Record<string, unknown> {
    return {
      success: true,
      message,
      data
    }
  }

  private error(message: string, data?: unknown): Record<string, unknown> {
    return {
      success: false,
      message,
      data
    }
  }

  private missingIntegrationId(): Record<string, unknown> {
    return this.error('Missing Personal WeChat integrationId. Select an integration in the middleware options first.')
  }
}
