import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
  isAIMessage,
  isSystemMessage,
  isToolMessage
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Command } from '@langchain/langgraph'
import { type ICopilotModel, type TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  CreateModelClientCommand,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  ADVISOR_METADATA_KEY,
  ADVISOR_MIDDLEWARE_NAME,
  ADVISOR_TOOL_NAME,
  AdvisorContextConfigSchema,
  type AdvisorPluginConfig,
  AdvisorPluginConfigFormSchema,
  AdvisorPluginConfigSchema,
  type AdvisorState,
  AdvisorStateSchema,
  AdvisorToolInputSchema,
  type ResolvedAdvisorPluginConfig
} from './advisor.types.js'

const INVALID_ADVISOR_INPUT =
  'Invalid `advisor` input. Provide a non-empty `question` field before calling the advisor.'
const ADVISOR_NO_TEXT_RESPONSE = 'Advisor returned no textual guidance.'

const EXECUTOR_ADVISOR_PROMPT = [
  '<advisor>',
  'Use `advisor` sparingly for hard debugging, architecture tradeoffs, risky decisions, or when you need a second opinion.',
  'Do not call `advisor` for routine execution, simple lookups, or obvious next steps.',
  'When you call `advisor`, ask one concrete question that clearly states the blocker, tradeoff, or decision.',
  '</advisor>'
].join('\n')

const DEFAULT_ADVISOR_SYSTEM_PROMPT = [
  'You are an internal advisor tool helping another AI executor.',
  'Provide concise, high-signal guidance that helps the executor decide what to do next.',
  'Prioritize diagnosis, tradeoffs, hidden risks, and concrete next steps.',
  'Do not answer as the end-user assistant and do not call tools.',
  'If context is incomplete, make the best recommendation you can from the available information.'
].join('\n')

@Injectable()
@AgentMiddlewareStrategy(ADVISOR_MIDDLEWARE_NAME)
export class AdvisorMiddleware implements IAgentMiddlewareStrategy<Partial<AdvisorPluginConfig>> {
  constructor(private readonly commandBus: CommandBus) {}

