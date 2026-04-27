import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
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
import { type ICopilotModel, type TAgentMiddlewareMeta, type TMessageComponentStep } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory } from '@xpert-ai/chatkit-types'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
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
  AdvisorPluginIcon,
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

const INTERNAL_ADVISOR_INVOKE_TAG = 'advisor/internal-eval'
const INTERNAL_ADVISOR_INVOKE_OPTIONS = {
  tags: [INTERNAL_ADVISOR_INVOKE_TAG],
  metadata: {
    internal: true
  }
}

@Injectable()
@AgentMiddlewareStrategy(ADVISOR_MIDDLEWARE_NAME)
export class AdvisorMiddleware implements IAgentMiddlewareStrategy<Partial<AdvisorPluginConfig>> {
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
      value: AdvisorPluginIcon
    },
    configSchema: AdvisorPluginConfigFormSchema
  }

  createMiddleware(
    options: Partial<AdvisorPluginConfig>,
    context: IAgentMiddlewareContext
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
        advisorModelPromise = context.runtime.createModelClient<BaseChatModel>(
          buildInternalModelConfig(config.advisorModel, config),
          {
            usageCallback: () => undefined
          }
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

        const toolCallId = normalizeToolCallId(request.toolCall?.id)
        const normalizedToolArgs = normalizeToolArgs(request.toolCall?.args)
        const parsedInput = AdvisorToolInputSchema.safeParse(normalizedToolArgs)
        if (!parsedInput.success) {
          await emitAdvisorToolStep({
            toolCallId,
            message: INVALID_ADVISOR_INPUT,
            input: normalizedToolArgs,
            error: INVALID_ADVISOR_INPUT,
            status: 'fail'
          })
          return buildErrorToolMessage(toolCallId, INVALID_ADVISOR_INPUT)
        }

        const quota = evaluateQuota(config, request.state)
        if (quota.exhausted) {
          await emitAdvisorToolStep({
            toolCallId,
            message: parsedInput.data.question,
            input: parsedInput.data,
            error: quota.reason,
            status: 'fail'
          })
          return buildErrorToolMessage(toolCallId, quota.reason)
        }

        try {
          await emitAdvisorToolStep({
            toolCallId,
            message: parsedInput.data.question,
            input: parsedInput.data,
            status: 'running'
          })
          const advisorModel = await getAdvisorModel()
          const advisorMessages = buildAdvisorMessages(parsedInput.data.question, request.state.messages, config)
          const advisorResponse = await advisorModel.invoke(
            advisorMessages as BaseMessage[],
            INTERNAL_ADVISOR_INVOKE_OPTIONS
          )
          const content = extractTextContent(advisorResponse?.content).trim() || ADVISOR_NO_TEXT_RESPONSE
          const nextRunUses = quota.runUses + 1
          const nextSessionUses = quota.sessionUses + 1
          await emitAdvisorToolStep({
            toolCallId,
            message: parsedInput.data.question,
            input: parsedInput.data,
            output: content,
            status: 'success'
          })
          const toolMessage = new ToolMessage({
            name: ADVISOR_TOOL_NAME,
            tool_call_id: toolCallId,
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
          const failureMessage = `Advisor model call failed: ${reason}`
          await emitAdvisorToolStep({
            toolCallId,
            message: parsedInput.data.question,
            input: parsedInput.data,
            error: failureMessage,
            status: 'fail'
          })
          return buildErrorToolMessage(toolCallId, failureMessage)
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

  const curated = normalizeToolMessageSequence(
    stateMessages
      .map((message) => sanitizeMessageContent(message, config))
      .filter((message): message is BaseMessage => Boolean(message))
  )

  const limitedByCount =
    config.context.maxContextMessages === null
      ? curated
      : normalizeToolMessageSequence(curated.slice(-config.context.maxContextMessages))

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

  return normalizeToolMessageSequence(result)
}

function sanitizeMessageContent(
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

function normalizeToolMessageSequence(messages: BaseMessage[]): BaseMessage[] {
  const normalized: BaseMessage[] = []
  let pendingAiIndex: number | null = null
  let pendingToolCallIds = new Set<string>()

  for (const message of messages) {
    if (isToolMessage(message)) {
      const toolCallId = normalizeToolCallId(message.tool_call_id)
      if (!toolCallId || pendingToolCallIds.size === 0 || !pendingToolCallIds.has(toolCallId)) {
        continue
      }

      normalized.push(message)
      pendingToolCallIds.delete(toolCallId)
      if (pendingToolCallIds.size === 0) {
        pendingAiIndex = null
      }
      continue
    }

    if (pendingToolCallIds.size > 0 && pendingAiIndex !== null) {
      normalized.splice(pendingAiIndex)
      pendingAiIndex = null
      pendingToolCallIds.clear()
    }

    normalized.push(message)

    if (!isAIMessage(message)) {
      continue
    }

    const toolCallIds = collectToolCallIds(message)
    if (toolCallIds.size > 0) {
      pendingAiIndex = normalized.length - 1
      pendingToolCallIds = toolCallIds
    }
  }

  if (pendingToolCallIds.size > 0 && pendingAiIndex !== null) {
    normalized.splice(pendingAiIndex)
  }

  return normalized
}

function collectToolCallIds(message: AIMessage) {
  if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    return new Set<string>()
  }

  return new Set(
    message.tool_calls
      .map((toolCall) => normalizeToolCallId(toolCall?.id))
      .filter((toolCallId): toolCallId is string => Boolean(toolCallId))
  )
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

type AdvisorToolStepEvent = {
  toolCallId?: string | null
} & Pick<TMessageComponentStep, 'status'> &
  Partial<Pick<TMessageComponentStep, 'message' | 'input' | 'output' | 'error'>>

async function emitAdvisorToolStep(event: AdvisorToolStepEvent) {
  const timestamp = new Date().toISOString()
  const toolCallId = normalizeToolCallId(event.toolCallId)

  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
      id: toolCallId || undefined,
      category: 'Tool',
      type: ChatMessageStepCategory.List,
      toolset: ADVISOR_MIDDLEWARE_NAME,
      tool: ADVISOR_TOOL_NAME,
      title: 'Advisor',
      message: event.message || 'Advisor execution',
      status: event.status,
      created_date: timestamp,
      ...(event.status === 'running' ? {} : { end_date: timestamp }),
      ...(event.input !== undefined ? { input: event.input } : {}),
      ...(event.output !== undefined ? { output: event.output } : {}),
      ...(event.error !== undefined ? { error: event.error } : {})
    })
  } catch {
    // Ignore dispatch failures so advisor execution is not blocked by UI event transport.
  }
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
