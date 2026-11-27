import { z } from 'zod'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
const channel = 'xpertai.remote_component'
const envelope = z
  .object({
    channel: z.literal(channel),
    protocolVersion: z.literal(1),
    type: z.string(),
    instanceId: z.string().nullable().optional(),
    requestId: z.string().optional()
  })
  .passthrough()
const waits = new Map<
  string,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()
let instanceId: string | null = null
let sequence = 0
export function send(type: string, body: object = {}) {
  window.parent.postMessage(
    { channel, protocolVersion: 1, instanceId, type, ...body },
    '*'
  )
}
export function connect(
  init: (value: Record<string, unknown>) => void,
  refresh: () => void
) {
  const listener = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init') {
      instanceId = message.instanceId ?? null
      applyTheme(message)
      init(message)
      return
    }
    if (!instanceId || message.instanceId !== instanceId) return
    if (message.type === 'theme') {
      applyTheme(message)
      return
    }
    if (message.type === 'hostEvent') {
      refresh()
      return
    }
    const pending = message.requestId ? waits.get(message.requestId) : undefined
    if (!pending || !message.requestId) return
    clearTimeout(pending.timer)
    waits.delete(message.requestId)
    if (message.type === 'error') pending.reject(new Error('transport_failed'))
    else pending.resolve(message)
  }
  window.addEventListener('message', listener)
  send('ready')
  send('resize', {
    height: Math.max(window.innerHeight, 640),
    viewportBound: true
  })
  return () => {
    window.removeEventListener('message', listener)
    for (const pending of waits.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('transport_failed'))
    }
    waits.clear()
  }
}
function applyTheme(message: Record<string, unknown>) {
  const theme = z
    .object({
      cssVars: z.record(z.string()).optional(),
      colorScheme: z.string().optional()
    })
    .safeParse(message.theme)
  if (theme.success) {
    for (const [key, value] of Object.entries(theme.data.cssVars ?? {}))
      if (key.startsWith('--xui-'))
        document.documentElement.style.setProperty(key, value)
    document.documentElement.classList.toggle(
      'dark',
      theme.data.colorScheme === 'dark'
    )
  }
  installShadcnThemeVars({ density: 'compact' })
}
export function request(type: string, body: object): Promise<unknown> {
  if (!instanceId) return Promise.reject(new Error('transport_failed'))
  const requestId = String(++sequence)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waits.delete(requestId)
      reject(new Error('transport_failed'))
    }, 25_000)
    waits.set(requestId, { resolve, reject, timer })
    send(type, { requestId, ...body })
  })
}
