import { z } from 'zod'
import { assessmentSchema, categories, priorities, nextSteps, statuses, type Demand, type Page } from '../domain.js'
import { localeOf, type Locale } from './i18n.js'
import { applyHostTheme } from './theme.js'

const demandSchema = z.object({
 id: z.string(), customer: z.string(), title: z.string(), source: z.string(), status: z.enum(statuses), revision: z.number(),
 assessment: assessmentSchema.nullable(), decision: z.object({ category: z.enum(categories), priority: z.enum(priorities), nextStep: z.enum(nextSteps), note: z.string(), confirmedAt: z.string(), confirmedBy: z.string() }).nullable(),
 attempts: z.array(z.object({ id: z.string(), startedAt: z.string(), finishedAt: z.string().optional(), status: z.enum(['running', 'succeeded', 'failed']), errorCode: z.string().optional() })),
 errorCode: z.string().nullable(), createdAt: z.string(), updatedAt: z.string()
})
const pageSchema = z.object({ items: z.array(demandSchema), item: demandSchema.optional(), total: z.number(), meta: z.object({ page: z.number(), pageSize: z.number() }).optional() })
const actionSchema = z.object({ success: z.boolean(), data: z.union([demandSchema, z.object({ errorCode: z.string() })]).optional() })
const resultSchema = z.union([actionSchema, pageSchema])
const themeSchema = z.object({ mode: z.string().optional(), density: z.string().optional(), variables: z.record(z.string()).optional(), tokens: z.record(z.string()).optional() }).passthrough()
// Parse the transport envelope first. Host events carry an event payload rather than
// page/action data, so response bodies are validated only by the gateway method that
// requested them.
const messageSchema = z.object({
 channel: z.literal('xpertai.remote_component'), protocolVersion: z.literal(1), type: z.string(), instanceId: z.string().nullable().optional(), requestId: z.string().optional(),
 data: z.unknown().optional(), result: z.unknown().optional(), payload: z.unknown().optional(), message: z.string().optional(),
 locale: z.string().optional(), theme: themeSchema.optional(), initialQuery: z.object({ selectionId: z.string().optional() }).optional()
})
type Reply = z.infer<typeof messageSchema>
const pending = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
let instanceId: string | null = null
let hostOrigin = '*'
let sequence = 0
function post(type: string, body: object = {}) {
 parent.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, type, ...body }, hostOrigin)
}
function request(type: string, body: object): Promise<Reply> {
 const requestId = String(++sequence)
 return new Promise((resolve, reject) => {
  const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('bridge_timeout')) }, 65000)
  pending.set(requestId, { resolve, reject, timer }); post(type, { ...body, requestId })
 })
}
export function connect(onInit: (locale: Locale, selectionId?: string) => void, onRefresh: () => void) {
 const receive = (event: MessageEvent) => {
  if (event.source !== parent) return
  const parsed = messageSchema.safeParse(event.data)
  if (!parsed.success) return
  const message = parsed.data
  if (message.type === 'init' && message.instanceId) {
   instanceId = message.instanceId; hostOrigin = event.origin === 'null' ? '*' : event.origin
   const locale = localeOf(message.locale); document.documentElement.lang = locale
   applyHostTheme(message.theme)
   onInit(locale, message.initialQuery?.selectionId); return
  }
  if (message.instanceId !== instanceId) return
  if (message.type === 'hostEvent' || message.type === 'refresh') { onRefresh(); return }
  const waiting = message.requestId && pending.get(message.requestId)
  if (waiting && message.requestId) {
   pending.delete(message.requestId); clearTimeout(waiting.timer)
   if (message.type === 'error') waiting.reject(new Error('operation_failed')); else waiting.resolve(message)
  }
 }
 window.addEventListener('message', receive); post('ready')
 return () => { window.removeEventListener('message', receive); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('operation_failed')) }; pending.clear() }
}
export const gateway = {
 async list(query: { page: number; pageSize: number; search: string; selectionId?: string; parameters?: { status: string } }): Promise<Page> {
  const response = await request('requestData', { query })
  const value = pageSchema.parse(response.data ?? response.result ?? response.payload)
  return { records: value.items, selected: value.item ?? null, total: value.total, page: value.meta?.page ?? query.page, pageSize: value.meta?.pageSize ?? query.pageSize }
 },
 async action(actionKey: 'create' | 'edit' | 'evaluate' | 'confirm', targetId: string | undefined, input: object = {}): Promise<Demand> {
  const response = await request('executeAction', { actionKey, targetId, input })
  const value = actionSchema.parse(response.data ?? response.result ?? response.payload)
  if (!value.success) throw new Error(value.data && 'errorCode' in value.data ? value.data.errorCode ?? 'operation_failed' : 'operation_failed')
  return demandSchema.parse(value.data)
 }
}
