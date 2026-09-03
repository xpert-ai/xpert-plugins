jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))

import plugin from './index.js'
import { ZSXQ_ICON } from './lib/branding.js'
import { ZSXQ_ARTIFACT_NAMESPACE, ZSXQ_PLUGIN_LEVEL } from './lib/constants.js'

describe('Knowledge Planet connector plugin', () => {
  it('keeps package and runtime metadata aligned', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-zsxq-connector',
      version: '0.1.0',
      level: 'organization',
      artifactNamespace: ZSXQ_ARTIFACT_NAMESPACE,
      category: 'middleware',
      icon: ZSXQ_ICON
    })
    expect(ZSXQ_PLUGIN_LEVEL).toBe('organization')
  })

  it('declares the integration permission while keeping writes opt-in at runtime', () => {
    expect(plugin.permissions).toEqual([{ type: 'integration', service: 'zsxq', operations: ['read', 'write'] }])
  })

  it('uses a static inline icon without remote content', () => {
    expect(ZSXQ_ICON).toMatchObject({ type: 'svg', alt: 'Knowledge Planet' })
    expect(ZSXQ_ICON.value).toContain('<svg')
    expect(ZSXQ_ICON.value).not.toMatch(/(?:href|src)=['"]https?:/i)
  })
})
