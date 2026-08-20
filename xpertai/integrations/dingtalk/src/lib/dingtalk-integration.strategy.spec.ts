import axios from 'axios'
import type { IIntegration } from '@xpert-ai/contracts'
import { DingTalkIntegrationStrategy } from './dingtalk-integration.strategy.js'
import { DingTalkLongIntegrationStrategy } from './dingtalk-long-integration.strategy.js'
import { DingTalkClient } from './dingtalk.client.js'
import {
  DINGTALK_APP_CREDENTIALS_HELP_LABEL,
  DINGTALK_APP_CREDENTIALS_HELP_URL,
  INTEGRATION_DINGTALK_LONG,
  type TIntegrationDingTalkOptions
} from './types.js'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({})),
    post: jest.fn()
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => () => undefined
}))

jest.mock('./dingtalk-long-connection.service.js', () => ({
  DingTalkLongConnectionService: class DingTalkLongConnectionService {}
}))

describe('DingTalkIntegrationStrategy', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>

  function createFixture() {
    const longConnection = {
      disconnect: jest.fn().mockResolvedValue(undefined),
      reconnect: jest.fn().mockResolvedValue(undefined),
      probeConfig: jest.fn().mockResolvedValue({
        connected: true,
        state: 'connected',
        checkedAt: 1000,
        lastError: null
      })
    }

    return {
      longConnection,
      strategy: new DingTalkIntegrationStrategy(),
      longStrategy: new DingTalkLongIntegrationStrategy(longConnection as any)
    }
  }

  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: {
        accessToken: 'access-token'
      }
    } as any)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('keeps HTTP callback required in HTTP mode', async () => {
    const { strategy } = createFixture()

    await expect(
      strategy.validateConfig({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        httpCallbackEnabled: false
      } as TIntegrationDingTalkOptions)
    ).rejects.toThrow('HTTP callback is required for DingTalk HTTP mode')
  })

  it('exposes DingTalk HTTP mode as the non-recommended fallback provider', () => {
    const { strategy } = createFixture()
    const properties = strategy.meta.schema?.properties as Record<string, unknown>

    expect(strategy.meta.label.zh_Hans).toBe('钉钉-HTTP模式')
    expect(strategy.meta.label.en_US).toBe('DingTalk (HTTP Mode)')
    expect(strategy.meta.description.zh_Hans).toContain('无法使用 Stream 模式')
    expect(DINGTALK_APP_CREDENTIALS_HELP_URL).toBe('https://open.dingtalk.com/document/')
    expect(strategy.meta.helpUrl).toBe(DINGTALK_APP_CREDENTIALS_HELP_URL)
    expect(strategy.meta.helpLabel).toBe(DINGTALK_APP_CREDENTIALS_HELP_LABEL)
    expect(properties.connectionMode).toBeUndefined()
    expect(properties.httpCallbackEnabled).toBeUndefined()
    expect(properties.xpertId).toBeUndefined()
  })

  it('keeps default webhook mode returning the callback URL when the toggle is omitted', async () => {
    const { strategy } = createFixture()

    const result = await strategy.validateConfig({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      callbackToken: 'token',
      callbackAesKey: 'aes-key'
    } as TIntegrationDingTalkOptions)

    expect(result).toMatchObject({
      mode: 'webhook',
      webhookUrl: expect.stringContaining('/api/dingtalk/webhook/')
    })
  })

  it('exposes DingTalk Stream mode as the recommended provider', () => {
    const { longStrategy } = createFixture()
    const properties = longStrategy.meta.schema?.properties as Record<string, unknown>

    expect(longStrategy.meta.name).toBe(INTEGRATION_DINGTALK_LONG)
    expect(longStrategy.meta.label.zh_Hans).toBe('钉钉-Stream模式')
    expect(longStrategy.meta.label.en_US).toBe('DingTalk (Stream Mode)')
    expect(longStrategy.meta.description.zh_Hans).toContain('推荐使用')
    expect(longStrategy.meta.webhook).toBe(false)
    expect(longStrategy.meta.helpUrl).toBe(DINGTALK_APP_CREDENTIALS_HELP_URL)
    expect(longStrategy.meta.helpLabel).toBe(DINGTALK_APP_CREDENTIALS_HELP_LABEL)
    expect(properties.connectionMode).toBeUndefined()
    expect(properties.httpCallbackEnabled).toBeUndefined()
    expect(properties.xpertId).toBeUndefined()
    expect(properties.callbackToken).toBeUndefined()
    expect(properties.callbackAesKey).toBeUndefined()
  })

  it('validates the dedicated Stream mode provider without HTTP callback credentials', async () => {
    const { longStrategy, longConnection } = createFixture()

    const result = await longStrategy.validateConfig({
      clientId: 'client-id',
      clientSecret: 'client-secret'
    } as TIntegrationDingTalkOptions)

    expect(result).toMatchObject({
      mode: 'long_connection',
      stream: {
        mode: 'long_connection',
        probe: {
          connected: true
        }
      }
    })
    expect(result).not.toHaveProperty('webhookUrl')
    expect(longConnection.probeConfig).toHaveBeenCalled()
  })

  it('disconnects dedicated long runtime when switching away from the long provider', async () => {
    const { longStrategy, longConnection } = createFixture()

    await longStrategy.onUpdate(
      createIntegration({}, INTEGRATION_DINGTALK_LONG),
      createIntegration({}, 'dingtalk')
    )

    expect(longConnection.disconnect).toHaveBeenCalledWith('integration-1')
  })

  it('delegates H5 authorization-code exchange to the DingTalk client in both providers', async () => {
    const { strategy, longStrategy } = createFixture()
    const exchange = jest.spyOn(DingTalkClient.prototype, 'exchangeAuthorizationCode').mockResolvedValue({
      provider: 'dingtalk',
      externalOrganizationId: 'corp-1',
      subjectId: 'employee-1'
    })
    const integration = createIntegration({ corpId: 'corp-1' })

    await expect(
      strategy.exchangeIdentity(integration, { type: 'authorization_code', code: 'code-http' })
    ).resolves.toMatchObject({ subjectId: 'employee-1' })
    await expect(
      longStrategy.exchangeIdentity(integration, { type: 'authorization_code', code: 'code-stream' })
    ).resolves.toMatchObject({ subjectId: 'employee-1' })

    expect(exchange).toHaveBeenNthCalledWith(1, 'code-http')
    expect(exchange).toHaveBeenNthCalledWith(2, 'code-stream')
  })

  it('declares enterprise H5 capability and exposes the public app identifiers', async () => {
    const { strategy, longStrategy } = createFixture()
    const integration = createIntegration({ clientId: ' client-id ', corpId: ' corp-1 ' })

    expect(strategy.meta.enterpriseH5).toEqual({
      platform: 'dingtalk',
      externalIdentityProvider: 'dingtalk',
      accountBindingProvider: 'dingtalk-sso'
    })
    expect(longStrategy.meta.enterpriseH5).toEqual(strategy.meta.enterpriseH5)
    await expect(strategy.getIdentityBootstrap(integration)).resolves.toEqual({
      externalOrganizationId: 'corp-1',
      clientConfig: { clientId: 'client-id', corpId: 'corp-1' }
    })
    await expect(longStrategy.getIdentityBootstrap(integration)).resolves.toEqual({
      externalOrganizationId: 'corp-1',
      clientConfig: { clientId: 'client-id', corpId: 'corp-1' }
    })
  })
})

function createIntegration(
  options: Partial<TIntegrationDingTalkOptions>,
  provider = 'dingtalk'
): IIntegration<TIntegrationDingTalkOptions> {
  return {
    id: 'integration-1',
    provider,
    options: {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      httpCallbackEnabled: true,
      callbackToken: 'token',
      callbackAesKey: 'aes-key',
      ...options
    }
  } as IIntegration<TIntegrationDingTalkOptions>
}
