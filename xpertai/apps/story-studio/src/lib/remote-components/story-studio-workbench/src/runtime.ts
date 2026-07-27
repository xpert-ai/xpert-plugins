import { setDebugHostConfig, storyStudioDebug } from './debug-logger'

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

export type RemotePrimitive = string | number | boolean | null
export type RemoteValue =
  | RemotePrimitive
  | RemoteObject
  | RemoteValue[]
  | undefined

export interface RemoteObject {
  [key: string]: RemoteValue
}

export interface RemoteResponse extends RemoteObject {
  payload?: RemoteValue
  data?: RemoteValue
  result?: RemoteValue
  message?: string
}

interface RemoteMessage extends RemoteResponse {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string | number
  event?: RemoteValue
  manifest?: RemoteValue
  initialQuery?: RemoteValue
  locale?: string
  theme?: RemoteValue
  debug?: RemoteValue
}

export interface RemoteBridgeContext {
  manifest?: RemoteValue
  payload?: RemoteValue
  initialQuery?: RemoteObject
  locale?: string
  theme?: RemoteValue
  debug?: RemoteValue
}

export class RemoteActionError extends Error {
  constructor(
    message: string,
    readonly data: RemoteObject | null
  ) {
    super(message)
    this.name = 'RemoteActionError'
  }
}

type RemoteWindow = Window & {
  XpertRemoteUI?: {
    applyTheme?: (theme: RemoteValue) => void
  }
}

const pending = new Map<
  string,
  {
    resolve: (value: RemoteResponse) => void
    reject: (error: Error) => void
  }
>()

let instanceId: string | null = null
let requestSequence = 0
let runtimeText = {
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error'
}

export function isRemoteObject(
  value: RemoteValue | object | null
): value is RemoteObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function post(type: string, body?: RemoteObject) {
  if (!instanceId && type !== 'ready') {
    return
  }
  parent.postMessage(
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

export function request(
  type: string,
  body?: RemoteObject
): Promise<RemoteResponse> {
  const requestId = String(++requestSequence)
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    try {
      post(type, {
        requestId,
        ...(body ?? {})
      })
    } catch (error) {
      pending.delete(requestId)
      reject(
        error instanceof Error
          ? error
          : new Error(runtimeText.remoteRequestFailed)
      )
      return
    }
    setTimeout(() => {
      if (!pending.has(requestId)) {
        return
      }
      pending.delete(requestId)
      reject(new Error(runtimeText.requestTimeout))
    }, 30_000)
  })
}

export function requestData(query: RemoteObject = {}) {
  return request('requestData', { query })
}

export function executeAction(
  actionKey: string,
  targetId: string | null,
  input: RemoteObject
) {
  return request('executeAction', {
    actionKey,
    targetId,
    input
  })
}

export function invokeClientCommand(
  commandKey: string,
  payload: RemoteObject
) {
  return request('invokeClientCommand', {
    commandKey,
    payload
  })
}

export function notify(
  level: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  post('notify', { level, message })
}

export function reportResize() {
  const height = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    window.innerHeight,
    720
  )
  post('resize', { height, viewportBound: true })
}

export function getResponsePayload(
  response: RemoteResponse | RemoteValue | null
) {
  if (!response || !isRemoteObject(response)) {
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

export function requireSuccessfulAction(
  response: RemoteResponse | RemoteValue | null
) {
  const payload = getResponsePayload(response)
  if (!isRemoteObject(payload) || payload.success !== false) {
    return payload
  }
  throw new RemoteActionError(
    readLocalizedMessage(payload.message) ?? runtimeText.remoteRequestFailed,
    isRemoteObject(payload.data) ? payload.data : null
  )
}

export function getErrorMessage(error: Error | string | null) {
  return error instanceof Error
    ? error.message
    : String(error ?? runtimeText.unknownError)
}

function readLocalizedMessage(value: RemoteValue) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (!isRemoteObject(value)) {
    return null
  }
  const locale = document.documentElement.lang.toLowerCase()
  const preferredKeys = locale.startsWith('zh')
    ? locale.includes('hant') || locale.includes('tw') || locale.includes('hk')
      ? ['zh_Hant', 'zh_TW', 'zh_Hans', 'en_US']
      : ['zh_Hans', 'zh_CN', 'zh_Hant', 'en_US']
    : ['en_US', 'en', 'zh_Hans']
  for (const key of preferredKeys) {
    const message = value[key]
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }
  return null
}

export function setRuntimeText(next: Partial<typeof runtimeText>) {
  runtimeText = {
    ...runtimeText,
    ...next
  }
}

export function startRemoteBridge(
  setContext: (context: RemoteBridgeContext) => void,
  handleHostEvent: (event: RemoteValue) => void
) {
  let currentContext: RemoteBridgeContext = {}

  window.addEventListener('message', (event) => {
    const message = event.data as RemoteMessage
    if (
      !isRemoteObject(message) ||
      message.channel !== CHANNEL ||
      message.protocolVersion !== VERSION
    ) {
      return
    }

    if (message.type === 'init') {
      instanceId =
        typeof message.instanceId === 'string'
          ? message.instanceId
          : null
      setDebugHostConfig(message.debug)
      currentContext = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: isRemoteObject(message.initialQuery)
          ? message.initialQuery
          : {},
        locale:
          typeof message.locale === 'string'
            ? message.locale
            : undefined,
        theme: message.theme,
        debug: message.debug
      }
      applyTheme(message.theme)
      setContext(currentContext)
      storyStudioDebug.info('bridge.init', {
        locale: currentContext.locale ?? '',
        hasPayload: message.payload !== undefined,
        hasTheme: message.theme !== undefined
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) {
      return
    }

    if (isThemeMessage(message.type)) {
      currentContext = {
        ...currentContext,
        theme: message.theme ?? message.payload ?? message.data
      }
      applyTheme(currentContext.theme)
      setContext(currentContext)
      return
    }

    if (message.type === 'hostEvent') {
      const hostEvent =
        message.event ??
        message.payload ??
        message.data ??
        message.result ??
        message
      storyStudioDebug.info('bridge.hostEvent.received', {
        hasEvent: hostEvent !== undefined
      })
      handleHostEvent(hostEvent)
      return
    }

    if (message.requestId) {
      const key = String(message.requestId)
      const item = pending.get(key)
      if (!item) {
        return
      }
      pending.delete(key)
      if (message.type === 'error') {
        item.reject(
          new Error(message.message ?? runtimeText.remoteRequestFailed)
        )
      } else {
        item.resolve(message)
      }
    }
  })
}

function applyTheme(theme: RemoteValue) {
  const remoteUi = (window as RemoteWindow).XpertRemoteUI
  remoteUi?.applyTheme?.(theme)
}

function isThemeMessage(type?: string) {
  return [
    'theme',
    'themeChanged',
    'theme-change',
    'hostThemeChanged',
    'host-theme-changed'
  ].includes(type ?? '')
}
