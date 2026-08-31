import 'reflect-metadata'
import { MODULE_METADATA } from '@nestjs/common/constants.js'
import { DingTalkDwsAuthClient } from './api/dingtalk-dws-auth.client.js'
import { DingTalkConnectorPluginModule } from './dingtalk-connector.module.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'
import { DingTalkCliBootstrapService } from './middlewares/dingtalk-cli-bootstrap.service.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  ConnectorStrategyKey: () => () => undefined,
  XpertServerPlugin: (metadata: Parameters<typeof import('@nestjs/common').Module>[0]) => {
    const { Module } = jest.requireActual('@nestjs/common') as typeof import('@nestjs/common')
    return Module(metadata)
  }
}))

describe('DingTalkConnectorPluginModule', () => {
  it('registers the DWS OAuth client, connector, and CLI runtime', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DingTalkConnectorPluginModule) as unknown[]

    expect(providers).toContain(DingTalkConnectorStrategy)
    expect(providers).toContain(DingTalkDwsAuthClient)
    expect(providers).toContain(DingTalkCliBootstrapService)
  })
})
