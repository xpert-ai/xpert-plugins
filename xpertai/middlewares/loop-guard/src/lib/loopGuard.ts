import { createHash } from 'crypto'
import { Injectable } from '@nestjs/common'
import {
  AIMessage,
  HumanMessage,
  isAIMessage,
} from '@langchain/core/messages'
import type { ToolCall } from '@langchain/core/messages/tool'
import { InferInteropZodInput } from '@langchain/core/utils/types'
import {
  AgentBuiltInState,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  JumpToTarget,
} from '@xpert-ai/plugin-sdk'
import { JsonSchemaObjectType, TAgentMiddlewareMeta } from '@metad/contracts'
import { z } from 'zod/v3'
import { z as z4 } from 'zod/v4'
import { DEFAULT_VOLATILE_ARG_KEYS, LoopGuardFailureMode, LoopGuardIcon, LoopGuardRule } from './types.js'

const HIT_WINDOW_MAX = 50
const DEFAULT_WARN_THRESHOLD = 3
const DEFAULT_HARD_LIMIT = 5
const DEFAULT_WINDOW_SIZE = 20

const LOOP_RULES = ['batch_repeat'] as const

const loopGuardSchema = z.object({
  enabled: z.boolean().optional().default(true),
  warnThreshold: z.number().int().min(1).max(HIT_WINDOW_MAX).optional(),
  hardLimit: z.number().int().min(1).max(HIT_WINDOW_MAX).optional(),
  windowSize: z.number().int().min(1).max(HIT_WINDOW_MAX).optional(),
  onLoop: z.enum(['continue', 'end', 'error']).optional().default('end'),
  warningMessage: z.string().trim().min(1).optional(),
  hardStopMessage: z.string().trim().min(1).optional(),
}).strict()

export type LoopGuardMiddlewareConfig = InferInteropZodInput<typeof loopGuardSchema>

type ResolvedLoopGuardConfig = {
  enabled: boolean
  warnThreshold: number
  hardLimit: number
  windowSize: number
  onLoop: LoopGuardFailureMode
  warningMessage?: string
  hardStopMessage?: string
  ignoredArgKeySet: Set<string>
}

const pendingWarningSchema = z.object({
  hash: z.string(),
  message: z.string(),
  count: z.number().int().min(1),
  tools: z.array(z.string()),
})

const loopHitSchema = z.object({
  rule: z.enum(LOOP_RULES),
  hash: z.string(),
  count: z.number().int().min(1),
  tools: z.array(z.string()),
  detail: z.string(),
  at: z.string(),
})

const loopGuardStateSchema = z.object({
  loopDetectionWindow: z.array(z.string()).optional(),
  loopDetectionWarned: z.array(z.string()).optional(),
  loopDetectionPendingWarning: pendingWarningSchema.optional(),
})

type LoopHit = z.infer<typeof loopHitSchema>
type LoopGuardState = z.infer<typeof loopGuardStateSchema>
type PendingWarning = z.infer<typeof pendingWarningSchema>

type NormalizedToolCall = {
  name: string
  args: unknown
}

type ToolBatchSummary = {
  hash: string
  tools: string[]
  normalizedCalls: NormalizedToolCall[]
}

