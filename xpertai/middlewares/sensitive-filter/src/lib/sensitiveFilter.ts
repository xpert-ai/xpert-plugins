import { z as z4 } from 'zod/v4'
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import type { JSONValue, TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@metad/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  CreateModelClientCommand,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  WrapWorkflowNodeExecutionCommand,
} from '@xpert-ai/plugin-sdk'
import {
  CompiledSensitiveRule,
  LlmDecision,
  LlmFilterConfig,
  LlmModeConfig,
  RuleModeConfig,
  SensitiveFilterConfig,
  SensitiveFilterIcon,
  SensitiveRule,
  WecomNotifyConfig,
  llmDecisionSchema,
  sensitiveFilterConfigSchema,
} from './types.js'

type FilterMode = 'rule' | 'llm'
type MatchPhase = 'input' | 'output'

type ResolvedLlmDecision = {
  matched: boolean
  action?: SensitiveRule['action']
  replacementText?: string
  reason?: string
  categories?: string[]
}

type ResolvedLlmConfig = {
  model: NonNullable<LlmFilterConfig['model']>
  scope: 'input' | 'output' | 'both'
  rulePrompt: string
  systemPrompt: string
  outputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema'
  legacyOnLlmError?: 'block' | 'rewrite'
  legacyErrorRewriteText?: string
  rewriteFallbackText: string
  timeoutMs?: number
}

type ResolvedWecomGroup = {
  webhookUrl: string
}

type ResolvedWecomConfig = {
  groups: ResolvedWecomGroup[]
  timeoutMs: number
}

type AuditEntry = {
  timestamp: string
  mode: FilterMode
  phase: MatchPhase
  matched: boolean
  source: 'rule' | 'llm' | 'error-policy'
  action?: SensitiveRule['action']
  reason?: string
  errorPolicyTriggered: boolean
}

type AuditSnapshot = {
  mode: FilterMode
  finalAction: 'pass' | 'block' | 'rewrite'
  records: AuditEntry[]
  summary: {
    total: number
    matched: number
    blocked: number
    rewritten: number
    errorPolicyTriggered: number
  }
  llmOutput?: {
    requestedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema'
    resolvedOutputMethod?: 'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'
    methodAttempts: Array<'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'>
    fallbackTriggered: boolean
  }
}

type BufferedOutputResolution = {
  finalMessage: AIMessage
  matched: boolean
  source: 'rule' | 'llm' | 'error-policy'
  action?: SensitiveRule['action']
  reason?: string
  errorPolicyTriggered: boolean
}

const SENSITIVE_FILTER_MIDDLEWARE_NAME = 'SensitiveFilterMiddleware'

const DEFAULT_INPUT_BLOCK_MESSAGE = '输入内容触发敏感策略，已拦截。'
const DEFAULT_OUTPUT_BLOCK_MESSAGE = '输出内容触发敏感策略，已拦截。'
const DEFAULT_REWRITE_TEXT = '[已过滤]'
const DEFAULT_WECOM_TIMEOUT_MS = 10000
const CONFIG_PARSE_ERROR = '敏感词过滤配置格式不正确，请检查填写内容。'
const BUSINESS_RULES_VALIDATION_ERROR =
  '请至少配置 1 条有效业务规则（pattern/type/action/scope/severity）。'
const LLM_MODE_VALIDATION_ERROR = '请完善 LLM 过滤配置：需填写过滤模型、生效范围、审核规则说明。'
const INTERNAL_LLM_INVOKE_TAG = 'sensitive-filter/internal-eval'
const INTERNAL_SOURCE_STREAM_TAG = 'sensitive-filter/internal-source-stream'
const INTERNAL_LLM_INVOKE_OPTIONS = {
  tags: [INTERNAL_LLM_INVOKE_TAG],
  metadata: {
    internal: true,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function resolveRuntimeWecomConfig(config: WecomNotifyConfig | null | undefined): ResolvedWecomConfig | null {
  if (!isRecord(config) || config.enabled === false) {
    return null
  }

  const groups: ResolvedWecomGroup[] = []
  const drafts = Array.isArray(config.groups) ? config.groups : []
  for (const item of drafts) {
    if (!isRecord(item)) {
      continue
    }

    const webhookUrl = toNonEmptyString(item.webhookUrl)
    if (!webhookUrl) {
      continue
    }

    groups.push({
      webhookUrl,
    })
  }

  if (groups.length === 0) {
    return null
  }

  const timeoutMs =
    typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? Math.min(Math.floor(config.timeoutMs), 120000)
      : DEFAULT_WECOM_TIMEOUT_MS

  return {
    groups,
    timeoutMs,
  }
}

function buildInternalModelConfig(
  model: NonNullable<LlmFilterConfig['model']>,
): NonNullable<LlmFilterConfig['model']> {
  const options = isRecord(model.options) ? model.options : {}
  return {
    ...model,
    options: {
      ...options,
      streaming: false,
      temperature: typeof options['temperature'] === 'number' ? options['temperature'] : 0,
    },
  }
}

function normalizeForMatching(text: string, normalize: boolean, caseSensitive: boolean): string {
  const source = normalize ? text.trim().replace(/\s+/g, ' ') : text
  return caseSensitive ? source : source.toLowerCase()
}

function extractPrimitiveText(value: unknown): string {
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
          return item['text'] as string
        }
        return ''
      })
      .join('')
  }

  return ''
}

function extractInputText(state: any, runtime: any): string {
  const runtimeState = runtime?.state

  const runtimeHuman = isRecord(runtimeState?.['human']) ? runtimeState['human'] : null
  const stateHuman = isRecord(state?.['human']) ? state['human'] : null

  const candidates: unknown[] = [
    runtimeHuman?.['input'],
    runtimeState?.['input'],
    stateHuman?.['input'],
    state?.['input'],
  ]

  for (const candidate of candidates) {
    const text = extractPrimitiveText(candidate).trim()
    if (text) {
      return text
    }
  }

  return ''
}

function toSnippet(text: string, maxLength = 200): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, maxLength)}...`
}

function buildMatchedNotificationMessage(input: {
  mode: FilterMode
  nodeTitle: string
  finalAction: 'pass' | 'block' | 'rewrite'
  records: AuditEntry[]
  runtimeConfigurable: TAgentRunnableConfigurable | null
  inputSnippet?: string
}): string {
  const modeLabel = input.mode === 'rule' ? '规则模式' : 'LLM 模式'
  const finalActionLabel =
    input.finalAction === 'block' ? '已拦截' : input.finalAction === 'rewrite' ? '已改写' : '放行'
  const phaseLabel = (phase: MatchPhase) => (phase === 'input' ? '输入' : '输出')
  const actionLabel = (action?: SensitiveRule['action']) => {
    if (action === 'block') {
      return '拦截'
    }
    if (action === 'rewrite') {
      return '改写'
    }
    return '未指定'
  }
  const sourceLabel = (source: AuditEntry['source']) => {
    if (source === 'rule') {
      return '规则'
    }
    if (source === 'llm') {
      return 'LLM'
    }
    return '异常兜底策略'
  }
  const reasonLabel = (reason?: string) => {
    if (!reason) {
      return '无'
    }
    if (reason === 'llm') {
      return 'LLM判定命中（模型未返回具体原因）'
    }
    if (reason.startsWith('llm:')) {
      return `LLM判定：${reason.replace('llm:', '') || '命中'}`
    }
    if (reason.startsWith('rule:')) {
      return `命中规则 ${reason.replace('rule:', '')}`
    }
    if (reason.startsWith('llm-error:')) {
      return `LLM判定异常: ${reason.replace('llm-error:', '')}`
    }
    if (reason.startsWith('llm-fail-open:')) {
      return `LLM故障放行: ${reason.replace('llm-fail-open:', '')}`
    }
    return reason
  }

  const matched = input.records.filter((entry) => entry.matched)
  const now = new Date()
  const alertTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(
    now.getSeconds(),
  ).padStart(2, '0')}`
  const lines: string[] = [
    '【敏感内容告警】',
    `节点：${input.nodeTitle || SENSITIVE_FILTER_MIDDLEWARE_NAME}`,
    `模式：${modeLabel}`,
    `处理结果：${finalActionLabel}`,
    `命中数量：${matched.length}`,
    `告警时间：${alertTime}`,
  ]

  if (input.runtimeConfigurable?.thread_id) {
    lines.push(`会话ID：${input.runtimeConfigurable.thread_id}`)
  }
  if (input.runtimeConfigurable?.executionId) {
    lines.push(`执行ID：${input.runtimeConfigurable.executionId}`)
  }
  if (input.inputSnippet?.trim()) {
    lines.push(`最近输入片段：${input.inputSnippet}`)
  }

  lines.push('命中详情：')
  matched.forEach((entry, index) => {
    lines.push(
      `${index + 1}. 阶段=${phaseLabel(entry.phase)}，来源=${sourceLabel(entry.source)}，动作=${actionLabel(entry.action)}，依据=${reasonLabel(entry.reason)}`,
    )
  })

  return lines.join('\n')
}

