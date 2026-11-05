import { z } from 'zod/v3'
import { DASHBOARD_INSPECTION_RUNTIME } from './inspection-runtime'
import { componentId, type DashboardComponent } from './dashboard-sources'

const message = z.discriminatedUnion('type', [
  z.object({ channel: z.literal('live-dashboard.inspection'), key: z.string(), type: z.literal('ready') }).strict(),
  z.object({ channel: z.literal('live-dashboard.inspection'), key: z.string(), type: z.literal('exit') }).strict(),
  z.object({ channel: z.literal('live-dashboard.inspection'), key: z.string(), type: z.literal('selected'), componentId: componentId.nullable() }).strict()
])

/** One frame generation, one nonce; inspection is UI metadata and grants no query authority. */
export function createDashboardInspector(frame: HTMLIFrameElement, components: DashboardComponent[],
  onSelect: (id: string | null) => void, onExit: () => void, standard = false) {
  const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const host = frame.ownerDocument.defaultView!
  let connected = false, enabled = false, disposed = false
  const send = () => {
    if (connected && !disposed) frame.contentWindow?.postMessage({ channel: 'live-dashboard.inspection', key, type: 'mode', enabled,
      standard, components: components.map(({ id, elementId }) => ({ id, elementId })) }, '*')
  }
  const receive = (event: MessageEvent<unknown>) => {
    if (disposed || event.source !== frame.contentWindow) return
    const parsed = message.safeParse(event.data)
    if (!parsed.success || parsed.data.key !== key) return
    if (parsed.data.type === 'ready') { connected = true; send() }
    else if (parsed.data.type === 'exit') { enabled = false; onExit() }
    else {
      const selected = parsed.data.componentId
      if (enabled && (selected === null || components.some(item => item.id === selected))) onSelect(selected)
    }
  }
  host.addEventListener('message', receive)
  return {
    prefix: `<script>${DASHBOARD_INSPECTION_RUNTIME.replace('__INSPECTION_SESSION__', key)}</script>`,
    setEnabled(value: boolean) { enabled = value; send() },
    dispose() { enabled = false; send(); disposed = true; host.removeEventListener('message', receive) }
  }
}
