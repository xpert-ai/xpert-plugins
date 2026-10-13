import { z } from 'zod/v3'
import type { AssistantComposerAppendReferencesPayload } from '@xpert-ai/contracts'
import { mapResultSchema, mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema, type MapDetailInput, type MapRouteInput, type MapSearchInput, type MapViewportInput } from '../../src/lib/contracts'
import { mapViewDataSchema } from '../../src/lib/view-contracts'
import { createI18n, normalizeLocale } from '../i18n'
import { MapsTransportError, type MapsTransport } from './types'

// Use the public command literal under its exported type without importing the server contract barrel into the sandbox.
const ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND: typeof import('@xpert-ai/contracts').ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND = 'assistant.composer.append_references'
const channel = 'xpertai.remote_component'
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const querySchema = z.object({ parameters: z.record(z.union([scalar, z.array(scalar)])).optional(), selectionId: z.string().optional() })
const envelopeSchema = z.object({
  channel: z.literal(channel), protocolVersion: z.literal(1), type: z.string(), instanceId: z.string().optional(), requestId: z.string().optional(),
  locale: z.string().optional(), scopeRevision: z.number().optional(), initialQuery: querySchema.optional(),
  theme: z.object({ mode: z.enum(['light', 'dark']).optional(), density: z.enum(['default', 'compact']).optional(), tokens: z.record(z.string()).optional() }).optional(),
  debug: z.object({ enabled: z.boolean().optional(), production: z.boolean().optional() }).optional(),
  manifest: z.object({ clientCommands: z.array(z.object({ key: z.string() })).optional() }).optional(),
  data: z.object({ item: mapViewDataSchema.optional() }).optional(),
  result: z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: mapResultSchema.optional(), status: z.string().optional(), focused: z.boolean().optional() }),
    z.object({ success: z.literal(false), data: z.object({ code: z.string() }).optional() })
  ]).optional(),
  event: z.object({ type: z.string(), toolName: z.string().optional(), toolCallId: z.string().optional(), data: z.object({ status: z.string().optional(), argsPreview: z.string().max(8000).optional(), toolInput: z.union([mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema]).optional(), toolResult: z.object({ structuredContent: mapResultSchema.optional(), isError: z.boolean().optional() }).optional() }).optional() }).optional()
})
type Envelope = z.infer<typeof envelopeSchema>
type Query = z.infer<typeof querySchema>
type RequestBody = { query: Query } | { actionKey: string; input: MapSearchInput | MapDetailInput | MapRouteInput | MapViewportInput } | { commandKey: typeof ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND; payload: AssistantComposerAppendReferencesPayload }
type Pending = { resolve: (message: Envelope) => void; reject: (error: Error) => void; dispose: () => void }

