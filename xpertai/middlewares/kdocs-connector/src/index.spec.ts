import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin, { KDOCS_PLUGIN_LEVEL } from './index.js'
import { KDOCS_ICON, KDOCS_LOGO_DATA_URL } from './lib/branding.js'
import { KdocsConnectorRuntimeMiddleware } from './lib/kdocs-connector-runtime.middleware.js'
import { KdocsConnectorStrategy } from './lib/kdocs-connector.strategy.js'
import { KdocsSkillHubAuthClient } from './lib/kdocs-skillhub-auth.client.js'
import { KdocsMcpClient } from './lib/mcp/kdocs-mcp.client.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  XpertServerPlugin: () => (target: object) => target,
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))

describe('WPS Docs connector plugin metadata', () => {
  it('keeps runtime and package installation metadata aligned', () => {
    const packageJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')) as {
      name: string
      version: string
      xpert: { plugin: { level: string } }
    }

    expect(plugin.meta.name).toBe(packageJson.name)
    expect(plugin.meta.version).toBe(packageJson.version)
    expect(plugin.meta.level).toBe(KDOCS_PLUGIN_LEVEL)
    expect(plugin.meta.artifactNamespace).toBeUndefined()
    expect(packageJson.xpert.plugin).toEqual({ level: KDOCS_PLUGIN_LEVEL })
  })

  it('uses the uploaded WPS Docs logo on every connector surface', () => {
    expect(KDOCS_LOGO_DATA_URL).toMatch(/^data:image\/png;base64,/)
    expect(plugin.meta.icon).toEqual(KDOCS_ICON)
    expect(new KdocsConnectorStrategy(new KdocsSkillHubAuthClient()).definition.icon).toEqual(KDOCS_ICON)
    expect(new KdocsConnectorRuntimeMiddleware(new KdocsMcpClient()).meta.icon).toEqual(KDOCS_ICON)
  })
})
