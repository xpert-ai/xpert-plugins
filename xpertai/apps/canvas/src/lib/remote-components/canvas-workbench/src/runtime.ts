import { canvasWorkbenchDebug, setCanvasDebugHostConfig } from './debug-logger.js'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

export type RemotePayloadPrimitive = string | number | boolean | null
export type RemotePayloadValue = RemotePayloadPrimitive | RemotePayloadObject | RemotePayloadValue[] | ArrayBuffer
export interface RemotePayloadObject {
  [key: string]: RemotePayloadValue | undefined
}

export interface RemoteResponse extends RemotePayloadObject {
  payload?: RemotePayloadValue
  data?: RemotePayloadValue
  result?: RemotePayloadValue
  message?: string
}

type RemoteMessage = RemoteResponse & {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string | number
  event?: RemotePayloadValue
  manifest?: RemotePayloadValue
  initialQuery?: RemotePayloadValue
  locale?: string
  theme?: RemotePayloadValue
  debug?: RemotePayloadValue
}

type RemoteErrorLike = Error | { message?: string } | string | null | undefined

const pending = new Map<string, { resolve: (value: RemoteResponse) => void; reject: (error: Error) => void }>()

let instanceId: string | null = null
let requestSequence = 0
let runtimeText = {
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error'
}

export type RemoteBridgeContext = {
  manifest?: RemotePayloadValue
  payload?: RemotePayloadValue
  initialQuery?: {
    parameters?: RemotePayloadObject
    selectionId?: RemotePayloadValue
    [key: string]: RemotePayloadValue | undefined
  }
  locale?: string
  theme?: RemotePayloadValue
  debug?: RemotePayloadValue
}

type RemoteUIWindow = Window & {
  XpertRemoteUI?: {
    applyTheme?: (theme: RemotePayloadValue | undefined) => void
  }
}

export function isObject(value: RemotePayloadValue | object | null | undefined): value is RemotePayloadObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function post(type: string, body?: RemotePayloadObject, transfer?: Transferable[]) {
  if (!instanceId && type !== 'ready') {
    return
  }
  parent.postMessage(
    Object.assign(
      {
        channel: CHANNEL,
        protocolVersion: VERSION,
        instanceId,
        type
      },
      body || {}
    ),
    '*',
    transfer || []
  )
}

export function request(type: string, body?: RemotePayloadObject, transfer?: Transferable[]): Promise<RemoteResponse> {
  const requestId = String(++requestSequence)
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    try {
      post(type, Object.assign({ requestId }, body || {}), transfer)
    } catch (error) {
      pending.delete(requestId)
      reject(error instanceof Error ? error : new Error(runtimeText.remoteRequestFailed))
      return
    }
    setTimeout(() => {
      if (!pending.has(requestId)) {
        return
      }
      pending.delete(requestId)
      reject(new Error(runtimeText.requestTimeout))
    }, 30000)
  })
}

export function requestData(query?: RemotePayloadObject) {
  return request('requestData', { query: query || {} })
}

export function executeAction(actionKey: string, targetId?: string | null, input?: RemotePayloadObject | null, parameters?: RemotePayloadObject | null) {
  return request('executeAction', {
    actionKey,
    targetId,
    input,
    parameters
  })
}

export async function executeFileAction(
  actionKey: string,
  targetId: string | null,
  input: RemotePayloadObject | null,
  parameters: RemotePayloadObject | null,
  file: File
) {
  const buffer = await file.arrayBuffer()
  return request(
    'executeFileAction',
    {
      actionKey,
      targetId,
      input,
      parameters,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        buffer
      }
    },
    [buffer]
  )
}

export function invokeClientCommand(commandKey: string, payload: RemotePayloadObject) {
  return request('invokeClientCommand', {
    commandKey,
    payload
  })
}

export function notify(level: 'success' | 'error' | 'info' | 'warning', message: string) {
  post('notify', { level, message })
}

export function reportResize() {
  const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight || 0, 720)
  post('resize', { height, viewportBound: true })
}

export function getResponsePayload(response: RemoteResponse | RemotePayloadValue | null | undefined) {
  if (!response) {
    return null
  }
  if (!isObject(response)) {
    return response
  }
  if (response.payload !== undefined) {
    return response.payload
  }
  if (response.data !== undefined) {
    return response.data
  }
  if (response.result !== undefined) {
    return response.result
  }
  return response
}

export function getErrorMessage(error: RemoteErrorLike): string {
  return typeof error === 'object' && error && 'message' in error && error.message ? error.message : String(error || runtimeText.unknownError)
}

export function setRuntimeText(nextText: Partial<typeof runtimeText>) {
  runtimeText = {
    ...runtimeText,
    ...nextText
  }
}

