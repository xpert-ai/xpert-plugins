import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod/v3'
import { DemoMapProvider } from '../../../../dist/lib/mock-provider.js'
import { mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema, mapViewportInputSchema } from '../../../../dist/lib/contracts.js'
import { mapViewDataSchema, mapViewQuerySchema } from '../../../../dist/lib/view-contracts.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const referenceSchema = z.object({ type: z.literal('quote'), label: z.string(), source: z.string(), text: z.string() })
const actionSchema = z.discriminatedUnion('actionKey', [
  z.object({ actionKey: z.literal('maps.search'), input: mapSearchInputSchema }),
  z.object({ actionKey: z.literal('maps.detail'), input: mapDetailInputSchema }),
  z.object({ actionKey: z.literal('maps.route'), input: mapRouteInputSchema }),
  z.object({ actionKey: z.literal('maps.render'), input: mapViewportInputSchema })
])
const requestSchema = z.union([
  z.object({ type: z.literal('requestData'), query: z.object({ parameters: mapViewQuerySchema.optional() }).optional() }),
  z.object({ type: z.literal('executeAction') }).and(actionSchema),
  z.object({ type: z.literal('invokeClientCommand'), commandKey: z.literal('assistant.composer.append_references'), payload: z.object({ references: z.array(referenceSchema) }) })
])
/** @typedef {import('zod/v3').infer<typeof requestSchema>} PreviewRequest */
/** @typedef {import('zod/v3').infer<typeof actionSchema>} PreviewAction */
/** @typedef {{provider:'amap'|'tencent', requests: PreviewRequest[], references: import('zod/v3').infer<typeof referenceSchema>[], sentMessages: string[], failNextAction: boolean, delayMs: number, delayQuery: string, completedQueries: string[], emptyQuery: string}} PreviewState */
/** @type {PreviewState} */
const state = { provider: 'amap', requests: [], references: [], sentMessages: [], failNextAction: false, delayMs: 0, delayQuery: '', completedQueries: [], emptyQuery: '' }

/** @param {PreviewAction} action @param {PreviewState} state */
async function execute(action, state) {
  const provider = new DemoMapProvider(state.provider)
  if (action.actionKey === 'maps.search') {
    const delayMs = action.input.query === state.delayQuery ? state.delayMs : 0
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
    const result = await provider.search(action.input)
    state.completedQueries.push(action.input.query)
    return action.input.query === state.emptyQuery ? { ...result, places: [], hasMore: false } : result
  }
  if (action.actionKey === 'maps.detail') return provider.detail(action.input)
  if (action.actionKey === 'maps.route') return provider.route(action.input)
  return provider.render(action.input)
}

export default {
  title: 'Maps · Remote View Preview',
  workspaceRoot: packageRoot,
  instanceId: 'maps-preview',
  component: { root: resolve(packageRoot, 'dist/lib/remote-components/maps-workbench'), sandbox: 'allow-scripts', viewportBound: true },
  hostContext: {
    manifest: { key: 'maps_workbench', clientCommands: [{ key: 'assistant.composer.append_references' }] },
    initialQuery: { parameters: { operation: 'search', inputJson: JSON.stringify({ query: '西溪附近咖啡馆', city: '杭州' }) } },
    locale: 'zh-Hans', scopeRevision: 1,
    theme: { mode: 'light', tokens: { colorBackground: '#ffffff', colorForeground: '#202126', colorBorder: '#dce1e7', colorInput: '#dce1e7', colorRing: '#527de8' } },
    debug: { enabled: false, production: true }
  },
  state,
  /** @param {PreviewRequest} raw @param {{state:PreviewState}} context */
  async handleRequest(raw, { state }) {
    const message = requestSchema.parse(raw)
    state.requests.push(message)
    if (message.type === 'requestData') {
      const query = message.query?.parameters
      if (!query?.operation || !query.inputJson) return { type: 'data', data: { item: mapViewDataSchema.parse({ kind: 'maps-view', provider: state.provider, mode: 'demo' }) } }
      const action = actionSchema.parse({ actionKey: `maps.${query.operation}`, input: JSON.parse(query.inputJson) })
      const result = await execute(action, state)
      return { type: 'data', data: { item: mapViewDataSchema.parse({ kind: 'maps-view', provider: state.provider, mode: 'demo', result, ...(action.actionKey === 'maps.search' ? { search: action.input } : {}) }) } }
    }
    if (message.type === 'executeAction') {
      if (state.failNextAction && message.actionKey !== 'maps.render') { state.failNextAction = false; return { type: 'actionResult', result: { success: false, data: { code: 'REQUEST_FAILED' } } } }
      return { type: 'actionResult', result: { success: true, data: await execute(message, state) } }
    }
    state.references.push(...message.payload.references)
    return { type: 'clientCommandResult', result: { success: true, status: 'appended', focused: true } }
  }
}
