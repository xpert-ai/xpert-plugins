jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import {
  DEFAULT_LARK_CLI_CONNECTOR_ENV_DIR,
  LarkCliMiddlewareConfigFormSchema,
  LarkAuthMode
} from './lark-cli.types.js'
import { LarkBootstrapService } from './lark-bootstrap.service.js'

type ConnectorIdSchemaProperty = typeof LarkCliMiddlewareConfigFormSchema.properties.connectorId & {
  'x-ui'?: {
    selectUrl?: string
    depends?: unknown[]
    visibleWhen?: unknown
  }
}

type ConnectorCredentialBackend = NonNullable<Parameters<LarkBootstrapService['syncConnectorCredential']>[0]>
type AuthEnsureBackend = NonNullable<Parameters<LarkBootstrapService['buildAuthEnsureResponse']>[0]>

describe('LarkBootstrapService connector mode', () => {
  let service: LarkBootstrapService

  beforeEach(() => {
    service = new LarkBootstrapService()
  })

  it('accepts connector mode config', () => {
    const config = service.resolveConfig({
      authMode: LarkAuthMode.CONNECTOR
    })

    expect(config).toEqual({
      authMode: LarkAuthMode.CONNECTOR
    })
  })

  it('keeps a legacy connector id when an old draft has one', () => {
    const config = service.resolveConfig({
      authMode: LarkAuthMode.CONNECTOR,
      connectorId: 'connector-1'
    })

    expect(config).toEqual({
      authMode: LarkAuthMode.CONNECTOR,
      connectorId: 'connector-1'
    })
  })

  it('does not expose connector mode in the user-addable Lark CLI form', () => {
    expect(LarkCliMiddlewareConfigFormSchema.properties.authMode.enum).toEqual([
      LarkAuthMode.USER,
      LarkAuthMode.BOT
    ])
    expect(LarkCliMiddlewareConfigFormSchema.properties.connectorId).toBeUndefined()
  })

  it('shows bot credential fields only for bot mode', () => {
    const appId = LarkCliMiddlewareConfigFormSchema.properties.appId as ConnectorIdSchemaProperty
    const appSecret = LarkCliMiddlewareConfigFormSchema.properties.appSecret as ConnectorIdSchemaProperty
    const brand = LarkCliMiddlewareConfigFormSchema.properties.brand as ConnectorIdSchemaProperty

    for (const property of [appId, appSecret, brand]) {
      expect(property['x-ui']?.visibleWhen).toEqual({
        name: 'authMode',
        value: LarkAuthMode.BOT
      })
    }
  })

  it('uploads connector access token environment without refresh token', async () => {
    const backend = {
      workingDirectory: '/workspace',
      execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
      uploadFiles: jest.fn().mockResolvedValue([{ path: '.xpert/secrets/lark-cli-connectors/connector-1/env', error: null }])
    }

    await service.syncConnectorCredential(backend as ConnectorCredentialBackend, {
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'lark',
      appId: 'cli_app_id',
      brand: 'feishu',
      accessToken: 'user_access_token',
      expiresAt: '2026-01-01T00:00:00.000Z'
    })

    expect(backend.execute).toHaveBeenCalledWith(
      expect.stringContaining(`mkdir -p '${DEFAULT_LARK_CLI_CONNECTOR_ENV_DIR}/connector-1'`)
    )
    expect(backend.uploadFiles).toHaveBeenCalledTimes(1)
    const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
    const content = uploaded.toString('utf8')
    expect(content).toContain("LARKSUITE_CLI_APP_ID='cli_app_id'")
    expect(content).toContain("LARKSUITE_CLI_BRAND='feishu'")
    expect(content).toContain("LARKSUITE_CLI_USER_ACCESS_TOKEN='user_access_token'")
    expect(content).toContain('LARKSUITE_CLI_DEFAULT_AS=user')
    expect(content).not.toContain('refresh')
  })

  it('defaults connector runtime brand to Feishu', async () => {
    const backend = {
      workingDirectory: '/workspace',
      execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
      uploadFiles: jest.fn().mockResolvedValue([{ path: '.xpert/secrets/lark-cli-connectors/connector-1/env', error: null }])
    }

    await service.syncConnectorCredential(backend as ConnectorCredentialBackend, {
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'lark',
      appId: 'cli_app_id',
      accessToken: 'user_access_token',
      expiresAt: '2026-01-01T00:00:00.000Z'
    })

    const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
    expect(uploaded.toString('utf8')).toContain("LARKSUITE_CLI_BRAND='feishu'")
  })

  it('forces connector runtime brand to Feishu', async () => {
    const backend = {
      workingDirectory: '/workspace',
      execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
      uploadFiles: jest.fn().mockResolvedValue([{ path: '.xpert/secrets/lark-cli-connectors/connector-1/env', error: null }])
    }

    await service.syncConnectorCredential(backend as ConnectorCredentialBackend, {
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'lark',
      appId: 'cli_app_id',
      brand: 'lark',
      accessToken: 'user_access_token',
      expiresAt: '2026-01-01T00:00:00.000Z'
    })

    const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
    expect(uploaded.toString('utf8')).toContain("LARKSUITE_CLI_BRAND='feishu'")
    expect(uploaded.toString('utf8')).not.toContain("LARKSUITE_CLI_BRAND='lark'")
  })

  it('builds a connector command that sources the isolated env file', () => {
    expect(service.buildConnectorCommand('lark-cli calendar +agenda', 'connector-1')).toBe(
      `. '${DEFAULT_LARK_CLI_CONNECTOR_ENV_DIR}/connector-1/env' && lark-cli calendar +agenda`
    )
  })

  it('does not start device login for connector mode', async () => {
    const backend = {
      execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false })
    }

    const response = await service.buildAuthEnsureResponse(backend as AuthEnsureBackend, {
      authMode: LarkAuthMode.CONNECTOR
    })

    expect(response.authMode).toBe(LarkAuthMode.CONNECTOR)
    expect(response.configValid).toBe(true)
    expect(response.authorizationUrl).toBeNull()
    expect(response.message).toContain('platform.connector')
    expect(backend.execute).not.toHaveBeenCalledWith(expect.stringContaining('auth login'))
  })
})
