import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin, { KDOCS_PLUGIN_LEVEL } from './index.js'

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
})