const configSchemaProperties: JsonSchemaObjectType['properties'] = {
  enabled: {
    type: 'boolean',
    default: true,
    title: {
      en_US: 'Enabled',
      zh_Hans: '启用',
    },
    description: {
      en_US: 'Turn loop detection on or off.',
      zh_Hans: '启用或关闭循环检测。',
    },
  },
  warnThreshold: {
    type: 'number',
    minimum: 1,
    default: DEFAULT_WARN_THRESHOLD,
    title: {
      en_US: 'Warn Threshold',
      zh_Hans: '提醒阈值',
    },
    description: {
      en_US: 'Schedule a warning for the next model call after this many repeated tool-call batches.',
      zh_Hans: '同一工具调用批次重复达到该次数后，在下一轮模型调用前注入提醒。',
    },
  },
  hardLimit: {
    type: 'number',
    minimum: 1,
    default: DEFAULT_HARD_LIMIT,
    title: {
      en_US: 'Hard Limit',
      zh_Hans: '硬停止阈值',
    },
    description: {
      en_US: 'Stop or error after this many repeated tool-call batches.',
      zh_Hans: '同一工具调用批次重复达到该次数后执行硬停止或报错。',
    },
  },
  windowSize: {
    type: 'number',
    minimum: 1,
    default: DEFAULT_WINDOW_SIZE,
    title: {
      en_US: 'Window Size',
      zh_Hans: '窗口大小',
    },
    description: {
      en_US: 'Number of recent tracked tool-call batches kept in state.',
      zh_Hans: '保存在状态中的最近工具调用批次数量。',
    },
  },
  onLoop: {
    type: 'string',
    enum: ['continue', 'end', 'error'],
    default: 'end',
    title: {
      en_US: 'On Hard Limit',
      zh_Hans: '达到硬阈值时',
    },
    description: {
      en_US: "Choose whether hard-limit hits only warn, end the run, or throw an error.",
      zh_Hans: '选择硬阈值命中后仅提醒、结束运行或直接报错。',
    },
    'x-ui': {
      enumLabels: {
        continue: {
          en_US: 'Warn Only',
          zh_Hans: '仅提醒',
        },
        end: {
          en_US: 'End Run',
          zh_Hans: '结束运行',
        },
        error: {
          en_US: 'Error',
          zh_Hans: '报错',
        },
      },
    },
  },
  warningMessage: {
    type: 'string',
    title: {
      en_US: 'Warning Message',
      zh_Hans: '提醒文案',
    },
    description: {
      en_US: 'Optional override for the next-turn warning injected before the model call.',
      zh_Hans: '可选，自定义下一轮模型调用前注入的提醒文案。',
    },
  },
  hardStopMessage: {
    type: 'string',
    title: {
      en_US: 'Hard Stop Message',
      zh_Hans: '硬停止文案',
    },
    description: {
      en_US: 'Optional override for the final AI message used when the run is stopped.',
      zh_Hans: '可选，自定义硬停止时追加的最终 AIMessage 文案。',
    },
  },
}

export class LoopGuardTriggeredError extends Error {
  constructor(
    public readonly hits: LoopHit[],
    public readonly mode: LoopGuardFailureMode
  ) {
    const tools = Array.from(new Set(hits.flatMap((hit) => hit.tools)))
    const detail = hits[0]?.detail ?? 'loop detected'
    super(`Loop guard triggered (${mode}) for ${tools.join(', ') || 'unknown tools'}: ${detail}`)
    this.name = 'LoopGuardTriggeredError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hashText(value: string): string {
  return createHash('md5').update(value).digest('hex').slice(0, 16)
}

function takeTail<T>(items: T[], count: number): T[] {
  return items.slice(Math.max(items.length - count, 0))
}

function pruneWarned(warned: string[], window: string[]): string[] {
  const hashes = new Set(window)
  return Array.from(new Set(warned.filter((hash) => hashes.has(hash))))
}

function normalizeArgValue(value: unknown, ignoredArgKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeArgValue(item, ignoredArgKeys))
  }

  if (isRecord(value)) {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        if (ignoredArgKeys.has(key.toLowerCase())) {
          return acc
        }

        const next = normalizeArgValue(value[key], ignoredArgKeys)
        if (next !== undefined) {
          acc[key] = next
        }
        return acc
      }, {})
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length <= 160) {
      return trimmed
    }

    return {
      hash: hashText(trimmed),
      length: trimmed.length,
      preview: trimmed.slice(0, 80),
      type: 'long_text',
    }
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }

  if (value === undefined) {
    return undefined
  }

  return String(value)
}

function stripLangChainFields<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('lc_')))
}

function cloneAIMessage(message: AIMessage, overrides: Record<string, unknown> = {}): AIMessage {
  return new AIMessage({
    ...(stripLangChainFields(message as unknown as Record<string, unknown>) as Record<string, unknown>),
    ...overrides,
  } as ConstructorParameters<typeof AIMessage>[0])
}

