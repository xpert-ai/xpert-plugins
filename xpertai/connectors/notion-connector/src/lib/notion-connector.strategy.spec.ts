import { NotionConnectorStrategy } from './notion-connector.strategy.js'
import { NOTION_PUBLIC_OAUTH_AUTH_METHOD } from './constants.js'
import { NotionOAuthClient } from './notion-oauth.client.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'integration-service'
}))

describe('NotionConnectorStrategy', () => {
  const integration = {
    id: 'integration-1',
    provider: 'notion',
    options: { clientId: 'client-1', clientSecret: 'secret-1' }
  }

  function createStrategy(oauth: Partial<NotionOAuthClient> = {}) {
    const pluginContext = {
      resolve: jest.fn().mockReturnValue({ read: jest.fn().mockResolvedValue(integration) })
    }
    const client = {
      exchangeCode: jest.fn().mockResolvedValue({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        tokenType: 'bearer',
        botId: 'bot-1',
        workspaceId: 'workspace-1',
        workspaceName: 'Workspace'
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        tokenType: 'bearer',
        botId: 'bot-1',
        workspaceId: 'workspace-1'
      }),
      ...oauth
    } as unknown as NotionOAuthClient
    return { strategy: new NotionConnectorStrategy(pluginContext as never, client), pluginContext, client }
  }

  it('builds the official Public OAuth URL and encrypted-session metadata', async () => {
    const { strategy } = createStrategy()
    const result = await strategy.connect({
      authMethodId: NOTION_PUBLIC_OAUTH_AUTH_METHOD,
      values: { integrationId: 'integration-1' },
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-1'
    })
    expect(result.status).toBe('pending')
    if (result.status !== 'pending') return
    const url = new URL(result.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
    expect(url.searchParams.get('owner')).toBe('user')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(result.metadata).toEqual(
      expect.objectContaining({
        version: 1,
        integrationId: 'integration-1',
        redirectUri: 'https://xpert.example/api/connector/oauth/callback'
      })
    )
  })

  it('exchanges a callback code without exposing the app secret', async () => {
    const { strategy, client } = createStrategy()
    const started = await strategy.connect({
      authMethodId: NOTION_PUBLIC_OAUTH_AUTH_METHOD,
      values: { integrationId: 'integration-1' },
      redirectUri: 'https://xpert.example/callback',
      state: 'state-1'
    })
    if (started.status !== 'pending') throw new Error('OAuth did not start')
    const credential = await strategy.exchangeAuthorizationCode({
      authMethodId: NOTION_PUBLIC_OAUTH_AUTH_METHOD,
      metadata: started.metadata,
      code: 'code-1',
      redirectUri: 'https://xpert.example/callback'
    })
    expect(client.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1', clientSecret: 'secret-1', code: 'code-1' })
    )
    expect(credential.data).toEqual(
      expect.objectContaining({ accessToken: 'access-1', refreshToken: 'refresh-1', workspaceId: 'workspace-1' })
    )
    expect(credential.data).not.toHaveProperty('clientSecret')
    expect(strategy.resolveRuntimeCredential({ authMethodId: NOTION_PUBLIC_OAUTH_AUTH_METHOD, credential })).toEqual(
      expect.objectContaining({ accessToken: 'access-1', tokenType: 'bearer' })
    )
  })

  it('rotates the refresh token returned by Notion', async () => {
    const { strategy, client } = createStrategy()
    const credential = await strategy.refreshConnectionCredential({
      authMethodId: NOTION_PUBLIC_OAUTH_AUTH_METHOD,
      credential: { data: { integrationId: 'integration-1', refreshToken: 'refresh-old', accessToken: 'access-old' } }
    })
    expect(client.refresh).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'refresh-old' }))
    expect(credential.data.refreshToken).toBe('refresh-2')
  })

  it('rejects callback metadata for a different redirect URI', async () => {
    const { strategy } = createStrategy()
    await expect(
      strategy.exchangeAuthorizationCode({
        authMethodId: NOTION_PUBLIC_OAUTH_AUTH_METHOD,
        metadata: {
          version: 1,
          integrationId: 'integration-1',
          clientIdFingerprint: 'bad',
          redirectUri: 'https://expected/callback'
        },
        code: 'code-1',
        redirectUri: 'https://other/callback'
      })
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' })
  })
})
