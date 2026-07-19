import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { LARK_RUNTIME_MIDDLEWARE_NAME } from '../constants.js'
import { iconImage } from '../types.js'
import {
  LarkConversationContextMiddleware,
  larkConversationContextStateSchema
} from './lark-conversation-context.middleware.js'
import { LarkLocalHistoryMiddleware } from './lark-local-history.middleware.js'
import { LarkNotifyMiddleware, larkNotifyStateSchema } from './lark-notify.middleware.js'

const LOCAL_HISTORY_TOOLS = new Set(['lark_search_chat_history'])
const MESSAGE_TOOLS = new Set([
  'lark_send_text_notification',
  'lark_send_rich_notification',
  'lark_send_file',
  'lark_update_message',
  'lark_recall_message'
])
const REMOTE_MESSAGE_TOOLS = new Set(['lark_list_messages', 'lark_get_message', 'lark_get_message_resource'])

const larkRuntimeStateSchema = larkConversationContextStateSchema.merge(larkNotifyStateSchema)

export type LarkRuntimeMiddlewareConfig = Record<string, unknown>

@Injectable()
@AgentMiddlewareStrategy(LARK_RUNTIME_MIDDLEWARE_NAME)
export class LarkRuntimeMiddleware implements IAgentMiddlewareStrategy<LarkRuntimeMiddlewareConfig> {
  meta: TAgentMiddlewareMeta

  constructor(
    private readonly localHistoryMiddleware: LarkLocalHistoryMiddleware,
    private readonly notifyMiddleware: LarkNotifyMiddleware,
    private readonly conversationContextMiddleware: LarkConversationContextMiddleware
  ) {
    this.meta = {
      name: LARK_RUNTIME_MIDDLEWARE_NAME,
      icon: { type: 'image', value: iconImage },
      label: {
        en_US: 'Lark Runtime',
        zh_Hans: '飞书运行时'
      },
      description: {
        en_US: 'One Lark runtime for local history, message and workspace file sending, and remote message access.',
        zh_Hans: '统一提供飞书本地历史、消息与工作区文件发送，以及远程消息读取能力。'
      },
      configSchema: buildRuntimeConfigSchema(
        this.notifyMiddleware.meta.configSchema,
        this.conversationContextMiddleware.meta.configSchema
      )
    }
  }

  async createMiddleware(
    options: LarkRuntimeMiddlewareConfig,
    context: IAgentMiddlewareContext
  ): Promise<AgentMiddleware> {
    const normalizedOptions = isRecord(options) ? options : {}
    const runtimeOptions = {
      ...normalizedOptions,
      // The unified runtime is bound to the current Lark trigger; stored node options cannot override it.
      integrationId: undefined,
      trustedTriggerOnly: true as const,
      // Remote message tools may only read the Lark chat injected by the current trigger runtime.
      currentChatOnly: true as const
    }
    const [localHistory, notify, remoteMessages] = await Promise.all([
      Promise.resolve(this.localHistoryMiddleware.createMiddleware({}, context)),
      Promise.resolve(
        this.notifyMiddleware.createMiddleware(
          {
            ...runtimeOptions,
            // The unified runtime intentionally exposes only the five message operations.
            lookupTools: { enabled: false }
          },
          context
        )
      ),
      Promise.resolve(this.conversationContextMiddleware.createMiddleware(runtimeOptions, context))
    ])

    return {
      name: LARK_RUNTIME_MIDDLEWARE_NAME,
      stateSchema: larkRuntimeStateSchema,
      beforeAgent: async (state, runtime) => {
        const remoteState = await invokeBeforeAgent(remoteMessages, state, runtime)
        const notifyState = await invokeBeforeAgent(
          notify,
          { ...(state as Record<string, unknown>), ...remoteState },
          runtime
        )
        return { ...remoteState, ...notifyState }
      },
      wrapModelCall: async (request, handler) => {
        const notifyHandler = notify.wrapModelCall
          ? (nextRequest: typeof request) => notify.wrapModelCall!(nextRequest, handler)
          : handler
        return remoteMessages.wrapModelCall
          ? remoteMessages.wrapModelCall(request, notifyHandler)
          : notifyHandler(request)
      },
      tools: [
        ...(localHistory.tools ?? []).filter((item) => LOCAL_HISTORY_TOOLS.has(item.name)),
        ...(notify.tools ?? []).filter((item) => MESSAGE_TOOLS.has(item.name)),
        ...(remoteMessages.tools ?? []).filter((item) => REMOTE_MESSAGE_TOOLS.has(item.name))
      ]
    }
  }
}

async function invokeBeforeAgent(
  middleware: AgentMiddleware,
  state: unknown,
  runtime: unknown
): Promise<Record<string, unknown>> {
  const hook = middleware.beforeAgent
  if (!hook) {
    return {}
  }
  const handler = typeof hook === 'function' ? hook : hook.hook
  const result = await handler(state as never, runtime as never)
  return isRecord(result) ? result : {}
}

function buildRuntimeConfigSchema(notifySchema: unknown, remoteSchema: unknown): TAgentMiddlewareMeta['configSchema'] {
  const notifyProperties = getSchemaProperties(notifySchema)
  const remoteProperties = getSchemaProperties(remoteSchema)
  const notifyDefaults = isRecord(notifyProperties.defaults) ? notifyProperties.defaults : {}
  const remoteDefaults = isRecord(remoteProperties.defaults) ? remoteProperties.defaults : {}
  const notifyDefaultProperties = getSchemaProperties(notifyDefaults)
  const remoteDefaultProperties = getSchemaProperties(remoteDefaults)

  return {
    type: 'object',
    properties: {
      template: notifyProperties.template,
      defaults: {
        ...notifyDefaults,
        properties: {
          ...notifyDefaultProperties,
          ...remoteDefaultProperties
        }
      }
    }
  } as TAgentMiddlewareMeta['configSchema']
}

function getSchemaProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.properties) ? value.properties : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
