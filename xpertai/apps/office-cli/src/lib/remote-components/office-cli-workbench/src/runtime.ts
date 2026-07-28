const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
const PREVIEW_REQUEST_TIMEOUT_MS = 45_000
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let instanceId: string | null = null
let requestSequence = 0

export function post(type: string, body?: Record<string, unknown>, transfer?: Transferable[]) {
  if (!instanceId && type !== 'ready') return
  parent.postMessage({
    channel: CHANNEL,
    protocolVersion: VERSION,
    instanceId,
    type,
    ...(body ?? {})
  }, '*', transfer ?? [])
}

export function request(
  type: string,
  body?: Record<string, unknown>,
  transfer?: Transferable[],
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const requestId = String(++requestSequence)
  return new Promise<unknown>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...(body ?? {}) }, transfer)
    setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error(`OfficeCLI 请求在 ${Math.round(timeoutMs / 1000)} 秒内没有响应。`))
    }, timeoutMs)
  })
}

export function requestData(query?: Record<string, unknown>) {
  return request('requestData', { query: query ?? {} }, undefined, PREVIEW_REQUEST_TIMEOUT_MS)
}

export function executeAction(actionKey: string, targetId?: string | null, input?: Record<string, unknown>) {
  return request('executeAction', { actionKey, targetId, input: input ?? {} })
}

export async function executeFileAction(actionKey: string, file: File, input?: Record<string, unknown>) {
  const buffer = await file.arrayBuffer()
  return request('executeFileAction', {
    actionKey,
    targetId: null,
    input: input ?? {},
    file: {
      name: file.name,
      type: file.type,
      size: file.size,
      buffer
    }
  }, [buffer])
}

export function invokeClientCommand(commandKey: string, payload: unknown) {
  return request('invokeClientCommand', { commandKey, payload })
}

export function notify(level: 'success' | 'error' | 'info' | 'warning', message: string) {
  post('notify', { level, message })
}

export function reportResize() {
  const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 760)
  post('resize', { height, viewportBound: true })
}

export function getResponsePayload(response: unknown): unknown {
  if (!isRecord(response)) return response
  if ('payload' in response) return response.payload
  if ('data' in response) return response.data
  if ('result' in response) return response.result
  return response
}

export function startRemoteBridge(
  setContext: (context: Record<string, unknown>) => void,
  handleHostEvent: (event: unknown) => void
) {
  let currentContext: Record<string, unknown> = {}
  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isRecord(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      currentContext = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery ?? {},
        locale: message.locale,
        theme: message.theme
      }
      const remoteUi = (window as typeof window & { XpertRemoteUI?: { applyTheme?: (theme: unknown) => void } }).XpertRemoteUI
      remoteUi?.applyTheme?.(message.theme)
      setContext(currentContext)
      setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      handleHostEvent(message.event)
      return
    }
    if (message.requestId && pending.has(String(message.requestId))) {
      const item = pending.get(String(message.requestId))
      pending.delete(String(message.requestId))
      if (!item) return
      if (message.type === 'error') item.reject(new Error(String(message.message || 'OfficeCLI request failed.')))
      else item.resolve(message)
    }
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