  readonly meta: TAgentMiddlewareMeta = {
    name: ADVISOR_MIDDLEWARE_NAME,
    label: {
      en_US: 'Advisor Middleware',
      zh_Hans: '顾问中间件'
    },
    description: {
      en_US:
        'Adds a configurable `advisor` tool that lets the executor consult a secondary model for hard debugging, tradeoffs, and planning.',
      zh_Hans:
        '提供可配置的 `advisor` 工具，让执行器在复杂调试、权衡决策和规划场景下咨询一个辅助模型。'
    },
    icon: {
      type: 'svg',
      value:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="6" y="8" width="52" height="40" rx="12" fill="currentColor" opacity="0.12"/><path d="M19 22c0-5.523 4.477-10 10-10h6c5.523 0 10 4.477 10 10v7c0 5.523-4.477 10-10 10h-6l-8 8v-8c-3.314 0-6-2.686-6-6V22Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M27 25h10M27 32h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="45" cy="47" r="9" fill="currentColor" opacity="0.18"/><path d="m41 47 3 3 6-6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    configSchema: AdvisorPluginConfigFormSchema
  }

  createMiddleware(
    options: Partial<AdvisorPluginConfig>,
    _context: IAgentMiddlewareContext
  ): AgentMiddleware {
    const config = resolveConfig(options)

    if (!config.enabled) {
      return {
        name: ADVISOR_MIDDLEWARE_NAME
      }
    }

    let advisorModelPromise: Promise<BaseChatModel> | null = null

    const getAdvisorModel = async () => {
      if (!advisorModelPromise) {
        advisorModelPromise = this.commandBus.execute(
          new CreateModelClientCommand<BaseChatModel>(buildInternalModelConfig(config.advisorModel, config), {
            usageCallback: () => undefined
          })
        )
      }
      return advisorModelPromise
    }

    const advisorTool = createAdvisorTool()

    return {
      name: ADVISOR_MIDDLEWARE_NAME,
      stateSchema: AdvisorStateSchema,
      tools: [advisorTool],
      beforeAgent: () => ({
        advisorRunUses: 0
      }),
      wrapModelCall: async (request, handler) => {
        const quota = evaluateQuota(config, request.state)
        let nextRequest = request

        if (quota.exhausted) {
          const filteredTools = request.tools.filter((toolCandidate) => getToolName(toolCandidate) !== ADVISOR_TOOL_NAME)
          if (filteredTools.length !== request.tools.length) {
            nextRequest = {
              ...nextRequest,
              tools: filteredTools
            }
          }
        } else if (config.appendSystemPrompt) {
          nextRequest = {
            ...nextRequest,
            systemMessage: appendSystemPrompt(request.systemMessage?.content, EXECUTOR_ADVISOR_PROMPT)
          }
        }

        return handler(nextRequest)
      },
      wrapToolCall: async (request, handler) => {
        if (request.toolCall?.name !== ADVISOR_TOOL_NAME) {
          return handler(request)
        }

        const parsedInput = AdvisorToolInputSchema.safeParse(normalizeToolArgs(request.toolCall?.args))
        if (!parsedInput.success) {
          return buildErrorToolMessage(request.toolCall?.id, INVALID_ADVISOR_INPUT)
        }

        const quota = evaluateQuota(config, request.state)
        if (quota.exhausted) {
          return buildErrorToolMessage(request.toolCall?.id, quota.reason)
        }

        try {
          const advisorModel = await getAdvisorModel()
          const advisorMessages = buildAdvisorMessages(parsedInput.data.question, request.state.messages, config)
          const advisorResponse = await advisorModel.invoke(advisorMessages as BaseMessage[])
          const content = extractTextContent(advisorResponse?.content).trim() || ADVISOR_NO_TEXT_RESPONSE
          const nextRunUses = quota.runUses + 1
          const nextSessionUses = quota.sessionUses + 1
          const toolMessage = new ToolMessage({
            name: ADVISOR_TOOL_NAME,
            tool_call_id: normalizeToolCallId(request.toolCall?.id),
            status: 'success',
            content,
            metadata: {
              [ADVISOR_METADATA_KEY]: {
                question: parsedInput.data.question,
                advisorRunUses: nextRunUses,
                advisorSessionUses: nextSessionUses
              }
            }
          })

          return new Command({
            update: {
              messages: [toolMessage],
              advisorRunUses: nextRunUses,
              advisorSessionUses: nextSessionUses
            }
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          return buildErrorToolMessage(request.toolCall?.id, `Advisor model call failed: ${reason}`)
        }
      }
    }
  }
}

function resolveConfig(options?: Partial<AdvisorPluginConfig>): ResolvedAdvisorPluginConfig {
  const parsed = AdvisorPluginConfigSchema.safeParse(options ?? {})
  if (!parsed.success) {
    throw new Error(renderZodError(parsed.error))
  }

  const config = parsed.data
  if (config.enabled && !config.advisorModel) {
    throw new Error('advisorModel is required when advisor middleware is enabled')
  }

  return {
    ...config,
    advisorModel: config.advisorModel as ICopilotModel,
    context: AdvisorContextConfigSchema.parse(config.context ?? {})
  }
}

function createAdvisorTool() {
  return tool(async () => 'Advisor middleware intercepted this tool call before ordinary execution.', {
    name: ADVISOR_TOOL_NAME,
    description:
      'Ask a secondary model for help with difficult debugging, architecture tradeoffs, risky decisions, or a second opinion. Do not use this for routine execution or simple lookups.',
    schema: AdvisorToolInputSchema
  })
}

function evaluateQuota(config: ResolvedAdvisorPluginConfig, state: Partial<AdvisorState> | undefined) {
  const runUses = sanitizeCounter(state?.advisorRunUses)
  const sessionUses = sanitizeCounter(state?.advisorSessionUses)
  const runRemaining = Math.max(config.maxUsesPerRun - runUses, 0)
  const sessionRemaining =
    config.maxUsesPerSession === null ? null : Math.max(config.maxUsesPerSession - sessionUses, 0)
  const exhausted = runRemaining <= 0 || (sessionRemaining !== null && sessionRemaining <= 0)
  const reason =
    sessionRemaining !== null && sessionRemaining <= 0
      ? 'Advisor quota reached for this session. Continue without `advisor` until the session limit resets.'
      : 'Advisor quota reached for this run. Continue without `advisor` until the next run starts.'

  return {
    exhausted,
    reason,
    runUses,
    sessionUses
  }
}

function sanitizeCounter(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function buildInternalModelConfig(
  advisorModel: ICopilotModel,
  config: ResolvedAdvisorPluginConfig
): ResolvedAdvisorPluginConfig['advisorModel'] {
  const options = isRecord(advisorModel.options) ? advisorModel.options : {}

  return {
    ...advisorModel,
    options: {
      ...options,
      streaming: false,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      maxTokens: config.maxTokens
    }
  }
}

function appendSystemPrompt(existingContent: SystemMessage['content'] | undefined, prompt: string): SystemMessage {
  if (typeof existingContent === 'string') {
    return new SystemMessage({
      content: [existingContent, prompt].filter(Boolean).join('\n\n')
    })
  }

  if (Array.isArray(existingContent)) {
    return new SystemMessage({
      content: [...existingContent, { type: 'text', text: prompt }]
    })
  }

  return new SystemMessage({
    content: prompt
  })
}

function buildAdvisorMessages(
  question: string,
  stateMessages: BaseMessage[] | undefined,
  config: ResolvedAdvisorPluginConfig
): BaseMessage[] {
  return [
    new SystemMessage({
      content: [DEFAULT_ADVISOR_SYSTEM_PROMPT, config.advisorSystemPrompt].filter(Boolean).join('\n\n')
    }),
    ...curateContextMessages(stateMessages, config),
    new HumanMessage({
      content: ['The executor agent needs advice on the following question:', question].join('\n\n')
    })
  ]
}

function curateContextMessages(
  stateMessages: BaseMessage[] | undefined,
  config: ResolvedAdvisorPluginConfig
): BaseMessage[] {
  if (!Array.isArray(stateMessages) || stateMessages.length === 0) {
    return []
  }

  const curated = stateMessages
    .map((message) => sanitizeMessage(message, config))
    .filter((message): message is BaseMessage => Boolean(message))

  const limitedByCount =
    config.context.maxContextMessages === null
      ? curated
      : curated.slice(-config.context.maxContextMessages)

  if (config.context.maxContextChars === null) {
    return limitedByCount
  }

  const result: BaseMessage[] = []
  let totalChars = 0

  for (let index = limitedByCount.length - 1; index >= 0; index--) {
    const message = limitedByCount[index]
    const size = estimateMessageChars(message)
    if (result.length > 0 && totalChars + size > config.context.maxContextChars) {
      break
    }
    totalChars += size
    result.unshift(message)
  }

  return result
}

function sanitizeMessage(
  message: BaseMessage,
  config: ResolvedAdvisorPluginConfig
): BaseMessage | null {
  if (isSystemMessage(message) && !config.context.includeSystemPrompt) {
    return null
  }

  if (isToolMessage(message) && !config.context.includeToolResults) {
    return null
  }

  if (isAIMessage(message)) {
    return stripAdvisorToolCall(message)
  }

  return message
}

function stripAdvisorToolCall(message: AIMessage): AIMessage | null {
  if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    return message
  }

  const toolCalls = message.tool_calls.filter((toolCall) => toolCall?.name !== ADVISOR_TOOL_NAME)
  if (toolCalls.length === message.tool_calls.length) {
    return message
  }

  if (toolCalls.length === 0 && !extractTextContent(message.content).trim()) {
    return null
  }

  const filteredEntries = Object.fromEntries(
    Object.entries(message as unknown as Record<string, unknown>).filter(([key]) => !key.startsWith('lc_'))
  )
  const additionalKwargs = isRecord(filteredEntries['additional_kwargs'])
    ? {
        ...filteredEntries['additional_kwargs']
      }
    : undefined

  if (additionalKwargs && 'tool_calls' in additionalKwargs) {
    delete additionalKwargs['tool_calls']
  }

  return new AIMessage({
    ...(filteredEntries as Record<string, unknown>),
    ...(additionalKwargs ? { additional_kwargs: additionalKwargs } : {}),
    tool_calls: toolCalls
  } as ConstructorParameters<typeof AIMessage>[0])
}

function estimateMessageChars(message: BaseMessage) {
  const base = extractTextContent((message as { content?: unknown }).content).length

  if (isToolMessage(message)) {
    return base + (message.name?.length ?? 0)
  }

  if (isAIMessage(message) && Array.isArray(message.tool_calls)) {
    return (
      base +
      message.tool_calls
        .map((toolCall) => toolCall?.name?.length ?? 0)
        .reduce((sum, value) => sum + value, 0)
    )
  }

  return base
}

function buildErrorToolMessage(toolCallId: string | undefined, content: string) {
  return new ToolMessage({
    name: ADVISOR_TOOL_NAME,
    tool_call_id: normalizeToolCallId(toolCallId),
    status: 'error',
    content
  })
}

function normalizeToolArgs(rawArgs: unknown) {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return {}
  }

  const raw = rawArgs as Record<string, unknown>
  const question = typeof raw['question'] === 'string' ? raw['question'].trim() : undefined

  return question ? { question } : {}
}

function normalizeToolCallId(toolCallId: string | null | undefined) {
  if (typeof toolCallId !== 'string') {
    return ''
  }

  return toolCallId.trim()
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (isRecord(item) && typeof item['text'] === 'string') {
          return item['text']
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  if (isRecord(value)) {
    return JSON.stringify(value)
  }

  return ''
}

function getToolName(toolCandidate: unknown) {
  if (!toolCandidate || typeof toolCandidate !== 'object') {
    return null
  }

  const name = (toolCandidate as { name?: unknown }).name
  return typeof name === 'string' ? name : null
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}

function renderZodError(error: z.ZodError) {
  return `Invalid advisor middleware options: ${error.issues
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ')}`
}