function getSeverityWeight(severity: 'high' | 'medium'): number {
  return severity === 'high' ? 2 : 1
}

function pickWinningRule(matches: CompiledSensitiveRule[]): CompiledSensitiveRule | null {
  if (matches.length === 0) {
    return null
  }

  let winner: CompiledSensitiveRule = matches[0]!
  for (const current of matches.slice(1)) {
    const currentWeight = getSeverityWeight(current.severity)
    const winnerWeight = getSeverityWeight(winner.severity)

    if (currentWeight > winnerWeight) {
      winner = current
      continue
    }

    if (currentWeight === winnerWeight && current.index < winner.index) {
      winner = current
    }
  }

  return winner
}

function rewriteTextByRule(_source: string, rule: CompiledSensitiveRule, _caseSensitive: boolean): string {
  const replacement = rule.replacementText?.trim() || DEFAULT_REWRITE_TEXT

  // Rewrite replaces the full sentence to avoid semantic leftovers.
  return replacement
}

function findMatches(
  text: string,
  phase: MatchPhase,
  rules: CompiledSensitiveRule[],
  normalize: boolean,
  caseSensitive: boolean,
): CompiledSensitiveRule[] {
  if (!text) {
    return []
  }

  const matchTarget = normalizeForMatching(text, normalize, caseSensitive)

  return rules.filter((rule) => {
    if (rule.scope !== 'both' && rule.scope !== phase) {
      return false
    }

    if (rule.type === 'keyword') {
      return matchTarget.includes(rule.normalizedPattern)
    }

    return Boolean(rule.matchRegex?.test(matchTarget))
  })
}

function extractModelResponseText(response: any): string {
  if (typeof response === 'string') {
    return response
  }

  if (isRecord(response)) {
    return extractPrimitiveText(response['content'])
  }

  return ''
}

function replaceModelResponseText(response: any, text: string): AIMessage {
  if (isRecord(response) && 'content' in response) {
    response['content'] = text
    return response as unknown as AIMessage
  }

  return new AIMessage(text)
}

function cloneAiMessage(source: AIMessage): AIMessage {
  return new AIMessage({
    content: source.content,
    additional_kwargs: source.additional_kwargs,
    response_metadata: source.response_metadata,
    tool_calls: source.tool_calls,
    invalid_tool_calls: source.invalid_tool_calls,
    usage_metadata: source.usage_metadata,
    id: source.id,
    name: source.name,
  })
}

function cloneAiMessageWithText(source: AIMessage, text: string): AIMessage {
  const cloned = cloneAiMessage(source)
  cloned.content = text
  return cloned
}

function toAiMessageChunk(value: unknown): AIMessageChunk | null {
  if (value instanceof AIMessageChunk) {
    return value
  }

  if (!isRecord(value) || !('content' in value)) {
    return null
  }

  return new AIMessageChunk({
    content: value['content'] as any,
    additional_kwargs: isRecord(value['additional_kwargs']) ? value['additional_kwargs'] : {},
    response_metadata: isRecord(value['response_metadata']) ? value['response_metadata'] : {},
    tool_call_chunks: Array.isArray(value['tool_call_chunks']) ? value['tool_call_chunks'] : [],
    tool_calls: Array.isArray(value['tool_calls']) ? value['tool_calls'] : [],
    invalid_tool_calls: Array.isArray(value['invalid_tool_calls']) ? value['invalid_tool_calls'] : [],
    usage_metadata: isRecord(value['usage_metadata']) ? (value['usage_metadata'] as any) : undefined,
    id: typeof value['id'] === 'string' ? value['id'] : undefined,
  })
}

function toAiMessage(value: unknown): AIMessage {
  if (value instanceof AIMessage) {
    return value
  }

  if (value instanceof AIMessageChunk) {
    return new AIMessage({
      content: value.content,
      additional_kwargs: value.additional_kwargs,
      response_metadata: value.response_metadata,
      tool_calls: value.tool_calls,
      invalid_tool_calls: value.invalid_tool_calls,
      usage_metadata: value.usage_metadata,
      id: value.id,
      name: value.name,
    })
  }

  if (isRecord(value) && 'content' in value) {
    return new AIMessage({
      content: value['content'] as any,
      additional_kwargs: isRecord(value['additional_kwargs']) ? value['additional_kwargs'] : {},
      response_metadata: isRecord(value['response_metadata']) ? value['response_metadata'] : {},
      tool_calls: Array.isArray(value['tool_calls']) ? value['tool_calls'] : [],
      invalid_tool_calls: Array.isArray(value['invalid_tool_calls']) ? value['invalid_tool_calls'] : [],
      usage_metadata: isRecord(value['usage_metadata']) ? (value['usage_metadata'] as any) : undefined,
      id: typeof value['id'] === 'string' ? value['id'] : undefined,
      name: typeof value['name'] === 'string' ? value['name'] : undefined,
    })
  }

  return new AIMessage(extractPrimitiveText(value))
}

function buildInternalSourceOptions(options: Record<string, any> | undefined) {
  const tags = Array.isArray(options?.tags) ? options.tags : []
  const metadata = isRecord(options?.metadata) ? options.metadata : {}

  return {
    ...(options ?? {}),
    tags: [...tags, INTERNAL_SOURCE_STREAM_TAG],
    metadata: {
      ...metadata,
      internal: true,
    },
  }
}

class BufferedOutputProxyChatModel extends BaseChatModel {
  constructor(
    private readonly innerModel: BaseLanguageModel,
    private readonly resolveOutput: (message: AIMessage, outputText: string) => Promise<BufferedOutputResolution>,
  ) {
    super({})
  }

  override _llmType() {
    return 'sensitive-filter-output-proxy'
  }

  private async collectInnerMessage(
    messages: BaseMessage[],
    options?: Record<string, any>,
  ): Promise<AIMessage> {
    const internalOptions = buildInternalSourceOptions(options)
    const streamFn = (this.innerModel as any)?.stream

    if (typeof streamFn === 'function') {
      const stream = await streamFn.call(this.innerModel, messages, internalOptions)
      if (stream && typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
        let mergedChunk: AIMessageChunk | null = null
        for await (const rawChunk of stream as AsyncIterable<unknown>) {
          const chunk = toAiMessageChunk(rawChunk)
          if (!chunk) {
            continue
          }
          mergedChunk = mergedChunk ? mergedChunk.concat(chunk) : chunk
        }

        if (mergedChunk) {
          return toAiMessage(mergedChunk)
        }
      }
    }

    return toAiMessage(await (this.innerModel as any).invoke(messages, internalOptions))
  }