function normalizeConfig(config: z.infer<typeof loopGuardSchema>): ResolvedLoopGuardConfig {
  const ignoredArgKeys = new Set(
    DEFAULT_VOLATILE_ARG_KEYS.map((value) => value.toLowerCase())
  )
  const hardLimit = config.hardLimit ?? DEFAULT_HARD_LIMIT
  const warnThreshold = config.warnThreshold ?? Math.min(DEFAULT_WARN_THRESHOLD, hardLimit)
  const windowSize = config.windowSize ?? Math.max(DEFAULT_WINDOW_SIZE, hardLimit)

  if (hardLimit < warnThreshold) {
    throw new Error('hardLimit must be greater than or equal to warnThreshold.')
  }

  if (windowSize < hardLimit) {
    throw new Error('windowSize must be greater than or equal to hardLimit.')
  }

  return {
    enabled: config.enabled,
    warnThreshold,
    hardLimit,
    windowSize,
    onLoop: config.onLoop,
    warningMessage: config.warningMessage,
    hardStopMessage: config.hardStopMessage,
    ignoredArgKeySet: ignoredArgKeys,
  }
}

function normalizeToolBatch(toolCalls: ToolCall[], config: ResolvedLoopGuardConfig): ToolBatchSummary | null {
  const normalizedCalls = toolCalls
    .filter((toolCall) => toolCall?.name)
    .map((toolCall) => ({
      name: toolCall.name!,
      args: normalizeArgValue(toolCall.args, config.ignoredArgKeySet) ?? null,
    }))
    .sort((left, right) => {
      const leftKey = JSON.stringify(left)
      const rightKey = JSON.stringify(right)
      return leftKey.localeCompare(rightKey)
    })

  if (!normalizedCalls.length) {
    return null
  }

  return {
    hash: hashText(JSON.stringify(normalizedCalls)),
    tools: Array.from(new Set(normalizedCalls.map((call) => call.name))).sort(),
    normalizedCalls,
  }
}

function buildLoopDetail(batch: ToolBatchSummary, count: number, windowSize: number): string {
  const toolLabel = batch.tools.join(', ')
  return `Detected the same normalized tool-call batch for ${toolLabel} ${count} times within the last ${windowSize} tracked batches.`
}

function buildWarningMessage(batch: ToolBatchSummary, count: number, config: ResolvedLoopGuardConfig): string {
  if (config.warningMessage) {
    return config.warningMessage
  }

  const toolLabel = batch.tools.join(', ')
  return `Loop guard warning: the same tool-call batch for ${toolLabel} has been repeated ${count} times. Do not repeat the same tool calls with the same arguments. Either answer with the current findings, explain the blocker, or choose a materially different next step.`
}

function buildHardStopMessage(batch: ToolBatchSummary, count: number, config: ResolvedLoopGuardConfig): string {
  if (config.hardStopMessage) {
    return config.hardStopMessage
  }

  const toolLabel = batch.tools.join(', ')
  return `Stopped because the same tool-call batch for ${toolLabel} was repeated ${count} times within the recent window.`
}

function buildLoopHit(rule: LoopGuardRule, batch: ToolBatchSummary, count: number, detail: string): LoopHit {
  return {
    rule,
    hash: batch.hash,
    count,
    tools: batch.tools,
    detail,
    at: new Date().toISOString(),
  }
}

function buildPendingWarning(
  batch: ToolBatchSummary,
  count: number,
  config: ResolvedLoopGuardConfig
): PendingWarning {
  return {
    hash: batch.hash,
    message: buildWarningMessage(batch, count, config),
    count,
    tools: batch.tools,
  }
}

function getBaseState(state: LoopGuardState, config: ResolvedLoopGuardConfig) {
  const loopDetectionWindow = takeTail(state.loopDetectionWindow ?? [], config.windowSize)
  const loopDetectionWarned = pruneWarned(state.loopDetectionWarned ?? [], loopDetectionWindow)

  return {
    loopDetectionWindow,
    loopDetectionWarned,
    loopDetectionPendingWarning: state.loopDetectionPendingWarning,
  }
}

