/**
 * iframe ↔ 宿主之间的消息桥（postMessage 协议，channel = xpertai.remote_component）。
 *
 * iframe 不能直接调后端，也拿不到 token：所有数据和动作都发消息给宿主，由宿主转给视图提供者。
 * - requestData → 视图提供者 getViewData
 * - executeAction → 视图提供者 executeViewAction
 * - invokeClientCommand → 宿主的客户端命令（本插件只用 assistant.chat.send_message）
 * - 宿主推送 init / theme / hostEvent（工具完成事件）
 * Python 类比：前端版的 RPC 客户端，每个请求带 requestId，等对应的响应回来。
 * 写法参考 community/apps/material-identity-governance 的 bridge.ts（AGPL-3.0）。
 */
import type { ViewData, ViewQuery } from './types'

const CHANNEL = 'xpertai.remote_component'
const REQUEST_TIMEOUT_MS = 60000

interface HostTheme {
  mode?: 'light' | 'dark'
  tokens?: Record<string, string>
}

export interface HostInit {
  locale?: string
  theme?: HostTheme
  initialQuery?: ViewQuery
  debug?: { enabled: boolean }
}

/** 视图动作的统一返回：{ success, data } */
export interface ActionResult {
  success?: boolean
  data?: Record<string, unknown>
}

interface HostMessage extends HostInit {
  channel?: string
  protocolVersion?: number
  instanceId?: string
  type?: string
  requestId?: string
  message?: string
  data?: ViewData
  payload?: ViewData
  result?: ActionResult & { code?: string }
  success?: boolean
  code?: string
}

let instanceId: string | null = null
let sequence = 0
let debugEnabled = false
const pending = new Map<string, { resolve: (value: HostMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()

/** 调试日志默认关闭，由宿主 init 消息里的 debug.enabled 打开；只记事件名和请求 ID，不记业务数据 */
export function debug(event: string, info: { operation?: string; requestId?: string; success?: boolean } = {}) {
  if (debugEnabled) console.debug('[expedite-shortage]', event, info)
}

function applyTheme(theme?: HostTheme) {
  if (!theme) return
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [key, value] of Object.entries(theme.tokens ?? {})) {
    const name = key.startsWith('--xui-') ? key : '--xui-' + key.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())
    document.documentElement.style.setProperty(name, value)
  }
}

/** 启动消息监听并通知宿主“已就绪”；返回清理函数 */
export function startBridge(onInit: (init: HostInit) => void, onHostEvent: () => void) {
  const onMessage = (event: MessageEvent<HostMessage>) => {
    const message = event.data
    if (event.source !== window.parent || !message || message.channel !== CHANNEL || message.protocolVersion !== 1) return
    if (message.type === 'init') {
      instanceId = message.instanceId ?? null
      debugEnabled = message.debug?.enabled === true
      applyTheme(message.theme)
      onInit(message)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged') {
      applyTheme(message.theme)
      return
    }
    if (message.type === 'hostEvent') {
      // 只需要知道“有写工具完成了”，不解析载荷里的业务 ID，直接刷新当前列表和详情
      debug('host-event.received')
      onHostEvent()
      return
    }
    const waiting = message.requestId ? pending.get(message.requestId) : undefined
    if (waiting && message.requestId) {
      pending.delete(message.requestId)
      clearTimeout(waiting.timer)
      if (message.type === 'error') waiting.reject(new Error(message.message ?? 'request_failed'))
      else waiting.resolve(message)
    }
  }
  window.addEventListener('message', onMessage)
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')
  return () => {
    window.removeEventListener('message', onMessage)
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer)
      waiting.reject(new Error('view_disposed'))
    }
    pending.clear()
  }
}

/**
 * 宿主切换会话（视图上下文）的那一刻，会拒绝 iframe 发来的请求，报错文案是
 * “View context is changing. Retry in the current context.”。这时请求根本没到达视图提供者，
 * 重发是安全的：等宿主切换完（新的 init 会更新 instanceId）再自动重试一次，仍失败才交给界面显示。
 */
const CONTEXT_CHANGING = /view context is changing/i
const CONTEXT_RETRY_DELAY_MS = 800

async function request(type: string, body: Record<string, unknown>) {
  try {
    return await sendOnce(type, body)
  } catch (error) {
    if (!(error instanceof Error) || !CONTEXT_CHANGING.test(error.message)) throw error
    debug('request.context-changing.retry', { operation: type })
    await new Promise((resolve) => setTimeout(resolve, CONTEXT_RETRY_DELAY_MS))
    try {
      return await sendOnce(type, body)
    } catch (retryError) {
      // 第二次仍是上下文切换：换成稳定错误码，界面显示中文提示而不是宿主的英文原文
      if (retryError instanceof Error && CONTEXT_CHANGING.test(retryError.message)) throw new ActionError('VIEW_CONTEXT_CHANGING', undefined)
      throw retryError
    }
  }
}

function sendOnce(type: string, body: Record<string, unknown>) {
  const requestId = String(++sequence)
  return new Promise<HostMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('request_timeout'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(requestId, { resolve, reject, timer })
    debug('request.started', { operation: type, requestId })
    window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, type, requestId, ...body }, '*')
  })
}

export async function requestData(query: ViewQuery): Promise<ViewData> {
  const response = await request('requestData', { query })
  const data = response.data ?? response.payload
  if (!data?.item?.list) throw new Error('invalid_view_data')
  return data
}

/** 执行视图动作；业务失败时抛出带错误码的 ActionError，界面按错误码显示可理解的提示 */
export async function executeAction(actionKey: string, input: Record<string, unknown>) {
  const response = await request('executeAction', { actionKey, input })
  const result = response.result
  if (!result?.success) {
    const data = result?.data ?? {}
    throw new ActionError(typeof data['code'] === 'string' ? data['code'] : (result?.code ?? 'action_failed'), data['details'])
  }
  return result.data ?? {}
}

/** 调用宿主客户端命令；返回 true 表示宿主已接受 */
export async function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
  const response = await request('invokeClientCommand', { commandKey, payload })
  if (response.result?.success === false || response.success === false) {
    throw new ActionError(response.result?.code ?? response.code ?? 'command_failed', undefined)
  }
  return true
}

export class ActionError extends Error {
  constructor(
    readonly code: string,
    readonly details: unknown
  ) {
    super(code)
    this.name = 'ActionError'
  }
}