  private async finalizeMessage(
    messages: BaseMessage[],
    options?: Record<string, any>,
  ): Promise<BufferedOutputResolution> {
    const sourceMessage = await this.collectInnerMessage(messages, options)
    return this.resolveOutput(sourceMessage, extractPrimitiveText(sourceMessage.content))
  }

  override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const resolved = await this.finalizeMessage(messages, options as Record<string, any> | undefined)
    return {
      generations: [
        {
          text: extractPrimitiveText(resolved.finalMessage.content),
          message: resolved.finalMessage,
        },
      ],
    }
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const resolved = await this.finalizeMessage(messages, options as Record<string, any> | undefined)
    const finalText = extractPrimitiveText(resolved.finalMessage.content)

    if (!finalText) {
      return
    }

    const generationChunk = new ChatGenerationChunk({
      message: new AIMessageChunk({
        content: finalText,
        id: resolved.finalMessage.id,
      }),
      text: finalText,
    })

    yield generationChunk
    await runManager?.handleLLMNewToken(finalText, undefined, undefined, undefined, undefined, {
      chunk: generationChunk,
    })
  }
}

function rewriteModelRequestInput(request: any, rewrittenText: string): any {
  if (!Array.isArray(request?.messages) || request.messages.length === 0) {
    return request
  }

  const messages = [...request.messages]
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as any
    const messageType = typeof message?._getType === 'function' ? message._getType() : message?.type
    if (messageType !== 'human') {
      continue
    }

    const content = message?.content
    if (typeof content === 'string') {
      messages[i] = new HumanMessage(rewrittenText)
      return { ...request, messages }
    }

    if (Array.isArray(content)) {
      let replaced = false
      const nextContent = content.map((part: any) => {
        if (!replaced && isRecord(part) && part['type'] === 'text') {
          replaced = true
          return {
            ...part,
            text: rewrittenText,
          }
        }
        return part
      })

      if (!replaced) {
        nextContent.push({
          type: 'text',
          text: rewrittenText,
        })
      }

      messages[i] = new HumanMessage({ content: nextContent } as any)
      return { ...request, messages }
    }

    messages[i] = new HumanMessage(rewrittenText)
    return { ...request, messages }
  }

  return request
}

function normalizeRuleDrafts(input: Array<Partial<SensitiveRule> | null | undefined>): SensitiveRule[] {
  const rules: SensitiveRule[] = []

  for (const [index, draft] of input.entries()) {
    if (!isRecord(draft)) {
      continue
    }

    const id = toNonEmptyString(draft['id'])
    const pattern = toNonEmptyString(draft['pattern'])
    const type = toNonEmptyString(draft['type']) as SensitiveRule['type'] | null
    const scope = toNonEmptyString(draft['scope']) as SensitiveRule['scope'] | null
    const severity = toNonEmptyString(draft['severity']) as SensitiveRule['severity'] | null
    const action = toNonEmptyString(draft['action']) as SensitiveRule['action'] | null
    const replacementText = toNonEmptyString(draft['replacementText']) ?? undefined

    const hasAnyValue = Boolean(id || pattern || type || scope || severity || action || replacementText)
    if (!hasAnyValue) {
      continue
    }

    if (!pattern || !type || !action || !scope || !severity) {
      continue
    }

    if (!['keyword', 'regex'].includes(type)) {
      continue
    }
    if (!['input', 'output', 'both'].includes(scope)) {
      continue
    }
    if (!['high', 'medium'].includes(severity)) {
      continue
    }
    if (!['block', 'rewrite'].includes(action)) {
      continue
    }

    rules.push({
      id: id ?? `rule-${index + 1}`,
      pattern,
      type,
      scope,
      severity,
      action,
      replacementText,
    })
  }

  return rules
}

function modeIncludesScope(scope: 'input' | 'output' | 'both', phase: MatchPhase): boolean {
  return scope === 'both' || scope === phase
}

function buildInternalLlmPrompt(rulePrompt: string): string {
  return (
    '你不是聊天助手，你是严格的敏感内容分类器。' +
    '\n你的唯一任务是根据审核规则判断文本是否命中，不要提供安全建议、解释性回复或扩展内容。' +
    '\n这是硬规则匹配任务：当审核规则写明“出现/包含/只要命中/必须命中”时，必须严格按字面执行，不允许自由裁量。' +
    '\n你只能返回 JSON，不要输出额外说明。' +
    '\nJSON字段: matched(boolean), action("block"|"rewrite"), replacementText(string), reason(string), categories(string[]).' +
    '\n命中时请尽量给出 replacementText；未命中时返回 {"matched": false}。' +
    '\n说明：系统会统一执行改写策略，即便你返回 action=block 也会按 rewrite 处理。' +
    `\n\n用户审核规则：\n${rulePrompt}`
  )
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) {
    return null
  }

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      depth++
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function parseLlmDecision(
  raw: unknown,
  rewriteFallbackText: string,
): ResolvedLlmDecision {
  let payload: unknown = raw

  if (typeof payload === 'string') {
    const rawText = payload
    try {
      payload = JSON.parse(payload)
    } catch {
      const extracted = extractFirstJsonObject(rawText)
      if (!extracted) {
        throw new Error('LLM decision is not valid JSON string')
      }
      try {
        payload = JSON.parse(extracted)
      } catch {
        throw new Error('LLM decision is not valid JSON string')
      }
    }
  }

  if (isRecord(payload) && !('matched' in payload) && 'content' in payload) {
    const content = extractPrimitiveText(payload['content']).trim()
    if (!content) {
      throw new Error('LLM decision content is empty')
    }
    try {
      payload = JSON.parse(content)
    } catch {
      const extracted = extractFirstJsonObject(content)
      if (!extracted) {
        throw new Error('LLM decision content is not valid JSON')
      }
      try {
        payload = JSON.parse(extracted)
      } catch {
        throw new Error('LLM decision content is not valid JSON')
      }
    }
  }

  const parsed = llmDecisionSchema.safeParse(payload as LlmDecision)
  if (!parsed.success) {
    throw new Error(`Invalid LLM decision: ${z4.prettifyError(parsed.error as any)}`)
  }

  const decision = parsed.data
  const reason = toNonEmptyString(decision.reason) ?? undefined
  const categories = Array.isArray(decision.categories) ? decision.categories.filter(Boolean) : undefined

  if (!decision.matched) {
    return {
      matched: false,
      reason,
      categories,
    }
  }

  return {
    matched: true,
    action: 'rewrite',
    replacementText: toNonEmptyString(decision.replacementText) ?? rewriteFallbackText,
    reason,
    categories,
  }
}

