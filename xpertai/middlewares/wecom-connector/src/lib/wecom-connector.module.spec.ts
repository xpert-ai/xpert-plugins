import 'reflect-metadata'
import { WeComCliBootstrapService } from './wecom-cli-bootstrap.service.js'
import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WeComConnectorPluginModule } from './wecom-connector.module.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => {
  const { Module } = jest.requireActual('@nestjs/common') as typeof import('@nestjs/common')
  return {
    AgentMiddlewareStrategy: () => () => undefined,
    ConnectorRuntimeCapability: { id: 'platform.connector' },
    IntegrationStrategyKey: () => () => undefined,
    ConnectorStrategyKey: () => () => undefined,
    XpertServerPlugin: (metadata: Parameters<typeof Module>[0]) => Module(metadata)
  }
})

describe('WeComConnectorPluginModule', () => {
  it('registers the CLI bootstrap, system integration, connector strategy, and runtime', () => {
    const providers = Reflect.getMetadata('providers', WeComConnectorPluginModule) as unknown[]
    expect(providers).toContain(WeComCliBootstrapService)
    expect(providers).toContain(WeComAuthIntegrationStrategy)
    expect(providers).toContain(WeComConnectorStrategy)
    expect(providers).toContain(WeComConnectorRuntimeMiddleware)
  })
})
