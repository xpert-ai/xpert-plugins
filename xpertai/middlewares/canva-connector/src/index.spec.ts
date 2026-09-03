jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  IntegrationStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
jest.mock('@langchain/core/tools', () => ({ tool: (handler: object, config: object) => ({ ...config, invoke: handler }) }))

import plugin from './index.js'
import { CANVA_ICON } from './lib/branding.js'
import { CANVA_ARTIFACT_NAMESPACE, CANVA_PLUGIN_LEVEL } from './lib/constants.js'
import { CanvaConnectIntegrationStrategy } from './lib/canva-connect-integration.strategy.js'
import { CanvaConnectorStrategy } from './lib/canva-connector.strategy.js'
import { CanvaMcpIntegrationStrategy } from './lib/canva-mcp-integration.strategy.js'
import { CanvaConnectorRuntimeMiddleware } from './lib/middlewares/canva-connector-runtime.middleware.js'
import { CanvaConfirmationStore } from './lib/tools/confirmation-store.js'

describe('Canva connector plugin', () => {
  it('keeps package metadata, namespace and organization level aligned', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-canva-connector',
      version: '0.1.0',
      level: 'organization',
      artifactNamespace: CANVA_ARTIFACT_NAMESPACE,
      category: 'middleware',
      icon: CANVA_ICON
    })
    expect(CANVA_PLUGIN_LEVEL).toBe('organization')
  })

  it('embeds the transparent Canva logo as the shared icon definition', () => {
    expect(CANVA_ICON).toMatchObject({
      type: 'image',
      size: 32,
      alt: 'Canva 可画'
    })
    expect(CANVA_ICON.value).toMatch(/^data:image\/png;base64,/)
    expect(Buffer.from(CANVA_ICON.value.split(',')[1], 'base64').subarray(0, 8)).toEqual(
      Buffer.from('\x89PNG\r\n\x1a\n', 'binary')
    )
  })

  it('declares only the user-scoped MCP System Integration auth method', () => {
    const strategy = new CanvaConnectorStrategy({} as never, {} as never, { resolve: jest.fn() } as never)
    const definition = strategy.definition as unknown as {
      connectionScope?: string
      authMethods: Array<{
        id: string
        hidden?: boolean
        appCredentials?: { fields?: Array<{ name: string; type: string; provider: string; required: boolean }> }
      }>
    }
    expect(definition.connectionScope).toBe('user')
    expect(definition.authMethods.map((method) => method.id)).toEqual(['mcp-oauth-cn'])
    expect(definition.authMethods[0].hidden).not.toBe(true)
    expect(definition.authMethods[0].appCredentials).toBeUndefined()
  })

  it('shows the MCP System Integration and hides the legacy REST provider', () => {
    expect(new CanvaMcpIntegrationStrategy().meta.hidden).toBe(false)
    expect(new CanvaConnectIntegrationStrategy().meta.hidden).toBe(true)
  })

  it('binds confirmations to user, connector, operation and payload', () => {
    const store = new CanvaConfirmationStore()
    const input = { userId: 'user-1', connectorId: 'connector-1', operation: 'export_design', payload: { designId: 'design-1', format: 'png' } }
    const pending = store.request(input)
    expect(pending.confirmationRequired).toBe(true)
    expect(() => store.consume({ ...input, handle: pending.confirmationHandle })).not.toThrow()
    expect(() => store.consume({ ...input, handle: pending.confirmationHandle })).toThrow('invalid')
  })

  it('does not expose the global candidate creation tool for Canva China MCP', () => {
    const middleware = new CanvaConnectorRuntimeMiddleware({} as never, new CanvaConfirmationStore())
    const runtime = middleware.createMiddleware({}, { runtime: {} } as never)
    const names = runtime.tools?.map((tool) => tool.name)

    expect(names).toContain('canva_generate_design')
    expect(names).not.toContain('canva_create_design_from_candidate')
  })
})
