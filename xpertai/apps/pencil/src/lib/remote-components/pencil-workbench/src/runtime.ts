import { pencilWorkbenchDebug, setPencilDebugHostConfig } from './debug-logger.js'

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

/** Wire envelope used by the versioned Xpert remote-component postMessage protocol. */
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

// Request ids correlate concurrent iframe calls with asynchronous host responses.
const pending = new Map<string, { resolve: (value: RemoteResponse) => void; reject: (error: Error) => void }>()
const initWaiters = new Set<() => void>()

let instanceId: string | null = null
let requestSequence = 0
let readyAnnouncementTimer: number | null = null
let readyAnnouncementStopTimer: number | null = null

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

export function isObject(value: unknown): value is RemotePayloadObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stopReadyAnnouncements() {
  if (readyAnnouncementTimer !== null) {
    window.clearInterval(readyAnnouncementTimer)
    readyAnnouncementTimer = null
  }
  if (readyAnnouncementStopTimer !== null) {
    window.clearTimeout(readyAnnouncementStopTimer)
    readyAnnouncementStopTimer = null
  }
}

function announceReadyUntilInit() {
  // Repeat ready briefly because the host listener and iframe script may start in either order.
  post('ready')
  if (readyAnnouncementTimer !== null) {
    return
  }
  readyAnnouncementTimer = window.setInterval(() => {
    if (instanceId) {
      stopReadyAnnouncements()
      return
    }
    post('ready')
  }, 500)
  readyAnnouncementStopTimer = window.setTimeout(() => {
    stopReadyAnnouncements()
  }, 10000)
}

function resolveInitWaiters() {
  for (const resolve of Array.from(initWaiters)) {
    resolve()
  }
  initWaiters.clear()
}

function waitForBridgeInit(timeoutMs = 10000) {
  if (instanceId) {
    return Promise.resolve()
  }
  announceReadyUntilInit()
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timeoutId = 0
    const complete = () => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timeoutId)
      initWaiters.delete(complete)
      resolve()
    }
    timeoutId = window.setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      initWaiters.delete(complete)
      reject(new Error('Remote bridge is not initialized'))
    }, timeoutMs)
    initWaiters.add(complete)
  })
}

export function post(type: string, body?: RemotePayloadObject, transfer?: Transferable[]) {
  if (!instanceId && type !== 'ready') {
    return false
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
  return true
}

/** Sends a correlated bridge request after initialization and enforces a bounded wait. */
export async function request(type: string, body?: RemotePayloadObject, transfer?: Transferable[]): Promise<RemoteResponse> {
  await waitForBridgeInit()
  const requestId = String(++requestSequence)
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    try {
      const delivered = post(type, Object.assign({ requestId }, body || {}), transfer)
      if (!delivered) {
        pending.delete(requestId)
        reject(new Error('Remote bridge is not initialized'))
        return
      }
    } catch (error) {
      pending.delete(requestId)
      reject(error instanceof Error ? error : new Error('Remote request failed'))
      return
    }
    setTimeout(() => {
      if (!pending.has(requestId)) {
        return
      }
      pending.delete(requestId)
      reject(new Error('Request timed out'))
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

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error')
}

/** Installs the single host-message listener and routes init, theme, events, and responses. */
export function startRemoteBridge(setContext: (context: RemoteBridgeContext) => void, handleHostEvent: (event: RemotePayloadValue | undefined) => void) {
  let currentContext: RemoteBridgeContext | null = null

  function applyRemoteTheme(theme: RemotePayloadValue | undefined) {
    const remoteUi = (window as RemoteUIWindow).XpertRemoteUI
    remoteUi?.applyTheme?.(theme)
  }

  window.addEventListener('message', (event) => {
    const message = event.data as RemoteMessage
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) {
      return
    }
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      setPencilDebugHostConfig(message.debug)
      applyRemoteTheme(message.theme)
      currentContext = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: isObject(message.initialQuery) ? message.initialQuery : undefined,
        locale: message.locale,
        theme: message.theme,
        debug: message.debug
      }
      if (instanceId) {
        stopReadyAnnouncements()
        resolveInitWaiters()
      }
      setContext(currentContext)
      pencilWorkbenchDebug('bridge init', currentContext)
      setTimeout(reportResize, 0)
      return
    }
    if (message.type === 'theme') {
      applyRemoteTheme(message.theme)
      currentContext = {
        ...(currentContext || {}),
        theme: message.theme
      }
      setContext(currentContext)
      setTimeout(reportResize, 0)
      return
    }
    if (message.type === 'hostEvent') {
      handleHostEvent(message.event)
      return
    }
    if (message.requestId !== undefined) {
      const entry = pending.get(String(message.requestId))
      if (!entry) {
        return
      }
      pending.delete(String(message.requestId))
      if (message.type === 'error') {
        entry.reject(new Error(typeof message.message === 'string' ? message.message : 'Remote request failed'))
      } else {
        entry.resolve(message)
      }
    }
  })
  announceReadyUntilInit()
}
