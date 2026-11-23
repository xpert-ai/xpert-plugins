import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type { WorkbenchNavigationOpenPayload } from '@xpert-ai/contracts'
import type { WorkbenchData, ActionInput } from '../src/projection'
type Query = {
  selectionId?: string
  parameters?: {
    nodeKey?: string
    pipelineNodeId?: string
    pipelineInstanceId?: string
    pipelineRoundId?: string
  }
}
export interface Init {
  locale?: string
  initialQuery?: Query
  manifest?: { key: string }
  theme?: { mode?: string; density?: 'default' | 'compact'; tokens?: Record<string, string> }
}
interface Message extends Init {
  channel: string
  protocolVersion: number
  instanceId: string
  type: string
  requestId?: string
  data?: WorkbenchData
  payload?: WorkbenchData
  success?: boolean
  result?: { success: boolean; data?: { caseId: string }; message?: { zh_Hans?: string } }
  message?: string
}
const channel = 'xpertai.remote_component'
let instance: string | undefined
const pending = new Map<string, (data: Message) => void>()
function theme(value: Init['theme']) {
  if (!value) return
  document.documentElement.classList.toggle('dark', value.mode === 'dark')
  for (const [k, v] of Object.entries(value.tokens ?? {}))
    document.documentElement.style.setProperty(
      k.startsWith('--xui-') ? k : '--xui-' + k.replace(/[A-Z]/g, (l) => '-' + l.toLowerCase()),
      v,
    )
  installShadcnThemeVars({ density: value.density ?? 'default' })
}
export function mount(init: (v: Init) => void) {
  const listen = (ev: MessageEvent<Message>) => {
    const m = ev.data
    if (ev.source !== window.parent || m?.channel !== channel || m.protocolVersion !== 1) return
    if (m.type === 'init') {
      instance = m.instanceId
      theme(m.theme)
      init(m)
      return
    }
    if (m.instanceId !== instance) return
    if (m.type === 'theme' || m.type === 'themeChanged') theme(m.theme)
    else if (m.requestId) pending.get(m.requestId)?.(m)
  }
  window.addEventListener('message', listen)
  window.parent.postMessage({ channel, type: 'ready', protocolVersion: 1 }, '*')
  return () => window.removeEventListener('message', listen)
}
function request(type: string, body: object) {
  return new Promise<Message>((resolve, reject) => {
    const requestId = crypto.randomUUID(),
      timer = setTimeout(() => {
        pending.delete(requestId)
        reject(Error('request_timeout'))
      }, 45000)
    pending.set(requestId, (m) => {
      clearTimeout(timer)
      pending.delete(requestId)
      if (m.type === 'error' || m.success === false || m.result?.success === false)
        reject(Error(m.result?.message?.zh_Hans ?? m.message ?? 'request_failed'))
      else resolve(m)
    })
    window.parent.postMessage(
      { channel, protocolVersion: 1, instanceId: instance, type, requestId, ...body },
      '*',
    )
  })
}
export async function query(selectionId?: string, roundId?: string) {
  const m = await request('requestData', { query: { selectionId, ...(roundId ? { parameters: { pipelineRoundId: roundId } } : {}) } })
  const d = m.data ?? m.payload
  if (!d?.orders) throw Error('invalid_projection')
  return d
}
export async function act(actionKey: string, input: ActionInput) {
  const m = await request('executeAction', { actionKey, input, targetId: input.caseId })
  if (!m.result?.data?.caseId) throw Error('invalid_receipt')
  return m.result.data.caseId
}
export const navigate = (payload: WorkbenchNavigationOpenPayload) =>
  request('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload })
