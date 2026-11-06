import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { z } from 'zod/v3'
const channel = 'xpertai.remote_component'
const envelope = z
  .object({
    channel: z.literal(channel),
    protocolVersion: z.literal(1),
    instanceId: z.string().optional(),
    type: z.string(),
    requestId: z.string().optional(),
    locale: z.string().optional(),
    theme: z
      .object({
        mode: z.enum(['light', 'dark']).optional(),
        density: z.enum(['compact', 'default']).optional(),
        tokens: z.record(z.string()).optional()
      })
      .optional(),
    debug: z.object({ enabled: z.boolean().optional() }).optional(),
    data: z.unknown().optional(),
    payload: z.unknown().optional(),
    result: z.unknown().optional()
  })
  .passthrough()
let instanceId: string | undefined,
  sequence = 0,
  debug = false
const pending = new Map<
  string,
  {
    resolve: (v: z.infer<typeof envelope>) => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()
export function startBridge(
  init: (locale?: string) => void,
  changed: () => void
) {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const m = parsed.data
    if (m.type === 'init') {
      instanceId = m.instanceId
      debug = m.debug?.enabled === true
      applyTheme(m.theme)
      window.parent.postMessage(
        {
          channel,
          protocolVersion: 1,
          instanceId,
          type: 'resize',
          height: 10000,
          viewportBound: true
        },
        '*'
      )
      init(m.locale)
      return
    }
    if (!instanceId || m.instanceId !== instanceId) return
    if (m.type === 'theme' || m.type === 'themeChanged') {
      applyTheme(m.theme)
      return
    }
    if (m.type === 'hostEvent') {
      if (debug) console.debug('[lease-review] host event received')
      changed()
      return
    }
    const p = m.requestId ? pending.get(m.requestId) : undefined
    if (p && m.requestId) {
      clearTimeout(p.timer)
      pending.delete(m.requestId)
      m.type === 'error'
        ? p.reject(new Error('operation_failed'))
        : p.resolve(m)
    }
  }
  window.addEventListener('message', listener)
  window.parent.postMessage({ channel, protocolVersion: 1, type: 'ready' }, '*')
  return () => {
    window.removeEventListener('message', listener)
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('operation_failed'))
    }
    pending.clear()
  }
}
function applyTheme(theme: z.infer<typeof envelope>['theme']) {
  document.documentElement.classList.toggle('dark', theme?.mode === 'dark')
  for (const [name, value] of Object.entries(theme?.tokens ?? {})) {
    const property = name.startsWith('--xui-')
      ? name
      : '--xui-' + name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    document.documentElement.style.setProperty(property, value)
  }
  installShadcnThemeVars({ density: theme?.density ?? 'default' })
}
export function request(type: string, body: object, timeoutMs = 30000) {
  if (!instanceId) return Promise.reject(new Error('operation_failed'))
  const requestId = String(++sequence)
  return new Promise<z.infer<typeof envelope>>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('request_timeout'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    window.parent.postMessage(
      { channel, protocolVersion: 1, instanceId, requestId, type, ...body },
      '*'
    )
  })
}
