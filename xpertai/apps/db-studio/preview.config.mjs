import { resolve } from 'node:path'

const object = { database: 'analytics', engineCatalog: 'internal', name: 'orders', kind: 'table' }
const detail = {
  object, model: 'unique', editable: true, diagnostics: [],
  columns: [
    { id: 'c0', name: 'order_id', dataType: 'BIGINT', nullable: false },
    { id: 'c1', name: 'amount', dataType: 'DECIMAL(20,4)', nullable: true },
    { id: 'c2', name: 'region', dataType: 'VARCHAR(20)', nullable: true }
  ], keys: [{ name: 'PRIMARY', kind: 'primary', columns: ['order_id'] }], definition: 'CREATE TABLE orders (...)'
}
const result = {
  columns: detail.columns,
  rows: Array.from({ length: 24 }, (_, index) => [String(9007199254740993n + BigInt(index)), String((index + 1) * 17.5), ['East', 'West', 'North'][index % 3]]),
  durationMs: 23, hasMore: true, truncated: false, outcome: 'succeeded', diagnostics: []
}

export default {
  title: 'DB Studio · Local Preview',
  workspaceRoot: resolve(new URL('../../../../xpert-pro/', import.meta.url).pathname),
  pluginSdkModule: resolve(new URL('../../../../xpert-pro/packages/plugin-sdk/dist/index.cjs.js', import.meta.url).pathname),
  instanceId: 'db-studio-preview',
  component: { root: resolve(new URL('./src/lib/remote', import.meta.url).pathname), runtime: 'react', title: 'DB Studio' },
  hostContext: {
    manifest: { key: 'db_studio_workbench' }, payload: {}, initialQuery: { page: 1, pageSize: 100, parameters: {} }, locale: 'zh-Hans',
    theme: { mode: 'light', tokens: { colorBackground: '#ffffff', colorForeground: '#18181b', colorCard: '#ffffff', colorCardForeground: '#18181b', colorPopover: '#ffffff', colorPopoverForeground: '#18181b', colorMuted: '#f4f4f5', colorMutedForeground: '#71717a', colorSecondary: '#f4f4f5', colorSecondaryForeground: '#27272a', colorAccent: '#f4f4f5', colorAccentForeground: '#18181b', colorBorder: '#e4e4e7', colorInput: '#e4e4e7', colorPrimary: '#18181b', colorPrimaryForeground: '#fafafa', colorRing: '#a1a1aa', colorSuccess: '#16a34a', colorWarning: '#d97706', radiusMd: '0.5rem' } },
    debug: { enabled: true, production: false }
  },
  state: { saved: [], actions: [], requestDataCount: 0 },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      state.requestDataCount += 1
      const kind = message.query?.parameters?.kind
      const input = JSON.parse(message.query?.parameters?.input ?? '{}')
      if (kind === 'bootstrap') return { data: { summary: { items: [{ id: 'preview-doris', name: 'Preview Doris', engine: 'doris' }], features: ['db-studio-explore', 'db-studio-changes', 'db-studio-transfer'], testReadOnly: false, drafts: [] } } }
      if (kind === 'capabilities') return { data: { item: { engine: 'doris', version: 'doris-3.0.8', query: true, explain: true, transactions: false, cancel: true, import: true, writes: true, nativeReadOnly: false, diagnostics: [], objectKinds: ['table', 'view'] } } }
      if (kind === 'locations') return { data: { item: [{ database: 'analytics', engineCatalog: 'internal' }] } }
      if (kind === 'objects') return { data: { item: { items: [object], page: 1, pageSize: 100, hasMore: false } } }
      if (kind === 'describe') return { data: { item: detail } }
      if (kind === 'policy') return { data: { item: { revision: 0, readOnly: true, objects: [], autoActions: [] } } }
      if (kind === 'list' || ['execution', 'favorite', 'chart', 'dashboard', 'snapshot', 'plan'].includes(kind)) return { data: { items: state.saved.filter((item) => item.kind === kind).map((item) => ({ ...item, summary: item.payload })) } }
      if (kind === 'record') return { data: { item: state.saved.find((item) => item.id === input.id) } }
      return { data: {} }
    }
    if (message.type === 'executeAction') {
      state.actions.push({ actionKey: message.actionKey, input: structuredClone(message.input) })
      if (message.actionKey === 'run_query' || message.actionKey === 'explain') return { result: { success: true, data: { executionId: message.input.executionId, dataSourceId: 'preview-doris', result } } }
      if (message.actionKey === 'save_artifact') {
        const saved = { id: message.input.id ?? crypto.randomUUID(), kind: message.input.kind, title: message.input.title, revision: 1, status: 'saved', updatedAt: '2026-09-15', payload: { target: message.input.target, content: message.input.content } }
        state.saved = state.saved.filter((item) => item.id !== saved.id).concat(saved)
        return { result: { success: true, data: saved } }
      }
      if (message.actionKey === 'set_policy') return { result: { success: true, data: { revision: 1, ...message.input } } }
      return { result: { success: true, data: {} } }
    }
    throw new Error(`Unsupported preview request: ${message.type}`)
  },
  async handleEvent(message, { state }) { state.lastEvent = structuredClone(message); return {} }
}
