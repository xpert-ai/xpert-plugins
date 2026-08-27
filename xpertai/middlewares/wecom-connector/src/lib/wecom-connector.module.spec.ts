import 'reflect-metadata'
import { MODULE_METADATA } from '@nestjs/common/constants.js'
import { WeComApiClient } from './api/wecom-api.client.js'
import { WeComConfirmationStore } from './tools/confirmation-store.js'
import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WeComConnectorPluginModule } from './wecom-connector.module.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => {
  const { Module } = jest.requireActual('@nestjs/common') as typeof import('@nestjs/common')

  return {
    AgentMiddlewareStrategy: () => () => undefined,
    ConnectorRuntimeCapability: { id: 'platform.connector' },
    WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
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
    expect(providers).toContain(WeComConnectorRuntimeMiddleware)
    expect(providers).toContain(WeComApiClient)
    expect(providers).toContain(WeComConfirmationStore)
  })
})
