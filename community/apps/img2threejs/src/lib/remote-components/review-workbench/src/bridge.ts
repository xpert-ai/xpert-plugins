import type { BridgeMessage, HostContext, JsonObject, JsonValue } from './types.js'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

type OutboundValue = string | number | boolean | null | ArrayBuffer | OutboundObject | OutboundValue[]
type OutboundObject = { [key: string]: OutboundValue | undefined }

type Pending = {
  resolve: (message: BridgeMessage) => void
  reject: (error: Error) => void
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, Pending>()

export function installBridge(handlers: {
  onInit: (context: HostContext) => void
  onHostEvent: (event: JsonObject) => void
}): () => void {
  const listener = (event: MessageEvent) => {
    const message = readBridgeMessage(event)
    if (!message) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      handlers.onInit({
        locale: stringValue(message.locale),
        initialQuery: objectValue(message.initialQuery),
        debug: debugValue(message.debug)
      })
      setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      handlers.onHostEvent(objectValue(message.payload) ?? objectValue(message.data) ?? message)
      return
    }
    const requestId = stringValue(message.requestId)
    if (!requestId) return
    const request = pending.get(requestId)
    if (!request) return
    pending.delete(requestId)
    if (message.type === 'error') request.reject(new Error(stringValue(message.message) ?? 'Remote request failed.'))
    else request.resolve(message)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function post(type: string, body: OutboundObject = {}, transfer: Transferable[] = []): void {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage({
    channel: CHANNEL,
    protocolVersion: VERSION,
    instanceId,
    type,
    ...body
  }, '*', transfer)
}

export function requestData(query: JsonObject): Promise<BridgeMessage> {
  return request('requestData', { query })
}

export function executeAction(actionKey: string, input: JsonObject): Promise<BridgeMessage> {
  return request('executeAction', { actionKey, targetId: stringValue(input.projectId) ?? null, input })
}

export function invokeClientCommand(commandKey: string, payload: JsonObject): Promise<BridgeMessage> {
  return request('invokeClientCommand', { commandKey, payload })
}

export async function executeFileAction(
  actionKey: string,
  targetId: string,
  input: JsonObject,
  file: File
): Promise<BridgeMessage> {
  const buffer = await file.arrayBuffer()
  return request('executeFileAction', {
    actionKey,
    targetId,
    input,
    file: {
      name: file.name,
      type: file.type,
      size: file.size,
      buffer
    }
  }, [buffer])
}

export function requestFileAccess(input: {
  fileKey: string
  targetId: string
  purpose: 'preview'
}): Promise<BridgeMessage> {
  return request('requestFileAccess', input)
}

export function reportResize(): void {
  const height = Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 720)
  post('resize', { height, viewportBound: true })
}

function request(type: string, body: OutboundObject, transfer: Transferable[] = []): Promise<BridgeMessage> {
  const requestId = String(++sequence)
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, { requestId, ...body }, transfer)
  })
}

function readBridgeMessage(event: MessageEvent): BridgeMessage | null {
  const raw = event.data as JsonValue
  if (!isObject(raw) || raw.channel !== CHANNEL || raw.protocolVersion !== VERSION || typeof raw.type !== 'string') return null
  return raw as BridgeMessage
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return isObject(value) ? value : undefined
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function debugValue(value: JsonValue | undefined): HostContext['debug'] {
  const object = objectValue(value)
  if (!object) return undefined
  return {
    enabled: typeof object.enabled === 'boolean' ? object.enabled : undefined,
    production: typeof object.production === 'boolean' ? object.production : undefined
  }
}
