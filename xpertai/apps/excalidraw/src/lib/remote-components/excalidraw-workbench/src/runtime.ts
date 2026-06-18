const CHANNEL = 'xpertai.remote_component'
const VERSION = 1
const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>()

let instanceId: string | null = null
let requestSequence = 0
let runtimeText = {
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error'
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function post(type: string, body?: Record<string, unknown>, transfer?: Transferable[]) {
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

export function request(type: string, body?: Record<string, unknown>, transfer?: Transferable[]): Promise<any> {
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

export function requestData(query?: any) {
  return request('requestData', { query: query || {} })
}

export function executeAction(actionKey: string, targetId?: string | null, input?: any, parameters?: any) {
  return request('executeAction', {
    actionKey,
    targetId,
    input,
    parameters
  })
}

export async function executeFileAction(actionKey: string, targetId: string | null, input: any, parameters: any, file: File) {
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

export function invokeClientCommand(commandKey: string, payload: any) {
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

export function getResponsePayload(response: any) {
  if (!response) {
    return null
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

export function resolveMessage(message: any, locale?: unknown): string {
  if (!message) {
    return ''
  }
  if (typeof message === 'string') {
    return message
  }
  if (String(locale || '').toLowerCase().startsWith('zh')) {
    return message.zh_Hans || message.zh_CN || message.en_US || message.en || ''
  }
  return message.en_US || message.en || message.zh_Hans || message.zh_CN || ''
}

export function getErrorMessage(error: any): string {
  return error?.message ? error.message : String(error || runtimeText.unknownError)
}

export function setRuntimeText(nextText: Partial<typeof runtimeText>) {
  runtimeText = {
    ...runtimeText,
    ...nextText
  }
}

export function startRemoteBridge(setContext: (context: any) => void, handleHostEvent: (event: any) => void) {
  let currentContext: any = null

  function applyHostTheme(theme: any) {
    if ((window as any).XpertRemoteUI && typeof (window as any).XpertRemoteUI.applyTheme === 'function') {
      ;(window as any).XpertRemoteUI.applyTheme(theme)
    }
    currentContext = {
      ...(currentContext || {}),
      theme
    }
    setContext(currentContext)
    setTimeout(reportResize, 0)
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) {
      return
    }

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      const manifest = isObject(message.manifest) ? message.manifest : null
      console.info('[excalidraw-workbench] remote bridge init', {
        instanceId,
        hostEvents: manifest?.hostEvents,
        viewKey: manifest?.key,
        locale: message.locale
      })
      currentContext = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery || {},
        locale: message.locale,
        theme: message.theme
      }
      if ((window as any).XpertRemoteUI && typeof (window as any).XpertRemoteUI.applyTheme === 'function') {
        ;(window as any).XpertRemoteUI.applyTheme(message.theme)
      }
      setContext(currentContext)
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
      console.info('[excalidraw-workbench] remote bridge hostEvent received', message.event)
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

function isThemeMessage(message: Record<string, unknown>) {
  return ['theme', 'themeChanged', 'theme-change', 'hostThemeChanged', 'host-theme-changed'].includes(String(message.type || ''))
}

function extractThemeFromMessage(message: Record<string, unknown>) {
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