export function createWorkbenchTransport(): MapsTransport {
  let instanceId: string | undefined, initialized = false, debug = false, locale = 'en-US', currentQuery: Query = {}, queryIdentity = '', scopeRevision: number | undefined
  let callbacks: Parameters<MapsTransport['connect']>[0] | undefined
  let initResolve: (() => void) | undefined, initReject: ((error: Error) => void) | undefined, initTimer: ReturnType<typeof setTimeout> | undefined
  let queryController: AbortController | undefined
  const pending = new Map<string, Pending>()
  const completedTools = new Set<string>()
  const trace = (message: string) => { if (debug) console.debug('[Maps view]', message) }
  const post = (type: string, body: object = {}, requestId?: string) => window.parent.postMessage({ channel, protocolVersion: 1, instanceId, type, ...(requestId ? { requestId } : {}), ...body }, '*')
  function request(type: string, body: RequestBody, signal?: AbortSignal): Promise<Envelope> {
    if (!instanceId || signal?.aborted) return Promise.reject(new MapsTransportError('unavailable'))
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const remove = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); pending.delete(requestId) }
      const abort = () => { remove(); reject(new DOMException('Map request cancelled', 'AbortError')) }
      const timeout = setTimeout(() => { remove(); reject(new MapsTransportError('failed')) }, 30000)
      pending.set(requestId, { resolve, reject, dispose: remove }); signal?.addEventListener('abort', abort, { once: true })
      trace(type); post(type, body, requestId)
    })
  }
  async function load() {
    queryController?.abort(); const controller = new AbortController(); queryController = controller
    try {
      const response = await request('requestData', { query: currentQuery }, controller.signal)
      if (controller.signal.aborted || response.type !== 'data' || !response.data?.item) return
      const data = response.data.item
      callbacks?.onService({ provider: data.provider, mode: data.mode })
      if (data.result) callbacks?.onResult({ result: data.result, search: data.search })
    } catch { if (!controller.signal.aborted) callbacks?.onError() }
  }
  function handle(event: MessageEvent) {
    if (event.source !== window.parent) return
    const parsed = envelopeSchema.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init' && message.instanceId) {
      if (instanceId && message.instanceId !== instanceId) return
      const nextIdentity = JSON.stringify(message.initialQuery ?? {})
      const changedScope = initialized && scopeRevision !== message.scopeRevision
      instanceId = message.instanceId; scopeRevision = message.scopeRevision
      locale = message.locale ?? 'en-US'; debug = message.debug?.enabled === true
      if (changedScope) { completedTools.clear(); callbacks?.onReset() }
      callbacks?.onContext({ locale, theme: { source: 'workbench', scheme: message.theme?.mode ?? 'light', density: message.theme?.density, tokens: message.theme?.tokens }, canReference: message.manifest?.clientCommands?.some(command => command.key === ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND) ?? false })
      if (!initialized || queryIdentity !== nextIdentity || changedScope) { currentQuery = message.initialQuery ?? {}; queryIdentity = nextIdentity; void load() }
      initialized = true; clearTimeout(initTimer); initResolve?.(); initResolve = undefined
      post('resize', { height: 720, viewportBound: true }); trace('initialized'); return
    }
    if (!instanceId || message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      if (message.event?.type === 'view.context.changed') { completedTools.clear(); callbacks?.onReset(); currentQuery = {}; queryIdentity = ''; void load() }
      const toolEvent = message.event
      if (toolEvent?.type === 'assistant.tool.completed' && (!toolEvent.toolCallId || !completedTools.has(toolEvent.toolCallId))) {
        const data = toolEvent.data
        if (!data || (data.status && data.status !== 'success') || data.toolResult?.isError) return
        const operation = toolEvent.toolName === 'maps_search' ? 'search' : toolEvent.toolName === 'maps_detail' ? 'detail' : toolEvent.toolName === 'maps_route' ? 'route' : undefined
        const schema = operation === 'search' ? mapSearchInputSchema : operation === 'detail' ? mapDetailInputSchema : operation === 'route' ? mapRouteInputSchema : undefined
        if (!schema || !operation) return
        try {
          const input = schema.safeParse(data.toolInput ?? (data.argsPreview ? JSON.parse(data.argsPreview) : undefined))
          const result = data.toolResult?.structuredContent
          const matchesResult = result?.kind === (operation === 'search' ? 'places' : operation === 'detail' ? 'place' : 'route')
          if (!input.success && !matchesResult) return
          if (toolEvent.toolCallId) { completedTools.add(toolEvent.toolCallId); if (completedTools.size > 100) completedTools.delete(completedTools.values().next().value ?? '') }
          if (input.success) currentQuery = { parameters: { operation, inputJson: JSON.stringify(input.data) } }
          if (result && matchesResult) {
            queryController?.abort()
            callbacks?.onService({ provider: result.provider, mode: result.mode })
            const search = operation === 'search' && input.success ? mapSearchInputSchema.safeParse(input.data) : undefined
            callbacks?.onResult({ result, ...(search?.success ? { search: search.data } : {}) })
          } else void load()
        } catch { trace('ignored incomplete tool arguments') }
      }
      return
    }
    const waiting = message.requestId ? pending.get(message.requestId) : undefined
    if (!waiting) return
    waiting.dispose()
    if (message.type === 'error') waiting.reject(new MapsTransportError('failed'))
    else waiting.resolve(message)
  }
  async function action(actionKey: string, input: MapSearchInput | MapDetailInput | MapRouteInput | MapViewportInput, signal: AbortSignal) {
    const response = await request('executeAction', { actionKey, input }, signal)
    if (response.type !== 'actionResult' || !response.result?.success || !response.result.data) throw new MapsTransportError('failed')
    return response.result.data
  }
  return {
    surface: 'workbench',
    connect(value) {
      callbacks = value
      return new Promise<void>((resolve, reject) => { initResolve = resolve; initReject = reject; window.addEventListener('message', handle); initTimer = setTimeout(() => reject(new MapsTransportError('unavailable')), 15000); post('ready') })
    },
    async search(input, signal) { const result = await action('maps.search', input, signal); if (result.kind !== 'places') throw new MapsTransportError('failed'); return result },
    async detail(input, signal) { const result = await action('maps.detail', input, signal); if (result.kind !== 'place') throw new MapsTransportError('failed'); return result },
    async route(input, signal) { const result = await action('maps.route', input, signal); if (result.kind !== 'route') throw new MapsTransportError('failed'); return result },
    async render(input, signal) { const result = await action('maps.render', input, signal); if (result.kind !== 'viewport') throw new MapsTransportError('failed'); return result },
    async reference(place, result) {
      const { t } = createI18n(normalizeLocale(locale))
      const source = `${t(result.provider === 'amap' ? 'provider.amap' : 'provider.tencent')} · ${t(result.mode === 'demo' ? 'mode.demo' : 'mode.live')}`
      const payload: AssistantComposerAppendReferencesPayload = { references: [{ type: 'quote', label: place.name, source, text: `${place.name}\n${place.address}\n${place.location.lng}, ${place.location.lat}\n${source}` }] }
      const response = await request('invokeClientCommand', { commandKey: ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND, payload })
      if (response.type !== 'clientCommandResult' || !response.result?.success) throw new MapsTransportError('referenceUnavailable')
    },
    dispose() {
      queryController?.abort(); clearTimeout(initTimer); window.removeEventListener('message', handle)
      initReject?.(new MapsTransportError('unavailable'))
      for (const entry of pending.values()) { entry.dispose(); entry.reject(new MapsTransportError('unavailable')) }
      pending.clear(); callbacks = undefined
    }
  }
}
