import { KDOCS_AUTH_METHOD_ID, KDOCS_AUTHORIZATION_TTL_MS } from './constants.js'
import { KdocsConnectorStrategy } from './kdocs-connector.strategy.js'
import { KdocsSkillHubAuthClient } from './kdocs-skillhub-auth.client.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('KdocsConnectorStrategy', () => {
  it('builds a WorkBuddy-compatible WPS login URL with a private five-minute polling session', async () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z')
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const strategy = createStrategy()

    const result = await strategy.connect({
      authMethodId: KDOCS_AUTH_METHOD_ID,
      redirectUri: 'https://xpert.test/api/connector/oauth/callback',
      state: 'host-state'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending connector result')
    const login = new URL(result.authorizationUrl)
    expect(login.origin + login.pathname).toBe('https://account.wps.cn/login')
    const callback = new URL(String(login.searchParams.get('cb')))
    expect(callback.origin + callback.pathname).toBe('https://api.wps.cn/office/v5/ai/skill_hub/users/callback')
    expect(callback.searchParams.get('code')).toMatch(/^[0-9a-f-]{36}$/)
    expect(callback.searchParams.get('code')).not.toBe('host-state')
    expect(result.pollIntervalSeconds).toBe(2)
    expect(Date.parse(String(result.metadata?.expiresAt)) - Date.parse(String(result.metadata?.issuedAt)))
      .toBe(KDOCS_AUTHORIZATION_TTL_MS)
  })

  it('keeps polling while WPS returns pending', async () => {
    const { strategy, exchange } = setupStrategy()
    exchange.mockResolvedValue({ status: 'pending' })
    const metadata = pendingMetadata()

    await expect(strategy.pollConnection({ authMethodId: KDOCS_AUTH_METHOD_ID, metadata, redirectUri: 'unused' }))
      .resolves.toEqual({ status: 'pending', pollIntervalSeconds: 2, metadata })
  })

  it('stores only the normalized runtime token after WPS login completes', async () => {
    const { strategy, exchange } = setupStrategy()
    exchange.mockResolvedValue({ status: 'complete', accessToken: 'wps-secret-token', expiresIn: 7_200 })

    const result = await strategy.pollConnection({
      authMethodId: KDOCS_AUTH_METHOD_ID,
      metadata: pendingMetadata(),
      redirectUri: 'unused'
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'complete',
      credential: expect.objectContaining({ data: { accessToken: 'wps-secret-token', tokenType: 'bearer' } })
    }))
    if (result.status !== 'complete') throw new Error('Expected completed connector result')
    expect(strategy.resolveRuntimeCredential({ authMethodId: KDOCS_AUTH_METHOD_ID, credential: result.credential }))
      .toEqual({ accessToken: 'wps-secret-token', tokenType: 'bearer' })
  })

  it('expires a valid authorization session without calling WPS', async () => {
    const { strategy, exchange } = setupStrategy()
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-25T10:06:00.000Z'))

    await expect(strategy.pollConnection({
      authMethodId: KDOCS_AUTH_METHOD_ID,
      metadata: pendingMetadata('2026-08-25T10:00:00.000Z'),
      redirectUri: 'unused'
    })).resolves.toEqual({ status: 'error', error: 'WPS authorization timed out. Start the connection again.' })
    expect(exchange).not.toHaveBeenCalled()
  })
})

function createStrategy() {
  return setupStrategy().strategy
}

function setupStrategy() {
  const auth = new KdocsSkillHubAuthClient()
  const exchange = jest.spyOn(auth, 'exchange')
  return { strategy: new KdocsConnectorStrategy(auth), exchange }
}

function pendingMetadata(issuedAt = new Date(Date.now()).toISOString()) {
  return {
    version: 1,
    code: '123e4567-e89b-42d3-a456-426614174000',
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + KDOCS_AUTHORIZATION_TTL_MS).toISOString()
  }
}