function resolveRuntimeLlmConfig(config: LlmFilterConfig | null | undefined): ResolvedLlmConfig {
  if (!isRecord(config)) {
    throw new Error(LLM_MODE_VALIDATION_ERROR)
  }

  const model = isRecord(config.model) ? (config.model as NonNullable<LlmFilterConfig['model']>) : null
  const scope = toNonEmptyString(config.scope) as ResolvedLlmConfig['scope'] | null
  const rulePrompt = toNonEmptyString(config.rulePrompt) ?? toNonEmptyString(config.systemPrompt)
  if (!model || !scope || !rulePrompt) {
    throw new Error(LLM_MODE_VALIDATION_ERROR)
  }

  const outputMethodRaw = toNonEmptyString(config.outputMethod) as ResolvedLlmConfig['outputMethod'] | null
  const outputMethod = ['functionCalling', 'jsonMode', 'jsonSchema'].includes(outputMethodRaw ?? '')
    ? (outputMethodRaw as ResolvedLlmConfig['outputMethod'])
    : 'jsonMode'

  const timeoutMs =
    typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? Math.min(Math.floor(config.timeoutMs), 120000)
      : undefined

  const legacyOnLlmError = toNonEmptyString(config.onLlmError) as 'block' | 'rewrite' | null
  const legacyErrorRewriteText = toNonEmptyString(config.errorRewriteText) ?? undefined

  return {
    model,
    scope,
    rulePrompt,
    systemPrompt: buildInternalLlmPrompt(rulePrompt),
    outputMethod,
    legacyOnLlmError: legacyOnLlmError ?? undefined,
    legacyErrorRewriteText,
    rewriteFallbackText: toNonEmptyString(config.rewriteFallbackText) ?? DEFAULT_REWRITE_TEXT,
    timeoutMs,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number | null): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LLM filter timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function dispatchWecomNotification(
  wecomConfig: ResolvedWecomConfig | null,
  message: string,
): Promise<void> {
  if (!wecomConfig || !message.trim()) {
    return
  }

  const payload: Record<string, unknown> = {
    msgtype: 'text',
    text: {
      content: message,
    },
  }

  for (const group of wecomConfig.groups) {
    try {
      const response = await withTimeout(
        fetch(group.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
        wecomConfig.timeoutMs,
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const body = await response.json().catch(() => null)
      const rawErrCode = isRecord(body) ? body['errcode'] : undefined
      const errCode = typeof rawErrCode === 'number' ? rawErrCode : Number(rawErrCode)
      if (!Number.isFinite(errCode) || errCode !== 0) {
        const errMsg = isRecord(body) ? String(body['errmsg'] ?? '') : 'unknown'
        throw new Error(`errcode=${String(rawErrCode ?? 'unknown')}, errmsg=${errMsg}`)
      }
    } catch (error) {
      // Notify failure should not break model execution.
      console.warn(
        `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to send WeCom notification to ${group.webhookUrl}: ${getErrorText(error)}`,
      )
    }
  }
}

function normalizeConfigurable(input: unknown): TAgentRunnableConfigurable | null {
  if (!isRecord(input)) {
    return null
  }

  return input as TAgentRunnableConfigurable
}

function buildOutputMethodCandidates(
  preferred: 'functionCalling' | 'jsonMode' | 'jsonSchema',
): Array<'functionCalling' | 'jsonMode' | 'jsonSchema'> {
  const queue: Array<'functionCalling' | 'jsonMode' | 'jsonSchema'> = [preferred, 'functionCalling', 'jsonMode', 'jsonSchema']
  const unique: Array<'functionCalling' | 'jsonMode' | 'jsonSchema'> = []
  for (const method of queue) {
    if (!unique.includes(method)) {
      unique.push(method)
    }
  }
  return unique
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? '')
}

function isUnsupportedStructuredOutputError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase()
  const patterns = [
    'response_format type is unavailable',
    'invalid response_format',
    'response_format',
    'unsupported schema',
    'not support',
  ]
  return patterns.some((pattern) => message.includes(pattern))
}

function isMissingWrapWorkflowHandlerError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase()
  return message.includes('no handler found') && message.includes('wrapworkflownodeexecutioncommand')
}

function isMissingCreateModelHandlerError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase()
  return (
    message.includes('no handler found') &&
    (message.includes('createmodelclientcommand') || message.includes('create model client'))
  )
}

function shouldFailOpenOnLlmError(error: unknown): boolean {
  return isMissingWrapWorkflowHandlerError(error) || isMissingCreateModelHandlerError(error)
}

async function runWithWrapWorkflowFallback<T>(
  runTracked: () => Promise<T>,
  runFallback: () => Promise<T>,
): Promise<T> {
  try {
    return await runTracked()
  } catch (error) {
    if (isMissingWrapWorkflowHandlerError(error)) {
      return runFallback()
    }
    throw error
  }
}

@Injectable()
@AgentMiddlewareStrategy(SENSITIVE_FILTER_MIDDLEWARE_NAME)
export class SensitiveFilterMiddleware implements IAgentMiddlewareStrategy<SensitiveFilterConfig> {
  @Inject(CommandBus)
  private readonly commandBus: CommandBus

