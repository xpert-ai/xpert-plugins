const channel = 'xpertai.remote_component'
const instanceId = 'road-event-command-center-local-preview'
const storageKey = 'road-event-command-center.preview-draft.v1'
const frame = document.querySelector<HTMLIFrameElement>('#remote-view')!

type PreviewState = {
  revision: number
  draft: Record<string, unknown> | null
  updatedAt: string | null
}

function readState(): PreviewState {
  try {
    const value = sessionStorage.getItem(storageKey)
    return value ? JSON.parse(value) as PreviewState : { revision: 0, draft: null, updatedAt: null }
  } catch {
    return { revision: 0, draft: null, updatedAt: null }
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== frame.contentWindow || !event.data || event.data.channel !== channel) return
  const message = event.data as Record<string, unknown>
  if (message.type === 'ready') {
    frame.contentWindow?.postMessage({
      channel, protocolVersion: 1, type: 'init', instanceId, locale: 'zh-Hans', debug: { enabled: false }
    }, '*')
    return
  }
  if (message.instanceId !== instanceId || typeof message.requestId !== 'string') return
  if (message.type === 'resize') {
    if (typeof message.height === 'number') frame.style.height = String(Math.max(560, Math.min(message.height, window.innerHeight - 58))) + 'px'
    return
  }

  const reply = (type: string, body: Record<string, unknown>) => frame.contentWindow?.postMessage({
    channel, protocolVersion: 1, type, instanceId, requestId: message.requestId, ...body
  }, '*')

  if (message.type === 'requestData') {
    reply('data', { data: { item: readState() } })
    return
  }
  if (message.type !== 'executeAction' || message.actionKey !== 'save_draft') {
    reply('actionResult', { result: { success: false, data: { code: 'not_found' } } })
    return
  }

  const state = readState()
  const input = message.input as Record<string, unknown> | undefined
  const draft = input?.draft
  if (input?.expectedRevision !== state.revision) {
    reply('actionResult', { result: { success: false, data: { code: 'conflict' } } })
    return
  }
  if (!draft || typeof draft !== 'object') {
    reply('actionResult', { result: { success: false, data: { code: 'invalid_input' } } })
    return
  }
  const next = { revision: state.revision + 1, draft: draft as Record<string, unknown>, updatedAt: new Date().toISOString() }
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(next))
    reply('actionResult', { result: { success: true, data: { revision: next.revision, updatedAt: next.updatedAt } } })
  } catch {
    reply('actionResult', { result: { success: false, data: { code: 'storage_unavailable' } } })
  }
})
