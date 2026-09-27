/**
 * 宿主 postMessage 桥（复制自 crm-workbench 样板，spec §8.2）
 *
 * 通道 xpertai.remote_component、协议版本 1；时序 ready → init → requestData。
 * iframe 不持 token、禁 localStorage，一切数据/动作/轻提示经本桥与宿主往返。
 */
import type { BridgeMessage, HostContext } from './types'
import { isObject } from './utils'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

// ===== 请求级超时防护（M10 M-4） =====
// 悬挂回执是真实故障模式（代理/服务端挂起不回包）：无超时则心跳轮询的 await 永久悬挂、
// 上传串行队列卡死单文件。超时只代表「本轮往返未收到回执」，不代表服务端失败，
// 故文件通道文案指向刷新确认而非重试。
const REQUEST_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MESSAGE = '请求超时，请稍后重试'
// 单文件回执超时：对齐 §6.6 文件态 60s 阈值——与「仍在处理」弱色提醒同一时刻触发，
// 由提醒升级为失败终态（文案自带刷新确认指引，mapUploadFailure 对未识别文案原样透传）
const FILE_ACTION_TIMEOUT_MS = 60_000
const FILE_ACTION_TIMEOUT_MESSAGE = '回执超时：文件可能已录入，请刷新列表确认；如需可重新上传（重复内容将自动跳过）'
// 文件通道超时后继续侦听迟到回执的窗口：服务端真悬挂永不回执时，TTL 到期清掉孤儿记录防 pending 泄漏
const LATE_RECEIPT_TTL_MS = 10 * 60_000

interface PendingRequest {
  resolve: (value: BridgeMessage) => void
  reject: (error: Error) => void
  // 超时已判负（仅文件通道置位）：迟到的真实回执不得再翻调用方状态，只走校准通道（M-4 竞态）
  timedOut?: boolean
  // 迟到回执侦听窗口的 TTL 清理定时器
  ttlTimer?: number
}

// 迟到回执校准回调：由工作台注册（触发一次列表刷新，候选人行呈现服务端事实），卸载时置空
let onLateReceipt: (() => void) | null = null

export function setOnLateReceipt(handler: (() => void) | null) {
  onLateReceipt = handler
}

interface BridgeHandlers {
  onInit: (context: HostContext) => void
  // 宿主转发的订阅事件原文（本视图仅订阅 assistant.tool.completed，作对话旁路刷新信号）
  onHostEvent: (event: unknown) => void
}

let instanceId: string | null = null
let requestSequence = 0
const pending = new Map<string, PendingRequest>()

export function installBridgeListener(handlers: BridgeHandlers) {
  const listener = (event: MessageEvent) => {
    const rawMessage = event.data
    if (!isObject(rawMessage) || rawMessage.channel !== CHANNEL || rawMessage.protocolVersion !== VERSION) return
    const message = rawMessage as unknown as BridgeMessage

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      handlers.onInit({
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery ?? {},
        locale: message.locale,
        theme: message.theme
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      handlers.onHostEvent(message.event)
      return
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    if (requestId && pending.has(requestId)) {
      const item = pending.get(requestId)
      if (!item) return
      if (item.timedOut) {
        // 该请求已被超时判负（调用方已按失败收口），迟到回执丢弃不再判行态，
        // 只触发一次列表刷新校准；同时撤掉 TTL 定时器防泄漏
        pending.delete(requestId)
        if (item.ttlTimer) window.clearTimeout(item.ttlTimer)
        if (onLateReceipt) onLateReceipt()
        return
      }
      pending.delete(requestId)
      if (message.type === 'error') {
        item.reject(new Error(typeof message.message === 'string' ? message.message : '简历工作台远端请求失败'))
      } else {
        item.resolve(message)
      }
    }
  }

  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function post(type: string, body?: Record<string, unknown>) {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage(
    {
      channel: CHANNEL,
      protocolVersion: VERSION,
      instanceId,
      type,
      ...(body ?? {})
    },
    '*'
  )
}

/**
 * 桥请求 + 请求级超时防护（M10 M-4，Promise.race 同构：定时器与回执先到先得）
 *
 * 先到者 settle 后另一分支经 settled 标志空转，并即时 clearTimeout 防定时器泄漏。
 * trackLate 仅文件通道使用：超时后保留 pending 记录并标记 timedOut，等迟到真实回执
 * 走「列表刷新校准」通道（不得再翻调用方状态）；普通请求超时即删除记录，
 * 迟到响应因 requestId 不再命中而被忽略，调用方按既有失败出口收口。
 */
function request(
  type: string,
  body: Record<string, unknown> | undefined,
  timeout: { ms: number; message: string; trackLate?: boolean }
) {
  const requestId = String(++requestSequence)
  return new Promise<BridgeMessage>((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      if (timeout.trackLate) {
        const item = pending.get(requestId)
        if (item) {
          item.timedOut = true
          // 服务端真悬挂、永不回执：TTL 到期清孤儿记录，防 pending 累积泄漏
          item.ttlTimer = window.setTimeout(() => pending.delete(requestId), LATE_RECEIPT_TTL_MS)
        }
      } else {
        pending.delete(requestId)
      }
      reject(new Error(timeout.message))
    }, timeout.ms)
    pending.set(requestId, {
      resolve: (message) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(message)
      },
      reject: (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        reject(error)
      }
    })
    try {
      post(type, { requestId, ...(body ?? {}) })
    } catch (error) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      pending.delete(requestId)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function requestData(query: Record<string, unknown>) {
  return request('requestData', { query }, { ms: REQUEST_TIMEOUT_MS, message: REQUEST_TIMEOUT_MESSAGE })
}

export function executeAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  parameters?: Record<string, unknown>
) {
  return request('executeAction', { actionKey, targetId, input, parameters }, { ms: REQUEST_TIMEOUT_MS, message: REQUEST_TIMEOUT_MESSAGE })
}

/**
 * 文件通道动作（transport:'file' 的 manifest 动作）
 *
 * 平台协议唯一合规的 iframe 侧文件上传路径（view-extension-protocol.md 能力表）：
 * 文件字节 arrayBuffer 后经 postMessage 交给宿主，由宿主转 multipart 调
 * provider.executeViewFileAction；iframe 不解析文件内容、不持久化字节。
 * parameters 携带 jobId（服务端从 request.parameters 读取选中岗位）。
 *
 * 单文件回执超时 60s（M10 M-4，对齐 §6.6 文件态阈值）：超时以专属文案 reject，
 * 调用方（上传队列）据此落「失败」终态并继续串行下一文件；超时不代表服务端失败，
 * 故文案指向刷新列表确认，迟到回执经 trackLate 通道仅触发刷新校准。
 */
export function executeFileAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  parameters: Record<string, unknown>,
  file: File
) {
  return file.arrayBuffer().then((buffer) =>
    request(
      'executeFileAction',
      {
        actionKey,
        targetId,
        input,
        parameters,
        file: { name: file.name, type: file.type, size: file.size, buffer }
      },
      { ms: FILE_ACTION_TIMEOUT_MS, message: FILE_ACTION_TIMEOUT_MESSAGE, trackLate: true }
    )
  )
}

export function notify(message: string, level = 'success') {
  post('notify', { message, level })
}

export function reportResize() {
  const root = document.getElementById('root')
  const shell = root?.firstElementChild as HTMLElement | null
  const height = Math.max(shell?.scrollHeight ?? 0, 640)
  post('resize', { height: Math.ceil(height), viewportBound: false })
}

