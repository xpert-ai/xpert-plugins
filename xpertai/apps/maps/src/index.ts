import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { MAPS_ICON, MAPS_LEVEL, MAPS_NAMESPACE } from './lib/constants.js'
import { MapsPluginModule } from './lib/maps.module.js'
import { mapsTemplates } from './lib/maps.templates.js'
import { mapsAppContribution } from './lib/maps.app-config.js'

const metadata = z.object({ name: z.string(), version: z.string() }).parse(
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
)
const config = z.object({}).strict()
const plugin: XpertPlugin = {
  meta: {
    ...metadata, level: MAPS_LEVEL, artifactNamespace: MAPS_NAMESPACE,
    targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-app', 'assistant-template', 'workbench-view', 'assistant-tool'],
      capabilities: ['maps:explorer'],
      marketplace: { contents: [mapsAppContribution] }
    } },
    displayName: 'Maps / 地图', category: 'middleware', icon: MAPS_ICON,
    description: 'Interactive place search and routes with replaceable AMap and Tencent providers.',
    keywords: ['maps', 'amap', 'tencent', 'mcp-app', 'places', 'routes'], author: 'XpertAI Team'
  },
  config: { schema: config },
  templates: mapsTemplates,
  permissions: [
    { type: 'integration', service: 'amap', operations: ['read'] },
    { type: 'integration', service: 'tencent-map', operations: ['read'] }
  ],
  register(context) {
    config.parse(context.config ?? {})
    return { module: MapsPluginModule }
  }
}
export default plugin
export { MapsPluginModule } from './lib/maps.module.js'
export { MapsMiddleware, mapsApp, mapsOptionsSchema } from './lib/maps.middleware.js'
export { MapsViewProvider } from './lib/maps-view.provider.js'
export * from './lib/view-contracts.js'
export * from './lib/contracts.js'
export * from './lib/providers/index.js'
export { DemoMapProvider } from './lib/mock-provider.js'
