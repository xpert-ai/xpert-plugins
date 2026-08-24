import 'reflect-metadata'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WeComConnectorPluginModule } from './wecom-connector.module.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => {
  const { Module } = jest.requireActual('@nestjs/common') as typeof import('@nestjs/common')

  return {
    AgentMiddlewareStrategy: () => () => undefined,
    ConnectorRuntimeCapability: { id: 'platform.connector' },
    ConnectorStrategyKey: () => () => undefined,
    INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE',
    IntegrationStrategyKey: () => () => undefined,
    XpertServerPlugin: (metadata: Parameters<typeof Module>[0]) => Module(metadata)
  }
})

describe('WeComConnectorPluginModule', () => {
  it('owns both the system integration credentials and workspace connector', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WeComConnectorPluginModule) as unknown[]

    expect(providers).toContain(WeComAuthIntegrationStrategy)
    expect(providers).toContain(WeComConnectorStrategy)
  })
})
