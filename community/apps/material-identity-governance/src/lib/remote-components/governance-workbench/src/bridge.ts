import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type {
  ActionInput,
  ActionReceipt,
  ViewQuery,
  WorkbenchData,
} from '../../../contracts'

interface Theme {
  mode?: 'light' | 'dark'
  density?: 'default' | 'compact'
  tokens?: { [key: string]: string }
}
export interface HostInit {
  locale?: string
  theme?: Theme
  initialQuery?: ViewQuery
  manifest?: { key: string }
  debug?: { enabled: boolean }
}
interface Response {
  data?: WorkbenchData
  payload?: WorkbenchData
  result?: ActionReceipt & { data?: ActionReceipt; message?: string }
  success?: boolean
  message?: string
  code?: string
}
interface HostMessage extends HostInit, Response {
  channel: string
  protocolVersion: number
  instanceId: string
  type: string
  requestId?: string
  event?: { data?: { output?: { caseId?: string } } }
}
interface CommandPayload {
  target: string
  viewKey?: string
  selectionId?: string
  parameters?: { surface?: string; nodeKey?: string }
  conversationId?: string
  threadId?: string
  executionId?: string
}
type RequestBody = {
  query?: ViewQuery
  actionKey?: string
  targetId?: string
  input?: ActionInput
  commandKey?: string
  payload?: CommandPayload
}
const CHANNEL = 'xpertai.remote_component'
let instanceId: string | null = null
let sequence = 0
let debugEnabled = false
const pending = new Map<
  string,
  {
    resolve: (value: Response) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()
export function debug(
  event: string,
  data: { operation?: string; requestId?: string; success?: boolean } = {},
) {
  if (debugEnabled) console.debug('[material-identity]', event, data)
}
function applyTheme(theme?: Theme) {
  if (!theme) return
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [key, value] of Object.entries(theme.tokens ?? {})) {
    const css = key.startsWith('--xui-')
      ? key
      : '--xui-' + key.replace(/[A-Z]/g, (x) => '-' + x.toLowerCase())
    document.documentElement.style.setProperty(css, value)
  }
  installShadcnThemeVars({ density: theme.density ?? 'default' })
}
export function startBridge(
  init: (value: HostInit) => void,
  changed: () => void,
) {
  const onMessage = (event: MessageEvent<HostMessage>) => {
    if (
      event.source !== window.parent ||
      !event.data ||
      event.data.channel !== CHANNEL ||
      event.data.protocolVersion !== 1
    )
      return
    const message = event.data
    if (message.type === 'init') {
      instanceId = message.instanceId
      debugEnabled = message.debug?.enabled === true
      applyTheme(message.theme)
      init(message)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged') {
      applyTheme(message.theme)
      return
    }
    if (message.type === 'hostEvent') {
      debug('host-event.received')
      changed()
      return
    }
    const request = message.requestId
      ? pending.get(message.requestId)
      : undefined
    if (request && message.requestId) {
      pending.delete(message.requestId)
      clearTimeout(request.timer)
      message.type === 'error'
        ? request.reject(new Error(message.message ?? 'request_failed'))
        : request.resolve(message)
    }
  }
  window.addEventListener('message', onMessage)
  window.parent.postMessage(
    { channel: CHANNEL, protocolVersion: 1, type: 'ready' },
    '*',
  )
  return () => {
    window.removeEventListener('message', onMessage)
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('view_disposed'))
    }
    pending.clear()
  }
}
function request(type: string, body: RequestBody) {
  const requestId = String(++sequence)
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('request_timeout'))
    }, 60000)
    pending.set(requestId, { resolve, reject, timer })
    debug('request.started', { operation: type, requestId })
    window.parent.postMessage(
      {
        channel: CHANNEL,
        protocolVersion: 1,
        instanceId,
        type,
        requestId,
        ...body,
      },
      '*',
    )
  })
}
export async function requestData(query: ViewQuery): Promise<WorkbenchData> {
  const response = await request('requestData', { query })
  const data = response.data ?? response.payload
  if (!data?.table || !data.dashboard) throw new Error('invalid_projection')
  return data
}
export async function executeAction(actionKey: string, input: ActionInput) {
  const response = await request('executeAction', {
    actionKey,
    input,
    targetId: input.caseId,
  })
  const receipt = response.result
  if (!receipt?.success)
    throw new Error(
      receipt?.data?.code ??
        receipt?.code ??
        response.message ??
        'action_failed',
    )
  return receipt.data ?? receipt
}
export async function navigate(payload: CommandPayload) {
  const r = await request('invokeClientCommand', {
    commandKey: 'workbench.navigation.open',
    payload,
  })
  if (r.result?.success === false || r.success === false)
    throw new Error(r.result?.code ?? r.code ?? 'navigation_failed')
}