  readonly meta: TAgentMiddlewareMeta = {
    name: SENSITIVE_FILTER_MIDDLEWARE_NAME,
    label: {
      en_US: 'Sensitive Filter Middleware',
      zh_Hans: '敏感内容过滤中间件',
    },
    description: {
      en_US:
        'Filter sensitive content before input and after output using rule mode or LLM prompt mode (mutually exclusive).',
      zh_Hans: '支持规则模式或 LLM 提示词模式（互斥）进行输入/输出敏感内容过滤。',
    },
    icon: {
      type: 'svg',
      value: SensitiveFilterIcon,
    },
    configSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          title: {
            en_US: 'Filter Mode',
            zh_Hans: '过滤模式',
          },
          description: {
            en_US: 'Choose exactly one mode: Rule or LLM.',
            zh_Hans: '二选一：规则模式或 LLM 模式。',
          },
          enum: ['rule', 'llm'],
          default: 'rule',
          'x-ui': {
            enumLabels: {
              rule: { en_US: 'Rule Mode', zh_Hans: '规则模式' },
              llm: { en_US: 'LLM Mode', zh_Hans: 'LLM 模式' },
            },
          },
        },
        rules: {
          type: 'array',
          'x-ui': {
            span: 2,
          },
          title: {
            en_US: 'Business Rules',
            zh_Hans: '业务规则',
          },
          description: {
            en_US:
              'Used in rule mode. Draft rows are allowed during editing. Runtime requires valid fields.',
            zh_Hans: '规则模式使用。编辑阶段允许草稿行，运行阶段要求有效规则字段。',
          },
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                title: { en_US: 'Rule ID', zh_Hans: '规则标识' },
                description: {
                  en_US: 'Optional. Auto-generated when empty.',
                  zh_Hans: '可选。留空时系统自动生成。',
                },
              },
              pattern: {
                type: 'string',
                title: { en_US: 'Pattern', zh_Hans: '匹配内容' },
              },
              type: {
                type: 'string',
                title: { en_US: 'Type', zh_Hans: '匹配类型' },
                enum: ['keyword', 'regex'],
                'x-ui': {
                  enumLabels: {
                    keyword: { en_US: 'Keyword', zh_Hans: '关键词' },
                    regex: { en_US: 'Regex', zh_Hans: '正则表达式' },
                  },
                },
              },
              scope: {
                type: 'string',
                title: { en_US: 'Scope', zh_Hans: '生效范围' },
                enum: ['input', 'output', 'both'],
                'x-ui': {
                  enumLabels: {
                    input: { en_US: 'Input', zh_Hans: '仅输入' },
                    output: { en_US: 'Output', zh_Hans: '仅输出' },
                    both: { en_US: 'Both', zh_Hans: '输入和输出' },
                  },
                },
              },
              severity: {
                type: 'string',
                title: { en_US: 'Severity', zh_Hans: '优先级' },
                enum: ['high', 'medium'],
                'x-ui': {
                  enumLabels: {
                    high: { en_US: 'High', zh_Hans: '高' },
                    medium: { en_US: 'Medium', zh_Hans: '中' },
                  },
                },
              },
              action: {
                type: 'string',
                title: { en_US: 'Action', zh_Hans: '命中动作' },
                enum: ['block', 'rewrite'],
                'x-ui': {
                  enumLabels: {
                    block: { en_US: 'Block', zh_Hans: '拦截' },
                    rewrite: { en_US: 'Rewrite', zh_Hans: '整句替换' },
                  },
                },
              },
              replacementText: {
                type: 'string',
                title: { en_US: 'Replacement Text', zh_Hans: '替换文本（可选）' },
              },
            },
            required: ['pattern', 'type', 'action', 'scope', 'severity'],
          },
        },
        caseSensitive: {
          type: 'boolean',
          default: false,
          title: { en_US: 'Case Sensitive', zh_Hans: '区分大小写' },
          'x-ui': {
            span: 2,
          },
        },
        normalize: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Normalize Text', zh_Hans: '文本标准化' },
          'x-ui': {
            span: 2,
          },
        },
        llm: {
          type: 'object',
          'x-ui': {
            span: 2,
          },
          title: {
            en_US: 'LLM Filter Config',
            zh_Hans: 'LLM 过滤配置',
          },
          description: {
            en_US: 'Used only when mode=llm.',
            zh_Hans: '仅在 mode=llm 时生效。',
          },
          properties: {
            model: {
              type: 'object',
              title: {
                en_US: 'Filter Model',
                zh_Hans: '过滤模型',
              },
              'x-ui': {
                component: 'ai-model-select',
                span: 2,
                inputs: {
                  modelType: 'llm',
                  hiddenLabel: true,
                },
              },
            },
            scope: {
              type: 'string',
              title: { en_US: 'Scope', zh_Hans: '生效范围' },
              enum: ['input', 'output', 'both'],
              'x-ui': {
                enumLabels: {
                  input: { en_US: 'Input', zh_Hans: '仅输入' },
                  output: { en_US: 'Output', zh_Hans: '仅输出' },
                  both: { en_US: 'Both', zh_Hans: '输入和输出' },
                },
              },
            },
            rulePrompt: {
              type: 'string',
              title: { en_US: 'Rule Prompt', zh_Hans: '审核规则说明' },
              description: {
                en_US:
                  'Describe your moderation rules in natural language. No JSON format is required.',
                zh_Hans: '用自然语言描述审核规则，无需手写 JSON 格式。',
              },
              'x-ui': {
                component: 'textarea',
                span: 2,
                placeholder: {
                  en_US: 'e.g. Rewrite violent/privacy-sensitive content into a safe neutral response.',
                  zh_Hans: '例如：涉及暴力或隐私泄露内容时，改写为安全中性表达。',
                },
              },
            },
            rewriteFallbackText: {
              type: 'string',
              title: { en_US: 'Rewrite Fallback Text', zh_Hans: '改写兜底文本' },
            },
            timeoutMs: {
              type: 'number',
              title: { en_US: 'Timeout (ms)', zh_Hans: '超时毫秒' },
            },
          },
          required: ['model', 'scope', 'rulePrompt'],
        },
        wecom: {
          type: 'object',
          'x-ui': {
            span: 2,
          },
          title: {
            en_US: 'WeCom Notify',
            zh_Hans: '企业微信群通知',
          },
          description: {
            en_US: 'When sensitive content is matched, send alerts to configured WeCom group webhooks.',
            zh_Hans: '敏感内容命中后，发送告警到已配置的企业微信群 webhook。',
          },
          properties: {
            enabled: {
              type: 'boolean',
              default: true,
              title: { en_US: 'Enabled', zh_Hans: '启用通知' },
            },
            timeoutMs: {
              type: 'number',
              title: { en_US: 'Timeout (ms)', zh_Hans: '请求超时(毫秒)' },
            },
            groups: {
              type: 'array',
              title: { en_US: 'Group Webhooks', zh_Hans: '群聊 Webhook 配置' },
              items: {
                type: 'object',
                properties: {
                  webhookUrl: {
                    type: 'string',
                    title: { en_US: 'Webhook URL', zh_Hans: 'Webhook 地址' },
                  },
                },
              },
            },
          },
        },
      },
      required: ['mode'],
      allOf: [
        {
          if: {
            properties: {
              mode: {
                const: 'llm',
              },
            },
          },
          then: {
            required: ['llm'],
          },
        },
      ],
    } as TAgentMiddlewareMeta['configSchema'],
  }

  async createMiddleware(
    options: SensitiveFilterConfig,
    context: IAgentMiddlewareContext,
  ): Promise<AgentMiddleware> {
    const parsed = sensitiveFilterConfigSchema.safeParse(options ?? {})
    if (!parsed.success) {
      throw new Error(CONFIG_PARSE_ERROR)
    }

    if (parsed.data.mode === 'llm') {
      return this.createLlmModeMiddleware(parsed.data as LlmModeConfig, context)
    }

    return this.createRuleModeMiddleware(parsed.data as RuleModeConfig, context)
  }

  private createRuleModeMiddleware(config: RuleModeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const caseSensitive = config.caseSensitive ?? false
    const normalize = config.normalize ?? true
    const wecomConfig = resolveRuntimeWecomConfig(config.wecom)

    const customRules = normalizeRuleDrafts(config.rules ?? [])
    const allRules = [...customRules]
    const hasEffectiveRules = allRules.length > 0

    let compiledRulesCache: CompiledSensitiveRule[] | null = null
    const getCompiledRules = (): CompiledSensitiveRule[] => {
      if (compiledRulesCache) {
        return compiledRulesCache
      }

      compiledRulesCache = allRules.map((rule, index) => {
        const normalizedPattern =
          rule.type === 'keyword' ? normalizeForMatching(rule.pattern, normalize, caseSensitive) : rule.pattern

        if (rule.type === 'regex') {
          try {
            return {
              ...rule,
              index,
              normalizedPattern,
              matchRegex: new RegExp(rule.pattern, caseSensitive ? '' : 'i'),
              rewriteRegex: new RegExp(rule.pattern, caseSensitive ? 'g' : 'gi'),
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`请完善规则配置：规则「${rule.id}」的正则表达式不合法（${message}）。`)
          }
        }

        return {
          ...rule,
          index,
          normalizedPattern,
        }
      }) as CompiledSensitiveRule[]

      return compiledRulesCache
    }

    let inputBlockedMessage: string | null = null
    let pendingInputRewrite: string | null = null
    let bufferedOutputResolution: BufferedOutputResolution | null = null
    let finalAction: 'pass' | 'block' | 'rewrite' = 'pass'
    let auditEntries: AuditEntry[] = []
    let runtimeConfigurable: TAgentRunnableConfigurable | null = null
    let latestInputSnippet = ''

    const resetRunState = () => {
      inputBlockedMessage = null
      pendingInputRewrite = null
      bufferedOutputResolution = null
      finalAction = 'pass'
      auditEntries = []
      latestInputSnippet = ''
    }

    const pushAudit = (entry: Omit<AuditEntry, 'timestamp' | 'mode'>) => {
      auditEntries.push({
        ...entry,
        timestamp: new Date().toISOString(),
        mode: 'rule',
      })
    }

    const assignRuntimeConfigurable = (runtimeLike: unknown) => {
      const configurable = normalizeConfigurable((runtimeLike as any)?.configurable)
      if (!configurable) {
        return
      }
      if (configurable.thread_id && configurable.executionId) {
        runtimeConfigurable = configurable
      }
    }

    const buildAuditSnapshot = (): AuditSnapshot => {
      const summary = {
        total: auditEntries.length,
        matched: auditEntries.filter((entry) => entry.matched).length,
        blocked: auditEntries.filter((entry) => entry.action === 'block').length,
        rewritten: auditEntries.filter((entry) => entry.action === 'rewrite').length,
        errorPolicyTriggered: auditEntries.filter((entry) => entry.errorPolicyTriggered).length,
      }

      return {
        mode: 'rule',
        finalAction,
        records: auditEntries,
        summary,
      }
    }

    const persistAuditSnapshot = async () => {
      const configurable = runtimeConfigurable
      if (!configurable?.thread_id || !configurable.executionId || !this.commandBus) {
        return
      }

      const { thread_id, checkpoint_ns, checkpoint_id, executionId } = configurable
      const snapshot = buildAuditSnapshot()
      const writeSnapshot = async () => {
        return {
          state: snapshot as unknown as Record<string, unknown>,
          output: snapshot as unknown as JSONValue,
        }
      }

      await runWithWrapWorkflowFallback(
        async () => {
          await this.commandBus.execute(
            new WrapWorkflowNodeExecutionCommand(writeSnapshot, {
              execution: {
                category: 'workflow',
                type: 'middleware',
                title: `${context.node.title} Audit`,
                inputs: {
                  mode: snapshot.mode,
                  total: snapshot.summary.total,
                },
                parentId: executionId,
                threadId: thread_id,
                checkpointNs: checkpoint_ns,
                checkpointId: checkpoint_id,
                agentKey: context.node.key,
              },
            }),
          )
          return undefined
        },
        async () => {
          await writeSnapshot()
          return undefined
        },
      )
    }

    return {
      name: SENSITIVE_FILTER_MIDDLEWARE_NAME,
      beforeAgent: async (state, runtime) => {
        resetRunState()
        assignRuntimeConfigurable(runtime)

        if (!hasEffectiveRules) {
          throw new Error(BUSINESS_RULES_VALIDATION_ERROR)
        }
        const compiledRules = getCompiledRules()

        const safeState = state ?? {}
        const safeRuntime = runtime ?? {}

        const inputText = extractInputText(safeState, safeRuntime)
        latestInputSnippet = toSnippet(inputText)
        const inputMatches = findMatches(inputText, 'input', compiledRules, normalize, caseSensitive)
        const winner = pickWinningRule(inputMatches)

        if (!winner) {
          pushAudit({
            phase: 'input',
            matched: false,
            source: 'rule',
            errorPolicyTriggered: false,
          })
          return undefined
        }

        pushAudit({
          phase: 'input',
          matched: true,
          source: 'rule',
          action: winner.action,
          reason: `rule:${winner.id}`,
          errorPolicyTriggered: false,
        })

        if (winner.action === 'block') {
          finalAction = 'block'
          inputBlockedMessage = winner.replacementText?.trim() || DEFAULT_INPUT_BLOCK_MESSAGE
          return undefined
        }

        finalAction = 'rewrite'
        pendingInputRewrite = rewriteTextByRule(inputText, winner, caseSensitive)
        return undefined
      },
      wrapModelCall: async (request, handler) => {
        assignRuntimeConfigurable(request?.runtime)
        if (!hasEffectiveRules) {
          throw new Error(BUSINESS_RULES_VALIDATION_ERROR)
        }
        const compiledRules = getCompiledRules()

        if (inputBlockedMessage) {
          return new AIMessage(inputBlockedMessage)
        }

        const modelRequest = pendingInputRewrite ? rewriteModelRequestInput(request, pendingInputRewrite) : request
        pendingInputRewrite = null
        bufferedOutputResolution = null
        const shouldBufferOutput = compiledRules.some((rule) => rule.scope === 'output' || rule.scope === 'both')
        const effectiveRequest = shouldBufferOutput
          ? {
              ...modelRequest,
              model: new BufferedOutputProxyChatModel(modelRequest.model as BaseLanguageModel, async (message, outputText) => {
                if (message.tool_calls?.length || message.invalid_tool_calls?.length) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'rule',
                    reason: 'tool-call-skip',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                const outputMatches = findMatches(outputText, 'output', compiledRules, normalize, caseSensitive)
                const winner = pickWinningRule(outputMatches)

                if (!winner) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'rule',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                const finalText =
                  winner.action === 'block'
                    ? winner.replacementText?.trim() || DEFAULT_OUTPUT_BLOCK_MESSAGE
                    : rewriteTextByRule(outputText, winner, caseSensitive)

                bufferedOutputResolution = {
                  finalMessage: cloneAiMessageWithText(message, finalText),
                  matched: true,
                  source: 'rule',
                  action: winner.action,
                  reason: `rule:${winner.id}`,
                  errorPolicyTriggered: false,
                }
                return bufferedOutputResolution
              }),
            }
          : modelRequest

        const response = await handler(effectiveRequest)

        if (bufferedOutputResolution) {
          pushAudit({
            phase: 'output',
            matched: bufferedOutputResolution.matched,
            source: bufferedOutputResolution.source,
            action: bufferedOutputResolution.action,
            reason: bufferedOutputResolution.reason,
            errorPolicyTriggered: bufferedOutputResolution.errorPolicyTriggered,
          })

          if (bufferedOutputResolution.matched && bufferedOutputResolution.action) {
            finalAction = bufferedOutputResolution.action === 'block' ? 'block' : 'rewrite'
          }

          return response
        }

        const outputText = extractModelResponseText(response)
        const outputMatches = findMatches(outputText, 'output', compiledRules, normalize, caseSensitive)
        const winner = pickWinningRule(outputMatches)

        if (!winner) {
          pushAudit({
            phase: 'output',
            matched: false,
            source: 'rule',
            errorPolicyTriggered: false,
          })
          return response
        }

        pushAudit({
          phase: 'output',
          matched: true,
          source: 'rule',
          action: winner.action,
          reason: `rule:${winner.id}`,
          errorPolicyTriggered: false,
        })

        if (winner.action === 'block') {
          finalAction = 'block'
          const blockedOutput = winner.replacementText?.trim() || DEFAULT_OUTPUT_BLOCK_MESSAGE
          return replaceModelResponseText(response, blockedOutput)
        }

        finalAction = 'rewrite'
        const rewrittenOutput = rewriteTextByRule(outputText, winner, caseSensitive)
        return replaceModelResponseText(response, rewrittenOutput)
      },
      afterAgent: async () => {
        const matchedRecords = auditEntries.filter((entry) => entry.matched)
        const notification =
          matchedRecords.length > 0
            ? buildMatchedNotificationMessage({
                mode: 'rule',
                nodeTitle: context.node.title ?? SENSITIVE_FILTER_MIDDLEWARE_NAME,
                finalAction,
                records: matchedRecords,
                runtimeConfigurable,
                inputSnippet: latestInputSnippet,
              })
            : null

        const [persistResult, notifyResult] = await Promise.allSettled([
          persistAuditSnapshot(),
          notification ? dispatchWecomNotification(wecomConfig, notification) : Promise.resolve(undefined),
        ])

        if (persistResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to persist audit snapshot: ${getErrorText(persistResult.reason)}`,
          )
        }
        if (notifyResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to dispatch WeCom notification: ${getErrorText(notifyResult.reason)}`,
          )
        }
        return undefined
      },
    }
  }

  private createLlmModeMiddleware(config: LlmModeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const llmDraftConfig = config.llm
    const wecomConfig = resolveRuntimeWecomConfig(config.wecom)
    let resolvedLlmConfig: ResolvedLlmConfig | null = null
    let modelPromise: Promise<BaseLanguageModel> | null = null
    const structuredModelPromises = new Map<'functionCalling' | 'jsonMode' | 'jsonSchema', Promise<any>>()

    const getLlmConfig = (): ResolvedLlmConfig => {
      if (!resolvedLlmConfig) {
        resolvedLlmConfig = resolveRuntimeLlmConfig(llmDraftConfig)
      }
      return resolvedLlmConfig
    }

    const ensureModel = async (): Promise<BaseLanguageModel> => {
      const llmConfig = getLlmConfig()
      if (!modelPromise) {
        modelPromise = this.commandBus.execute(
          new CreateModelClientCommand<BaseLanguageModel>(buildInternalModelConfig(llmConfig.model), {
            usageCallback: () => {
              //
            },
          }),
        )
      }
      return modelPromise
    }

    const ensureStructuredModel = async (
      method: 'functionCalling' | 'jsonMode' | 'jsonSchema',
    ): Promise<BaseChatModel> => {
      if (!structuredModelPromises.has(method)) {
        structuredModelPromises.set(
          method,
          (async () => {
            const model = await ensureModel()
            return model.withStructuredOutput?.(llmDecisionSchema, {
              method,
            }) ?? null
          })(),
        )
      }
      return structuredModelPromises.get(method)! as Promise<BaseChatModel>
    }

    let pendingInputRewrite: string | null = null
    let bufferedOutputResolution: BufferedOutputResolution | null = null
    let finalAction: 'pass' | 'rewrite' = 'pass'
    let auditEntries: AuditEntry[] = []
    let runtimeConfigurable: TAgentRunnableConfigurable | null = null
    let latestInputSnippet = ''
    let resolvedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText' | undefined
    let fallbackTriggered = false
    let methodAttempts: Array<'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'> = []

    const resetRunState = () => {
      pendingInputRewrite = null
      bufferedOutputResolution = null
      finalAction = 'pass'
      auditEntries = []
      latestInputSnippet = ''
      resolvedOutputMethod = undefined
      fallbackTriggered = false
      methodAttempts = []
    }

    const pushAudit = (entry: Omit<AuditEntry, 'timestamp' | 'mode'>) => {
      auditEntries.push({
        ...entry,
        timestamp: new Date().toISOString(),
        mode: 'llm',
      })
    }

    const assignRuntimeConfigurable = (runtimeLike: unknown) => {
      const configurable = normalizeConfigurable((runtimeLike as any)?.configurable)
      if (!configurable) {
        return
      }
      if (configurable.thread_id && configurable.executionId) {
        runtimeConfigurable = configurable
      }
    }

    const captureLlmOutputTrace = (trace: {
      requestedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema'
      resolvedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'
      methodAttempts: Array<'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'>
      fallbackTriggered: boolean
    }) => {
      for (const method of trace.methodAttempts) {
        if (!methodAttempts.includes(method)) {
          methodAttempts.push(method)
        }
      }
      resolvedOutputMethod = trace.resolvedOutputMethod
      fallbackTriggered = fallbackTriggered || trace.fallbackTriggered
    }

    const buildAuditSnapshot = (): AuditSnapshot => {
      const summary = {
        total: auditEntries.length,
        matched: auditEntries.filter((entry) => entry.matched).length,
        blocked: auditEntries.filter((entry) => entry.action === 'block').length,
        rewritten: auditEntries.filter((entry) => entry.action === 'rewrite').length,
        errorPolicyTriggered: auditEntries.filter((entry) => entry.errorPolicyTriggered).length,
      }

      return {
        mode: 'llm',
        finalAction,
        records: auditEntries,
        summary,
        llmOutput: resolvedLlmConfig
          ? {
              requestedOutputMethod: resolvedLlmConfig.outputMethod,
              resolvedOutputMethod,
              methodAttempts,
              fallbackTriggered,
            }
          : undefined,
      }
    }

    const persistAuditSnapshot = async () => {
      const configurable = runtimeConfigurable
      if (!configurable?.thread_id || !configurable.executionId || !this.commandBus) {
        return
      }

      const { thread_id, checkpoint_ns, checkpoint_id, executionId } = configurable
      const snapshot = buildAuditSnapshot()
      const writeSnapshot = async () => {
        return {
          state: snapshot as unknown as Record<string, unknown>,
          output: snapshot as unknown as JSONValue,
        }
      }

      await runWithWrapWorkflowFallback(
        async () => {
          await this.commandBus.execute(
            new WrapWorkflowNodeExecutionCommand(writeSnapshot, {
              execution: {
                category: 'workflow',
                type: 'middleware',
                title: `${context.node.title} Audit`,
                inputs: {
                  mode: snapshot.mode,
                  total: snapshot.summary.total,
                },
                parentId: executionId,
                threadId: thread_id,
                checkpointNs: checkpoint_ns,
                checkpointId: checkpoint_id,
                agentKey: context.node.key,
              },
            }),
          )
          return undefined
        },
        async () => {
          await writeSnapshot()
          return undefined
        },
      )
    }

    const buildEvaluationMessages = (phase: MatchPhase, text: string, llmConfig: ResolvedLlmConfig) => {
      return [
        { role: 'system', content: llmConfig.systemPrompt },
        {
          role: 'user',
          content:
            `phase=${phase}\n` +
            '请严格基于给定文本进行敏感判定，并只返回约定结构。\n' +
            `text:\n${text}`,
        },
      ]
    }

    const invokeAndTrack = async (
      phase: MatchPhase,
      text: string,
      runtime: any,
      llmConfig: ResolvedLlmConfig,
    ): Promise<ResolvedLlmDecision> => {
      const invokeCore = async (): Promise<{
        raw: unknown
        trace: {
          requestedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema'
          resolvedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'
          methodAttempts: Array<'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'>
          fallbackTriggered: boolean
        }
      }> => {
        const messages = buildEvaluationMessages(phase, text, llmConfig)
        const model = await ensureModel()
        const candidates = buildOutputMethodCandidates(llmConfig.outputMethod)
        const attempts: Array<'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'> = []

        for (const method of candidates) {
          attempts.push(method)
          try {
            const structuredModel = await ensureStructuredModel(method)
            if (!structuredModel) {
              throw new Error(`Structured output is not available for method: ${method}`)
            }
            const raw = await withTimeout(
              structuredModel.invoke(messages, INTERNAL_LLM_INVOKE_OPTIONS),
              llmConfig.timeoutMs,
            )
            return {
              raw,
              trace: {
                requestedOutputMethod: llmConfig.outputMethod,
                resolvedOutputMethod: method,
                methodAttempts: attempts,
                fallbackTriggered: method !== llmConfig.outputMethod || attempts.length > 1,
              },
            }
          } catch (error) {
            if (isUnsupportedStructuredOutputError(error)) {
              continue
            }
            throw error
          }
        }

        attempts.push('plainText')
        const raw = await withTimeout(
          model.invoke(messages, INTERNAL_LLM_INVOKE_OPTIONS),
          llmConfig.timeoutMs,
        )
        return {
          raw,
          trace: {
            requestedOutputMethod: llmConfig.outputMethod,
            resolvedOutputMethod: 'plainText',
            methodAttempts: attempts,
            fallbackTriggered: true,
          },
        }
      }

      const parseCore = async (): Promise<ResolvedLlmDecision> => {
        const { raw, trace } = await invokeCore()
        captureLlmOutputTrace(trace)
        return parseLlmDecision(raw, llmConfig.rewriteFallbackText)
      }

      const configurable = (runtime?.configurable ?? {}) as TAgentRunnableConfigurable
      const { thread_id, checkpoint_ns, checkpoint_id, executionId } = configurable

      if (!thread_id || !executionId) {
        return parseCore()
      }

      let trackedDecision: ResolvedLlmDecision | null = null

      await runWithWrapWorkflowFallback(
        async () => {
          await this.commandBus.execute(
            new WrapWorkflowNodeExecutionCommand(async () => {
              const decision = await parseCore()
              trackedDecision = decision
              return {
                state: decision as Record<string, unknown>,
                output: undefined,
              }
            }, {
              execution: {
                category: 'workflow',
                type: 'middleware',
                inputs: {
                  phase,
                  text,
                },
                parentId: executionId,
                threadId: thread_id,
                checkpointNs: checkpoint_ns,
                checkpointId: checkpoint_id,
                agentKey: context.node.key,
                title: context.node.title,
              },
            }),
          )
          return undefined
        },
        async () => {
          trackedDecision = await parseCore()
          return undefined
        },
      )

      if (!trackedDecision) {
        throw new Error('LLM decision tracking failed: no decision resolved')
      }

      return trackedDecision
    }

    const resolveOnErrorDecision = (llmConfig: ResolvedLlmConfig, error: unknown): ResolvedLlmDecision => {
      const reason = `llm-error:${error instanceof Error ? error.message : String(error)}`
      if (shouldFailOpenOnLlmError(error)) {
        return {
          matched: false,
          reason: `llm-fail-open:${reason}`,
        }
      }
      return {
        matched: true,
        action: 'rewrite',
        replacementText: llmConfig.legacyErrorRewriteText ?? llmConfig.rewriteFallbackText,
        reason,
      }
    }

    return {
      name: SENSITIVE_FILTER_MIDDLEWARE_NAME,
      beforeAgent: async (state, runtime) => {
        resetRunState()
        assignRuntimeConfigurable(runtime)
        const llmConfig = getLlmConfig()

        if (!modeIncludesScope(llmConfig.scope, 'input')) {
          pushAudit({
            phase: 'input',
            matched: false,
            source: 'llm',
            reason: 'scope-skip',
            errorPolicyTriggered: false,
          })
          return undefined
        }

        const inputText = extractInputText(state ?? {}, runtime ?? {})
        latestInputSnippet = toSnippet(inputText)
        if (!inputText) {
          pushAudit({
            phase: 'input',
            matched: false,
            source: 'llm',
            reason: 'empty-input',
            errorPolicyTriggered: false,
          })
          return undefined
        }

        let decision: ResolvedLlmDecision
        let fromErrorPolicy = false

        try {
          decision = await invokeAndTrack('input', inputText, runtime, llmConfig)
        } catch (error) {
          decision = resolveOnErrorDecision(llmConfig, error)
          fromErrorPolicy = true
        }

        pushAudit({
          phase: 'input',
          matched: decision.matched,
          source: fromErrorPolicy ? 'error-policy' : 'llm',
          action: decision.action,
          reason: decision.reason,
          errorPolicyTriggered: fromErrorPolicy,
        })

        if (!decision.matched || !decision.action) {
          return undefined
        }

        finalAction = 'rewrite'
        pendingInputRewrite = toNonEmptyString(decision.replacementText) ?? llmConfig.rewriteFallbackText
        return undefined
      },
      wrapModelCall: async (request, handler) => {
        assignRuntimeConfigurable(request?.runtime)
        const llmConfig = getLlmConfig()
        const modelRequest = pendingInputRewrite ? rewriteModelRequestInput(request, pendingInputRewrite) : request
        pendingInputRewrite = null
        bufferedOutputResolution = null
        const effectiveRequest = modeIncludesScope(llmConfig.scope, 'output')
          ? {
              ...modelRequest,
              model: new BufferedOutputProxyChatModel(modelRequest.model as BaseLanguageModel, async (message, outputText) => {
                if (message.tool_calls?.length || message.invalid_tool_calls?.length) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'llm',
                    reason: 'tool-call-skip',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                if (!outputText) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'llm',
                    reason: 'empty-output',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                let decision: ResolvedLlmDecision
                let fromErrorPolicy = false

                try {
                  decision = await invokeAndTrack('output', outputText, request?.runtime, llmConfig)
                } catch (error) {
                  decision = resolveOnErrorDecision(llmConfig, error)
                  fromErrorPolicy = true
                }

                const finalText =
                  decision.matched && decision.action
                    ? toNonEmptyString(decision.replacementText) ?? llmConfig.rewriteFallbackText
                    : outputText

                bufferedOutputResolution = {
                  finalMessage: cloneAiMessageWithText(message, finalText),
                  matched: decision.matched,
                  source: fromErrorPolicy ? 'error-policy' : 'llm',
                  action: decision.action,
                  reason: decision.reason,
                  errorPolicyTriggered: fromErrorPolicy,
                }
                return bufferedOutputResolution
              }),
            }
          : modelRequest

        const response = await handler(effectiveRequest)

        if (bufferedOutputResolution) {
          pushAudit({
            phase: 'output',
            matched: bufferedOutputResolution.matched,
            source: bufferedOutputResolution.source,
            action: bufferedOutputResolution.action,
            reason: bufferedOutputResolution.reason,
            errorPolicyTriggered: bufferedOutputResolution.errorPolicyTriggered,
          })

          if (bufferedOutputResolution.matched && bufferedOutputResolution.action) {
            finalAction = 'rewrite'
          }

          return response
        }

        if (!modeIncludesScope(llmConfig.scope, 'output')) {
          pushAudit({
            phase: 'output',
            matched: false,
            source: 'llm',
            reason: 'scope-skip',
            errorPolicyTriggered: false,
          })
          return response
        }

        const outputText = extractModelResponseText(response)
        if (!outputText) {
          pushAudit({
            phase: 'output',
            matched: false,
            source: 'llm',
            reason: 'empty-output',
            errorPolicyTriggered: false,
          })
          return response
        }

        let decision: ResolvedLlmDecision
        let fromErrorPolicy = false

        try {
          decision = await invokeAndTrack('output', outputText, request?.runtime, llmConfig)
        } catch (error) {
          decision = resolveOnErrorDecision(llmConfig, error)
          fromErrorPolicy = true
        }

        pushAudit({
          phase: 'output',
          matched: decision.matched,
          source: fromErrorPolicy ? 'error-policy' : 'llm',
          action: decision.action,
          reason: decision.reason,
          errorPolicyTriggered: fromErrorPolicy,
        })

        if (!decision.matched || !decision.action) {
          return response
        }

        finalAction = 'rewrite'
        return replaceModelResponseText(
          response,
          toNonEmptyString(decision.replacementText) ?? llmConfig.rewriteFallbackText,
        )
      },
      afterAgent: async () => {
        const matchedRecords = auditEntries.filter((entry) => entry.matched)
        const notification =
          matchedRecords.length > 0
            ? buildMatchedNotificationMessage({
                mode: 'llm',
                nodeTitle: context.node.title ?? SENSITIVE_FILTER_MIDDLEWARE_NAME,
                finalAction,
                records: matchedRecords,
                runtimeConfigurable,
                inputSnippet: latestInputSnippet,
              })
            : null

        const [persistResult, notifyResult] = await Promise.allSettled([
          persistAuditSnapshot(),
          notification ? dispatchWecomNotification(wecomConfig, notification) : Promise.resolve(undefined),
        ])

        if (persistResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to persist audit snapshot: ${getErrorText(persistResult.reason)}`,
          )
        }
        if (notifyResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to dispatch WeCom notification: ${getErrorText(notifyResult.reason)}`,
          )
        }
        return undefined
      },
    }
  }
}

export type { SensitiveFilterConfig }
