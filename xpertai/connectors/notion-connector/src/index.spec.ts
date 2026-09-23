import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin, { NOTION_ICON, NOTION_PLUGIN_LEVEL } from './index.js'
import { NotionIntegrationStrategy } from './lib/notion-integration.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  XpertServerPlugin: () => (target: object) => target,
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  IntegrationStrategyKey: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))

describe('Notion connector plugin metadata', () => {
  it('keeps runtime and package metadata aligned', () => {
    const packageJson = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
    ) as {
      name: string
      version: string
      xpert: { plugin: { level: string } }
    }

    expect(plugin.meta.name).toBe(packageJson.name)
    expect(plugin.meta.version).toBe(packageJson.version)
    expect(plugin.meta.level).toBe(NOTION_PLUGIN_LEVEL)
    expect(plugin.meta.artifactNamespace).toBeUndefined()
    expect(packageJson.xpert.plugin).toEqual({ level: NOTION_PLUGIN_LEVEL })
  })

  it('declares one Public OAuth method and read permission', () => {
    const strategy = plugin
    expect(strategy.permissions).toEqual([{ type: 'integration', service: 'notion', operations: ['read'] }])
  })

  it('uses the uploaded image for connector and system integration surfaces', () => {
    expect(plugin.meta.icon).toEqual(
      expect.objectContaining({
        type: 'image',
        size: 32,
        value: expect.stringMatching(/^data:image\/svg\+xml;base64,/)
      })
    )
    expect(new NotionIntegrationStrategy().meta.icon).toEqual(NOTION_ICON)
  })
})
