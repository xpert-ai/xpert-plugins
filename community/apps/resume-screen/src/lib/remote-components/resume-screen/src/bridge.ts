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

interface PendingRequest {
  resolve: (value: BridgeMessage) => void
  reject: (error: Error) => void
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
      pending.delete(requestId)
      if (!item) return
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

function request(type: string, body?: Record<string, unknown>) {
  const requestId = String(++requestSequence)
  return new Promise<BridgeMessage>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    try {
      post(type, { requestId, ...(body ?? {}) })
    } catch (error) {
      pending.delete(requestId)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function requestData(query: Record<string, unknown>) {
  return request('requestData', { query })
}

export function executeAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  parameters?: Record<string, unknown>
) {
  return request('executeAction', { actionKey, targetId, input, parameters })
}

/**
 * 文件通道动作（transport:'file' 的 manifest 动作）
 *
 * 平台协议唯一合规的 iframe 侧文件上传路径（view-extension-protocol.md 能力表）：
 * 文件字节 arrayBuffer 后经 postMessage 交给宿主，由宿主转 multipart 调
 * provider.executeViewFileAction；iframe 不解析文件内容、不持久化字节。
 * parameters 携带 jobId（服务端从 request.parameters 读取选中岗位）。
 */
export function executeFileAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  parameters: Record<string, unknown>,
  file: File
) {
  return file.arrayBuffer().then((buffer) =>
    request('executeFileAction', {
      actionKey,
      targetId,
      input,
      parameters,
      file: { name: file.name, type: file.type, size: file.size, buffer }
    })
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

