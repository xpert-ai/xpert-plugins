import 'reflect-metadata'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { DingTalkConnectorIntegrationStrategy } from './dingtalk-connector-integration.strategy.js'
import { DingTalkConnectorPluginModule } from './dingtalk-connector.module.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  ConnectorStrategyKey: () => () => undefined,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE',
  IntegrationStrategyKey: () => () => undefined,
  XpertServerPlugin: (metadata: Parameters<typeof import('@nestjs/common').Module>[0]) => {
    const { Module } = jest.requireActual('@nestjs/common') as typeof import('@nestjs/common')
    return Module(metadata)
  }
}))

describe('DingTalkConnectorPluginModule', () => {
  it('registers the connector-owned system integration strategy', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DingTalkConnectorPluginModule) as unknown[]

    expect(providers).toContain(DingTalkConnectorIntegrationStrategy)
    expect(providers).toContain(DingTalkConnectorStrategy)
  })
})
