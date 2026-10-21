import { z } from 'zod/v3'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { dashboardNavigationTargetSchema, type DashboardNavigationTarget } from '../lib/dashboard-navigation'
import type { WorkbenchNavigationOpenPayload } from '@xpert-ai/contracts'
import { createdDashboard, DASHBOARD_MUTATION_TOOLS } from '../lib/dashboard-receipt'

const envelope = z.object({ channel: z.literal('xpertai.remote_component'), protocolVersion: z.literal(1),
  type: z.string(), instanceId: z.string().optional(), requestId: z.string().optional(), locale: z.string().optional(),
  initialQuery: z.unknown(), data: z.unknown(), result: z.unknown(), message: z.string().optional(),
  event: z.object({ type: z.string(), toolName: z.string().optional(), data: z.object({ output: z.unknown() }).optional() }).optional(),
  theme: z.object({ mode: z.string().optional(), density: z.enum(['default', 'compact']).optional(), tokens: z.record(z.union([z.string(), z.number()])).optional() }).optional()
})
let instanceId: string | undefined
let sequence = 0
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>()
function post(type: string, body: object = {}) { window.parent.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, type, ...body }, '*') }
/** Public navigation is reflected in every init; tool receipts separately invalidate saved content. */
export function startBridge(onReady: (locale: string, initialQuery: unknown) => void, onCreated: (artifactId: string) => void) {
  let lastCreatedVersion: string | undefined
  const listener = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data); if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init') {
      if (instanceId && message.instanceId !== instanceId) return
      instanceId = message.instanceId
      document.documentElement.classList.toggle('dark', message.theme?.mode === 'dark')
      for (const [key, value] of Object.entries(message.theme?.tokens ?? {})) {
        const property = key.startsWith('--') ? key : `--xui-${key.replace(/[._]/g, '-').replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
        document.documentElement.style.setProperty(property, String(value))
      }
      installShadcnThemeVars({ density: message.theme?.density })
      onReady(message.locale ?? 'en-US', message.initialQuery); return
    }
    if (!instanceId || message.instanceId !== instanceId) return
    if (message.type === 'hostEvent' && message.event?.type === 'assistant.tool.completed' && DASHBOARD_MUTATION_TOOLS.includes(message.event.toolName ?? '')) {
      const receipt = createdDashboard(message.event.data?.output)
      if (receipt && `${receipt.artifactId}:${receipt.draftRevision}` !== lastCreatedVersion) {
        lastCreatedVersion = `${receipt.artifactId}:${receipt.draftRevision}`
        onCreated(receipt.artifactId)
      }
      return
    }
    if (!message.requestId) return
    const request = pending.get(message.requestId); if (!request) return
    pending.delete(message.requestId); clearTimeout(request.timer)
    if (message.type === 'error') request.reject(new Error(message.message ?? 'Request failed'))
    else request.resolve(message.data ?? message.result)
  }
  window.addEventListener('message', listener); post('ready')
  return () => { window.removeEventListener('message', listener); for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('View closed')) }; pending.clear() }
}
export function requestHost(type: 'requestData' | 'executeAction' | 'invokeClientCommand', body: object): Promise<unknown> {
  if (!instanceId) return Promise.reject(new Error('View is not connected'))
  const requestId = `dashboard-${++sequence}`
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { pending.delete(requestId); reject(new Error('Request timed out')) }, 270000)
    pending.set(requestId, { resolve, reject, timer }); post(type, { requestId, ...body })
  })
}
export function selectDashboard(target: { artifactId: string; versionId?: string; draftRevision?: number } | null) {
  return requestHost('invokeClientCommand', { commandKey: 'assistant.context.set',
    payload: { key: 'live_dashboard', ...(target ? { context: { schemaVersion: 1, ...target } } : { clear: true }) } })
}

export function navigateDashboard(target: DashboardNavigationTarget | undefined, artifactId: string, versionId?: string) {
  return requestHost('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: {
    ...dashboardNavigationTargetSchema.parse(target), selectionId: artifactId, parameters: versionId ? { versionId } : {}
  } satisfies WorkbenchNavigationOpenPayload })
}