export function startRemoteBridge(setContext: (context: RemoteBridgeContext) => void, handleHostEvent: (event: RemotePayloadValue | undefined) => void) {
  let currentContext: RemoteBridgeContext | null = null

  function applyRemoteTheme(theme: RemotePayloadValue | undefined) {
    const remoteUi = (window as RemoteUIWindow).XpertRemoteUI
    remoteUi?.applyTheme?.(theme)
  }

  function applyHostTheme(theme: RemotePayloadValue | undefined) {
    applyRemoteTheme(theme)
    const nextContext: RemoteBridgeContext = {
      ...(currentContext || {}),
      theme
    }
    currentContext = nextContext
    setContext(nextContext)
    setTimeout(reportResize, 0)
  }

  window.addEventListener('message', (event) => {
    const message = event.data as RemoteMessage
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) {
      return
    }

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      setCanvasDebugHostConfig(message.debug)
      const nextContext: RemoteBridgeContext = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: getInitialQuery(message.initialQuery),
        locale: typeof message.locale === 'string' ? message.locale : undefined,
        theme: message.theme,
        debug: message.debug
      }
      currentContext = nextContext
      applyRemoteTheme(message.theme)
      setContext(nextContext)
      canvasWorkbenchDebug.info('bridge.init', {
        instanceId: instanceId ?? '',
        locale: nextContext.locale ?? '',
        manifestKey: isObject(message.manifest) && typeof message.manifest.key === 'string' ? message.manifest.key : '',
        hasInitialQuery: message.initialQuery !== undefined,
        hasTheme: message.theme !== undefined,
        hasDebug: message.debug !== undefined,
        debug: message.debug
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) {
      return
    }

    if (isThemeMessage(message)) {
      applyHostTheme(extractThemeFromMessage(message))
      return
    }

    if (message.type === 'hostEvent') {
      canvasWorkbenchDebug.info('bridge.hostEvent.received', {
        messageType: message.type,
        hasEvent: message.event !== undefined,
        hasPayload: message.payload !== undefined,
        hasData: message.data !== undefined,
        hasResult: message.result !== undefined
      })
      const hostEvent = extractHostEventFromMessage(message)
      canvasWorkbenchDebug.info('bridge.hostEvent.extracted', summarizeHostEvent(hostEvent))
      handleHostEvent(hostEvent)
      return
    }

    if (message.requestId && pending.has(String(message.requestId))) {
      const item = pending.get(String(message.requestId))
      pending.delete(String(message.requestId))
      if (!item) {
        return
      }
      if (message.type === 'error') {
        item.reject(new Error(String(message.message || runtimeText.remoteRequestFailed)))
      } else {
        item.resolve(message)
      }
    }
  })
}

function summarizeHostEvent(event: RemotePayloadValue | undefined): RemotePayloadObject {
  if (!isObject(event)) {
    return {
      kind: event === undefined ? 'undefined' : typeof event
    }
  }

  const data = isObject(event.data) ? event.data : null
  const output = data && isObject(data.output) ? data.output : null
  const input = data && isObject(data.input) ? data.input : null
  return {
    kind: 'object',
    type: typeof event.type === 'string' ? event.type : '',
    source: typeof event.source === 'string' ? event.source : '',
    toolName: typeof event.toolName === 'string' ? event.toolName : '',
    hasData: event.data !== undefined,
    hasInput: Boolean(input),
    hasOutput: Boolean(output),
    inputKeys: input ? Object.keys(input) : [],
    outputKeys: output ? Object.keys(output) : [],
    topLevelKeys: Object.keys(event)
  }
}

function extractHostEventFromMessage(message: RemoteMessage): RemotePayloadValue | undefined {
  if (message.event !== undefined) {
    return message.event
  }
  if (message.payload !== undefined) {
    return message.payload
  }
  if (message.data !== undefined) {
    return message.data
  }
  if (message.result !== undefined) {
    return message.result
  }
  return message
}

function isThemeMessage(message: RemotePayloadObject) {
  return ['theme', 'themeChanged', 'theme-change', 'hostThemeChanged', 'host-theme-changed'].includes(String(message.type || ''))
}

function getInitialQuery(value: RemotePayloadValue | undefined): RemoteBridgeContext['initialQuery'] {
  if (!isObject(value)) {
    return {}
  }
  return {
    ...value,
    parameters: isObject(value.parameters) ? value.parameters : undefined,
    selectionId: value.selectionId
  }
}

function extractThemeFromMessage(message: RemotePayloadObject) {
  if (message.theme !== undefined) {
    return message.theme
  }
  if (isObject(message.payload) && message.payload.theme !== undefined) {
    return message.payload.theme
  }
  if (isObject(message.data) && message.data.theme !== undefined) {
    return message.data.theme
  }
  return message.payload ?? message.data ?? null
}
