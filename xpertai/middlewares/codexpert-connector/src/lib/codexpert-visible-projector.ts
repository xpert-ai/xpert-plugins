import { ChatMessageTypeEnum, type TMessageContentText } from '@xpert-ai/chatkit-types'
import type { RunnableConfig } from '@langchain/core/runnables'
import {
  CODEXPERT_AGENT_KEY,
  CODEXPERT_XPERT_NAME,
  type CodexpertConnectorEvent,
} from './types.js'
import { formatVisibleMarkdown } from './markdown-format.js'

type ProjectionState = {
  lastTextHash?: string
  milestoneKeys: Set<string>
  textStreamId: string
  hasOutputText: boolean
  pendingText: string
  pendingTextTimer?: ReturnType<typeof setTimeout>
}

let projectionSequence = 0
const TEXT_FLUSH_INTERVAL_MS = 600
const TEXT_FLUSH_MAX_CHARS = 320
const TEXT_FLUSH_NATURAL_MIN_CHARS = 80

export function createProjectionState(): ProjectionState {
  return {
    milestoneKeys: new Set(),
    textStreamId: `codexpert-visible-text-${++projectionSequence}`,
    hasOutputText: false,
    pendingText: '',
  }
}

export async function projectVisibleCodexpertEvent(
  event: CodexpertConnectorEvent,
  state: ProjectionState,
  config?: RunnableConfig,
  enableStatusEvents = true,
) {
  if (event.type !== 'text_delta') {
    flushVisibleCodexpertProjection(state, config)
  }

  const text = resolveVisibleText(event, state, enableStatusEvents)
  if (!text) {
    return
  }

  if (event.type === 'text_delta') {
    appendBufferedText(state, text)
    if (shouldFlushBufferedText(state.pendingText)) {
      flushVisibleCodexpertProjection(state, config)
    } else {
      scheduleBufferedTextFlush(state, config)
    }
    return
  }

  emitSubscriberMessage(config, text)
}

export function flushVisibleCodexpertProjection(
  state: ProjectionState,
  config?: RunnableConfig,
) {
  if (state.pendingTextTimer) {
    clearTimeout(state.pendingTextTimer)
    state.pendingTextTimer = undefined
  }

  const text = dedupeText(state.pendingText, state)
  state.pendingText = ''
  if (!text) {
    return
  }

  emitSubscriberMessage(config, text, state.textStreamId)
}

function resolveVisibleText(
  event: CodexpertConnectorEvent,
  state: ProjectionState,
  enableStatusEvents: boolean,
): string | null {
  if (event.type === 'text_delta') {
    if (event.stream === 'thought') {
      return null
    }
    if (event.tag === 'assistant_snapshot' && state.hasOutputText) {
      return null
    }
    const text = cleanDeltaText(event.text)
    if (text) {
      state.hasOutputText = true
    }
    return text
  }

  if (event.type === 'error') {
    return dedupeMilestone(`failed:${event.message}`, `Codexpert failed: ${cleanText(event.message)}`, state)
  }

  if (event.type === 'done') {
    if (state.hasOutputText) {
      return null
    }
    return dedupeMilestone(
      `done:${event.taskId ?? event.executionId ?? event.codingSessionId ?? 'unknown'}`,
      cleanText(event.summary ?? 'Codexpert task completed.'),
      state,
    )
  }

  if (!enableStatusEvents || event.type !== 'status' || !event.isMilestone) {
    return null
  }

  const phase = cleanText(event.phase ?? '')
  const headline = cleanText(event.headline ?? event.text ?? '')
  if (!headline || isSetupNoise(headline)) {
    return null
  }
  const milestoneText = formatStatusMilestone(phase, headline, state)
  if (milestoneText) {
    return milestoneText
  }

  if (phase === 'setup') {
    return null
  }
  if (phase === 'running') {
    return dedupeMilestone(`running:${headline}`, headline, state)
  }
  if (phase === 'waiting_input') {
    return dedupeMilestone(`waiting:${headline}`, headline, state)
  }
  if (phase === 'completed') {
    return dedupeMilestone(`completed:${headline}`, headline, state)
  }
  return null
}

