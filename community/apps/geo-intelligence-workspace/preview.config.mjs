import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
process.env.GEO_TENANT_ID = 'demo-tenant'
process.env.GEO_ORGANIZATION_ID = 'demo-hospital'
const { GeoViewProvider } = require('./dist/lib/geo-view.provider.js')
const { GeoEngineClient } = require('./dist/lib/geo.service.js')
const provider = new GeoViewProvider(new GeoEngineClient())
const context = { hostType: 'agent', hostId: 'geo-preview', tenantId: 'demo-tenant', organizationId: 'demo-hospital', userId: 'demo-editor' }

export default {
  title: 'GEO 工作台开发预览（非 Xpert 平台验收）',
  workspaceRoot: root,
  component: { root: join(root, 'dist/lib/remote-components/geo-intelligence') },
  instanceId: 'geo-preview',
  hostContext: { locale: 'zh-Hans', manifest: provider.getViewManifests(context, 'agent.workbench.main')[0], initialQuery: {} },
  state: {},
  async handleRequest(message) {
    if (message.type === 'requestData') return { data: await provider.getViewData(context, 'workbench', message.query || {}) }
    if (message.type === 'executeAction') return { result: await provider.executeViewAction(context, 'workbench', message.actionKey, { input: message.input || {} }) }
    throw new Error('Unsupported preview request')
  }
}
