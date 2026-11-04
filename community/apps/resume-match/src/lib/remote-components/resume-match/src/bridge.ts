import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type { ResumeMatchViewData } from '../../../types.js'

export interface ViewHostInit {
  locale?: string
  theme?: {
    mode?: 'light' | 'dark'
    density?: 'default' | 'compact'
    tokens?: Record<string, string>
  }
  initialQuery?: {
    page?: number
    pageSize?: number
    selectionId?: string
    parameters?: Record<string, string | number | boolean | undefined>
  }
  manifest?: { key?: string }
  debug?: { enabled?: boolean }
}

export interface HostEventPayload {
  type?: string
  event?: string
  toolName?: string
  data?: {
    output?: {
      analysisId?: string
      status?: string
    }
  }
}

export interface ActionResult {
  success?: boolean
  message?: string | { zh_Hans?: string; en_US?: string }
  refresh?: boolean
  data?: {
    analysisId?: string
    revision?: number
    commandKey?: string
    payload?: { text?: string }
  }
}

interface HostMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string
  type?: string
  requestId?: string
  data?: unknown
  result?: unknown
  payload?: unknown
  message?: string
  locale?: string
  theme?: ViewHostInit['theme']
  initialQuery?: ViewHostInit['initialQuery']
  manifest?: ViewHostInit['manifest']
  debug?: ViewHostInit['debug']
  event?: HostEventPayload
}

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
let instanceId: string | null = null
let debugEnabled = false
let sequence = 0

const pending = new Map<
  string,
  {
    resolve: (value: HostMessage) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()

function isHostMessage(value: unknown): value is HostMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.channel === CHANNEL && record.protocolVersion === VERSION
}

function log(event: string, detail?: Record<string, unknown>) {
  if (!debugEnabled) return
  console.debug('[resume-match]', event, detail ?? {})
}

function applyHostTheme(theme: ViewHostInit['theme']) {
  if (!theme) return
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [key, value] of Object.entries(theme.tokens ?? {})) {
    const cssName = key.startsWith('--xui-')
      ? key
      : '--xui-' + key.replace(/[A-Z]/g, (character) => '-' + character.toLowerCase())
    document.documentElement.style.setProperty(cssName, value)
  }
  installShadcnThemeVars({ density: theme.density ?? 'default' })
}

export function startBridge(
  onInit: (init: ViewHostInit) => void,
  onHostEvent: (event: HostEventPayload) => void
) {
  const listener = (raw: MessageEvent<unknown>) => {
    if (raw.source !== window.parent || !isHostMessage(raw.data)) return
    const message = raw.data
    if (message.type === 'init') {
      instanceId = message.instanceId ?? null
      debugEnabled = message.debug?.enabled === true
      applyHostTheme(message.theme)
      log('init', { locale: message.locale, view: message.manifest?.key })
      onInit({
        locale: message.locale,
        theme: message.theme,
        initialQuery: message.initialQuery,
        manifest: message.manifest,
        debug: message.debug
      })
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged') {
      applyHostTheme(message.theme)
      return
    }
    if (message.type === 'hostEvent') {
      log('host-event', { toolName: message.event?.toolName })
      onHostEvent(message.event ?? {})
      return
    }
    const requestId = message.requestId
    if (!requestId) return
    const waiter = pending.get(requestId)
    if (!waiter) return
    pending.delete(requestId)
    clearTimeout(waiter.timer)
    if (message.type === 'error') {
      waiter.reject(new Error(message.message || '远程请求失败'))
      return
    }
    waiter.resolve(message)
  }
  window.addEventListener('message', listener)
  window.parent.postMessage(
    { channel: CHANNEL, protocolVersion: VERSION, type: 'ready' },
    '*'
  )
  return () => {
    window.removeEventListener('message', listener)
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('视图已关闭'))
    }
    pending.clear()
  }
}

function request(type: string, body: Record<string, unknown>) {
  if (!instanceId) return Promise.reject(new Error('视图尚未初始化'))
  const requestId = String(++sequence)
  return new Promise<HostMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('请求超时，请检查网络后重试。'))
    }, 60000)
    pending.set(requestId, { resolve, reject, timer })
    window.parent.postMessage(
      {
        channel: CHANNEL,
        protocolVersion: VERSION,
        instanceId,
        type,
        requestId,
        ...body
      },
      '*'
    )
  })
}

export async function requestData(query: {
  page?: number
  pageSize?: number
  selectionId?: string
  parameters?: Record<string, string | number | boolean | undefined>
}): Promise<ResumeMatchViewData> {
  const response = await request('requestData', { query })
  const data = (response.data ?? response.payload) as ResumeMatchViewData | undefined
  if (!data || !Array.isArray(data.items)) throw new Error('工作台返回的数据格式不正确')
  return data
}

function unwrap(response: HostMessage): ActionResult {
  const value = response.result ?? response.data ?? response.payload ?? {}
  return value as ActionResult
}

export async function executeAction(
  actionKey: string,
  input: object,
  targetId?: string
): Promise<ActionResult> {
  const response = await request('executeAction', { actionKey, input, targetId })
  const result = unwrap(response)
  if (result.success === false) throw new Error(readMessage(result.message))
  return result
}

export async function invokeClientCommand(
  commandKey: string,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const response = await request('invokeClientCommand', { commandKey, payload })
  const result = unwrap(response)
  if (result.success === false) throw new Error(readMessage(result.message))
  return result
}

export function readMessage(
  value: string | { zh_Hans?: string; en_US?: string } | undefined
) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.zh_Hans || value.en_US || ''
}

export function notifyHost(message: string, level: 'success' | 'warning' | 'error' = 'success') {
  if (!instanceId) return
  window.parent.postMessage(
    {
      channel: CHANNEL,
      protocolVersion: VERSION,
      instanceId,
      type: 'notify',
      message,
      level
    },
    '*'
  )
}
