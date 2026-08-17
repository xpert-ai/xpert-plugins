const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
type BridgeObject = Record<string, unknown>
export type RemoteViewContext = { locale?: unknown; theme?: unknown; initialQuery: BridgeObject }

const pending = new Map<string, { resolve: (value: BridgeObject) => void; reject: (error: Error) => void }>()
let instanceId: string | null = null
let sequence = 0

function post(type: string, body?: Record<string, unknown>, transfer?: Transferable[]) {
  if (!instanceId && type !== 'ready') return
  parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...(body ?? {}) }, '*', transfer ?? [])
}

function request(type: string, body?: Record<string, unknown>, transfer?: Transferable[]) {
  const requestId = String(++sequence)
  return new Promise<BridgeObject>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...(body ?? {}) }, transfer)
    window.setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      reject(new Error('请求超时'))
    }, 30_000)
  })
}

export function requestData(query?: Record<string, unknown>) { return request('requestData', { query: query ?? {} }) }
export function executeAction(actionKey: string, targetId?: string | null, input?: Record<string, unknown>) { return request('executeAction', { actionKey, targetId, input: input ?? {} }) }
export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) { return request('invokeClientCommand', { commandKey, payload }) }
export async function executeFileAction(actionKey: string, file: File) {
  const buffer = await file.arrayBuffer()
  return request('executeFileAction', {
    actionKey,
    input: { name: file.name, mimeType: file.type },
    file: { name: file.name, type: file.type, size: file.size, buffer }
  }, [buffer])
}
export function notify(level: 'success' | 'error' | 'warning' | 'info', message: string) { post('notify', { level, message }) }
export function reportResize() { post('resize', { height: Math.max(document.body.scrollHeight, window.innerHeight || 0, 720), viewportBound: true }) }
export function payload<T = BridgeObject>(response: unknown): T {
  const source = asRecord(response)
  return (source.payload ?? source.data ?? source.result ?? source) as T
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || '操作失败') }

export function startBridge(setContext: (context: RemoteViewContext) => void, onHostEvent: () => void) {
  window.addEventListener('message', (event) => {
    const message = asRecord(event.data)
    if (message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      remoteUi()?.applyTheme?.(message.theme)
      setContext({ locale: message.locale, theme: message.theme, initialQuery: asRecord(message.initialQuery) })
      window.setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') { onHostEvent(); return }
    const item = message.requestId ? pending.get(String(message.requestId)) : undefined
    if (!item) return
    pending.delete(String(message.requestId))
    if (message.type === 'error') item.reject(new Error(String(message.message || '远程操作失败')))
    else item.resolve(message)
  })
  post('ready')
}

function asRecord(value: unknown): BridgeObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as BridgeObject : {}
}

function remoteUi() {
  return (window as Window & { XpertRemoteUI?: { applyTheme?(theme: unknown): void } }).XpertRemoteUI
}