@Injectable()
@AgentMiddlewareStrategy('LoopGuardMiddleware')
export class LoopGuardMiddleware implements IAgentMiddlewareStrategy<LoopGuardMiddlewareConfig> {
  readonly meta = {
    name: 'LoopGuardMiddleware',
    label: {
      en_US: 'Loop Guard Middleware',
      zh_Hans: '循环工具调用防护中间件',
    },
    icon: {
      type: 'svg',
      value: LoopGuardIcon,
      color: '#E85D0C',
    },
    description: {
      en_US:
        'Detect repeated tool-call batches, warn on the next model turn, and stop the run when the repetition becomes unproductive.',
      zh_Hans:
        '检测重复的工具调用批次，在下一轮模型调用前提醒，并在重复失去产出时终止运行。',
    },
    showStateSchema: false,
    configSchema: {
      type: 'object',
      properties: configSchemaProperties,
      required: [],
    },
  } as TAgentMiddlewareMeta & { showStateSchema?: boolean }

  async createMiddleware(
    options: LoopGuardMiddlewareConfig,
    _context: IAgentMiddlewareContext
  ) {
    options ??= {}
    const parsed = loopGuardSchema.safeParse(options)
    if (!parsed.success) {
      throw new Error(`Invalid loop guard middleware options: ${z4.prettifyError(parsed.error)}`)
    }

    const config = normalizeConfig(parsed.data)
    const jumpTargets: JumpToTarget[] = ['end']

    return {
      name: 'LoopGuardMiddleware',
      stateSchema: loopGuardStateSchema,
      beforeAgent: {
        hook: async (state: LoopGuardState & AgentBuiltInState) => getBaseState(state, config),
      },
      beforeModel: {
        hook: async (state: LoopGuardState & AgentBuiltInState) => {
          const pendingWarning = state.loopDetectionPendingWarning
          if (!config.enabled || !pendingWarning?.message) {
            return undefined
          }

          return {
            messages: [
              new HumanMessage({
                content: pendingWarning.message,
              }),
            ],
            loopDetectionPendingWarning: undefined,
          }
        },
      },
      afterModel: {
        canJumpTo: jumpTargets,
        hook: async (state: LoopGuardState & AgentBuiltInState) => {
          const baseState = getBaseState(state, config)
          if (!config.enabled) {
            return baseState
          }

          const messages = Array.isArray(state.messages) ? state.messages : []
          const lastMessage = messages[messages.length - 1]
          if (!isAIMessage(lastMessage) || !Array.isArray(lastMessage.tool_calls) || lastMessage.tool_calls.length === 0) {
            return baseState
          }

          const batch = normalizeToolBatch(lastMessage.tool_calls, config)
          if (!batch) {
            return baseState
          }

          const loopDetectionWindow = takeTail(
            [...baseState.loopDetectionWindow, batch.hash],
            config.windowSize
          )
          let loopDetectionWarned = pruneWarned(baseState.loopDetectionWarned, loopDetectionWindow)
          const count = loopDetectionWindow.filter((hash) => hash === batch.hash).length
          const detail = buildLoopDetail(batch, count, config.windowSize)
          const shouldScheduleWarning =
            count >= config.warnThreshold && !loopDetectionWarned.includes(batch.hash)
          const loopDetectionPendingWarning = shouldScheduleWarning
            ? buildPendingWarning(batch, count, config)
            : baseState.loopDetectionPendingWarning

          if (shouldScheduleWarning) {
            loopDetectionWarned = pruneWarned([...loopDetectionWarned, batch.hash], loopDetectionWindow)
          }

          if (count >= config.hardLimit) {
            const hit = buildLoopHit('batch_repeat', batch, count, detail)

            if (config.onLoop === 'error') {
              throw new LoopGuardTriggeredError([hit], config.onLoop)
            }

            if (config.onLoop === 'end') {
              return {
                loopDetectionWindow,
                loopDetectionWarned,
                loopDetectionPendingWarning: undefined,
                messages: [
                  cloneAIMessage(lastMessage, { tool_calls: [] }),
                  new AIMessage({
                    content: buildHardStopMessage(batch, count, config),
                  }),
                ],
                jumpTo: 'end' as const,
              }
            }
          }

          return {
            loopDetectionWindow,
            loopDetectionWarned,
            loopDetectionPendingWarning,
          }
        },
      },
    }
  }
}
