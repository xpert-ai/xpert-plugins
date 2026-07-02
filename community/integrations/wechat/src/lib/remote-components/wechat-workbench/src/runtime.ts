/// <reference lib="dom" />

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

let instanceId: string | null = null
let requestSequence = 0
let runtimeText = {
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error'
}

type RemoteBrowserWindow = Window & typeof globalThis

function getBrowserWindow(): RemoteBrowserWindow | null {
  return typeof window === 'undefined' ? null : (window as RemoteBrowserWindow)
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function post(type: string, body?: Record<string, unknown>) {
  if (!instanceId && type !== 'ready') {
    return
  }
  getBrowserWindow()?.parent.postMessage(
    Object.assign(
      {
        channel: CHANNEL,
        protocolVersion: VERSION,
        instanceId,
        type
      },
      body || {}
    ),
    '*'
  )
}

export function request(type: string, body?: Record<string, unknown>): Promise<any> {
  const requestId = String(++requestSequence)
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    post(type, Object.assign({ requestId }, body || {}))
    setTimeout(() => {
      if (!pending.has(requestId)) {
        return
      }
      pending.delete(requestId)
      reject(new Error(runtimeText.requestTimeout))
    }, 30000)
  })
}

export function executeAction(actionKey: string, targetId?: string | null, input?: any, parameters?: any) {
  return request('executeAction', {
    actionKey,
    targetId,
    input,
    parameters
  })
}

export function notify(level: 'success' | 'error' | 'info' | 'warning', message: string) {
  post('notify', { level, message })
}

export function reportResize() {
  const browser = getBrowserWindow()
  const height = Math.max(
    browser?.document.body.scrollHeight || 0,
    browser?.document.documentElement.scrollHeight || 0,
    620
  )
  post('resize', { height })
}

export function getResponsePayload(response: any) {
  if (!response) {
    return null
  }
  if (typeof response.success === 'boolean') {
    return response
  }
  if (response.result !== undefined) {
    return response.result
  }
  if (response.payload !== undefined) {
    return response.payload
  }
  if (response.data !== undefined) {
    return response.data
  }
  return response
}

export function getSidecarConfigJson(callbackConfig?: any, tunnelSetup?: any): string {
  const explicitJson = typeof callbackConfig?.sidecarConfigJson === 'string' ? callbackConfig.sidecarConfigJson : ''
  if (explicitJson.trim()) {
    return explicitJson
  }
  if (isObject(callbackConfig?.sidecarConfig)) {
    return JSON.stringify(callbackConfig.sidecarConfig, null, 2)
  }
  const legacyJson = typeof tunnelSetup?.settingJson === 'string' ? tunnelSetup.settingJson : ''
  return legacyJson.trim() ? legacyJson : ''
}

export function setRuntimeText(nextText: Partial<typeof runtimeText>) {
  runtimeText = {
    ...runtimeText,
    ...nextText
  }
}

export function resolveMessage(message: any, locale?: unknown): string {
  if (!message) {
    return ''
  }
  if (typeof message === 'string') {
    return message
  }
  if (String(locale || '').toLowerCase().startsWith('en')) {
    return message.en_US || message.en || message.zh_Hans || message.zh_CN || ''
  }
  return message.zh_Hans || message.zh_CN || message.en_US || message.en || ''
}

export function getErrorMessage(error: any): string {
  return error?.message ? error.message : String(error || runtimeText.unknownError)
}

export function startRemoteBridge(setContext: (context: any) => void, handleHostEvent: (event: any) => void) {
  const browser = getBrowserWindow()
  if (!browser) {
    return
  }
  browser.addEventListener('message', (event: MessageEvent) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) {
      return
    }

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      setContext({
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery || {},
        locale: message.locale,
        theme: message.theme
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) {
      return
    }

    if (message.type === 'hostEvent') {
      handleHostEvent(message.event)
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
