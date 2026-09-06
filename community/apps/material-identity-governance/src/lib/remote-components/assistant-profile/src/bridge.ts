import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type { MaterialProfileData, ProfileDecision } from '../../../profile-contracts'
import type { ViewQuery, ActionReceipt } from '../../../contracts'
interface Init { locale?: string; active?: boolean; manifest?: { key: string }; initialQuery?: ViewQuery; debug?: { enabled: boolean }; theme?: { mode?: string; density?: 'default' | 'compact'; tokens?: { [key: string]: string } } }
interface Reply { type: string; channel: string; protocolVersion: number; instanceId: string; requestId?: string; data?: MaterialProfileData; result?: { success: boolean; code?: string; data?: ActionReceipt }; message?: string; active?: boolean }
type HostMessage = Reply & Init
const CHANNEL = 'xpertai.remote_component'
let instanceId = '', sequence = 0, debugEnabled = false
const pending = new Map<string, { resolve: (message: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const log = (event: string) => { if (debugEnabled) console.debug('[material-profile]', event) }
function theme(value: Init['theme']) {
  if (!value) return
  document.documentElement.classList.toggle('dark', value.mode === 'dark')
  for (const [key, color] of Object.entries(value.tokens ?? {})) document.documentElement.style.setProperty(key.startsWith('--xui-') ? key : '--xui-' + key.replace(/[A-Z]/g, match => '-' + match.toLowerCase()), color)
  installShadcnThemeVars({ density: value.density ?? 'compact' })
}
export function startProfileBridge(init: (value: Init) => void, active: (value: boolean) => void) {
  const handler = (event: MessageEvent<HostMessage>) => {
    const message = event.data
    if (event.source !== parent || !message || message.channel !== CHANNEL || message.protocolVersion !== 1) return
    if (message.type === 'init') { instanceId = message.instanceId; debugEnabled = message.debug?.enabled === true; theme(message.theme); log('initialized'); init(message); return }
    if (message.instanceId !== instanceId) return
    if (message.type === 'viewActive') { active(message.active !== false); return }
    if (message.type === 'theme' || message.type === 'themeChanged') { theme(message.theme); return }
    const entry = message.requestId && pending.get(message.requestId)
    if (entry && message.requestId) { clearTimeout(entry.timer); pending.delete(message.requestId); message.type === 'error' ? entry.reject(new Error(message.message ?? 'request_failed')) : entry.resolve(message) }
  }
  window.addEventListener('message', handler)
  parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')
  return () => { window.removeEventListener('message', handler); for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('view_disposed')) }; pending.clear(); instanceId = '' }
}
function request(type: string, body: { query?: ViewQuery; actionKey?: string; input?: ProfileDecision; commandKey?: string; payload?: { busy?: boolean; target?: string; viewKey?: string; selectionId?: string } }) {
  const requestId = String(++sequence)
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('request_timeout')) }, 60000)
    pending.set(requestId, { resolve, reject, timer })
    log(type)
    parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, requestId, type, ...body }, '*')
  })
}
export async function loadProfile(query: ViewQuery) {
  const result = await request('requestData', { query })
  if (!result.data?.items || !result.data.role) throw new Error('invalid_projection')
  return result.data
}
export async function decide(input: ProfileDecision) {
  const result = await request('executeAction', { actionKey: 'decide_proposal', input })
  if (!result.result?.success) throw new Error(result.result?.data?.code ?? result.result?.code ?? 'action_failed')
  return result.result.data
}
export async function command(commandKey: string, payload: { busy?: boolean; target?: string; viewKey?: string; selectionId?: string } = {}) {
  const result = await request('invokeClientCommand', { commandKey, payload })
  if (!result.result?.success) throw new Error(result.result?.code ?? 'command_failed')
}