function formatStatusMilestone(phase: string, headline: string, state: ProjectionState): string | null {
  const lower = headline.toLowerCase()
  if (phase === 'setup') {
    if (lower.includes('ready')) {
      return dedupeMilestone('setup:ready', '编码环境已就绪。', state)
    }
    if (lower.includes('queued') || lower.includes('setup')) {
      return dedupeMilestone('setup:queued', '正在准备编码环境。', state)
    }
  }
  if (phase === 'running') {
    return dedupeMilestone('running:start', '已开始处理。', state)
  }
  if (phase === 'waiting_input') {
    return dedupeMilestone('waiting:input', '需要补充信息。', state)
  }
  if (phase === 'completed' && !state.hasOutputText) {
    return dedupeMilestone('completed:done', '已完成。', state)
  }
  return null
}

function cleanText(value: unknown): string {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

function cleanDeltaText(value: unknown): string | null {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized || isInternalText(normalized.trim())) {
    return null
  }
  return normalized
}

function dedupeText(text: string, state: ProjectionState): string | null {
  if (!text || isInternalText(text)) {
    return null
  }
  const hash = stableHash(text)
  if (hash === state.lastTextHash) {
    return null
  }
  state.lastTextHash = hash
  return text
}

function dedupeMilestone(key: string, text: string, state: ProjectionState): string | null {
  if (!text || state.milestoneKeys.has(key) || isInternalText(text)) {
    return null
  }
  state.milestoneKeys.add(key)
  return text
}

function isInternalText(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.startsWith('thought:') ||
    lower.includes('"metadata"') ||
    lower.includes('raw metadata') ||
    lower.includes('setup log') ||
    lower.includes('sandbox setup log') ||
    lower.includes('[debug]')
  )
}

function isSetupNoise(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.startsWith('setup:') ||
    lower.includes('installing dependencies') ||
    lower.includes('clone progress') ||
    lower.includes('synchronizing repository') ||
    lower.includes('repository synchronized') ||
    lower.includes('acquiring runtime') ||
    lower.includes('runtime acquired') ||
    lower.includes('preparing workspace') ||
    lower.includes('workspace prepared') ||
    lower.includes('running setup lifecycle')
  )
}

function appendBufferedText(state: ProjectionState, text: string) {
  state.pendingText = `${state.pendingText}${text}`
}

function shouldFlushBufferedText(text: string): boolean {
  if (text.length >= TEXT_FLUSH_MAX_CHARS) {
    return true
  }
  if (text.length < TEXT_FLUSH_NATURAL_MIN_CHARS) {
    return false
  }
  return /[\n。！？!?；;：:]$/.test(text.trimEnd())
}

function scheduleBufferedTextFlush(state: ProjectionState, config?: RunnableConfig) {
  if (state.pendingTextTimer) {
    return
  }

  state.pendingTextTimer = setTimeout(() => {
    state.pendingTextTimer = undefined
    flushVisibleCodexpertProjection(state, config)
  }, TEXT_FLUSH_INTERVAL_MS)
}

function emitSubscriberMessage(config: RunnableConfig | undefined, text: string, streamId?: string) {
  const subscriber = (config?.configurable as Record<string, any> | undefined)?.subscriber
  if (!subscriber || typeof subscriber.next !== 'function') {
    return
  }

  try {
    subscriber.next({
      data: {
        type: ChatMessageTypeEnum.MESSAGE,
        data: buildVisibleTextChunk(text, streamId),
      },
    })
  } catch {
    try {
      subscriber.next({
        data: {
          type: ChatMessageTypeEnum.MESSAGE,
          data: text,
        },
      })
    } catch {
      // Projection delivery is best-effort; keep the Codexpert task flow alive.
    }
  }
}

function buildVisibleTextChunk(text: string, streamId?: string): TMessageContentText {
  return {
    ...(streamId ? { id: streamId } : {}),
    type: 'text',
    text: formatVisibleMarkdown(text, { standalone: !streamId }),
    xpertName: CODEXPERT_XPERT_NAME,
    agentKey: CODEXPERT_AGENT_KEY,
  }
}

function stableHash(text: string): string {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}
