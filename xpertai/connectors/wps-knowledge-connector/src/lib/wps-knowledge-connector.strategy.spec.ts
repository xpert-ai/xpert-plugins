import { WPS_AUTHORIZATION_TTL_MS, WPS_KNOWLEDGE_AUTH_METHOD_ID } from './constants.js'
import { WPS_KNOWLEDGE_ICON } from './branding.js'
import { WpsKnowledgeConnectorStrategy } from './wps-knowledge-connector.strategy.js'
import { WpsSkillHubAuthClient } from './wps-skillhub-auth.client.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('WpsKnowledgeConnectorStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('uses the WPS Knowledge brand icon on connector surfaces', () => {
    expect(setup().strategy.definition.icon).toEqual(WPS_KNOWLEDGE_ICON)
  })

  it('generates a private SkillHub code and returns the WPS web-login URL', async () => {
    const now = Date.parse('2026-08-26T08:00:00.000Z')
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const { strategy, generateCode } = setup()
    generateCode.mockResolvedValue('0123456789abcdef0123456789abcdef')

    const result = await strategy.connect({
      authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'host-state'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending connector state')
    const login = new URL(result.authorizationUrl)
    expect(login.origin + login.pathname).toBe('https://account.wps.cn/login')
    const callback = new URL(String(login.searchParams.get('cb')))
    expect(callback.origin + callback.pathname).toBe('https://zhishi.wps.cn/kwiki/api/v1/skills_hub/callback')
    expect(callback.searchParams.get('code')).toBe('0123456789abcdef0123456789abcdef')
    expect(result.pollIntervalSeconds).toBe(2)
    expect(Date.parse(String(result.metadata?.expiresAt)) - Date.parse(String(result.metadata?.issuedAt)))
      .toBe(WPS_AUTHORIZATION_TTL_MS)
  })

  it('polls until login completes and stores only the SkillHub token', async () => {
    const { strategy, exchange } = setup()
    exchange.mockResolvedValue({ status: 'complete', accessToken: 'kwiki-token', expiresIn: 7_200 })

    const result = await strategy.pollConnection({
      authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
      redirectUri: 'unused',
      metadata: pendingMetadata()
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'complete',
      credential: expect.objectContaining({ data: { accessToken: 'kwiki-token', tokenType: 'kwiki' } })
    }))
    if (result.status !== 'complete') throw new Error('Expected completed connector state')
    expect(strategy.resolveRuntimeCredential({
      authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
      credential: result.credential
    })).toEqual({ accessToken: 'kwiki-token', tokenType: 'kwiki' })
  })

  it('keeps polling while WPS waits for browser login', async () => {
    const { strategy, exchange } = setup()
    exchange.mockResolvedValue({ status: 'pending' })
    const metadata = pendingMetadata()
    await expect(strategy.pollConnection({
      authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
      redirectUri: 'unused',
      metadata
    })).resolves.toEqual({ status: 'pending', pollIntervalSeconds: 2, metadata })
  })
})

function setup() {
  const auth = new WpsSkillHubAuthClient()
  const generateCode = jest.spyOn(auth, 'generateCode')
  const exchange = jest.spyOn(auth, 'exchange')
  return { strategy: new WpsKnowledgeConnectorStrategy(auth), generateCode, exchange }
}

function pendingMetadata() {
  const issuedAt = new Date(Date.now()).toISOString()
  return {
    version: 1,
    code: '0123456789abcdef0123456789abcdef',
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + WPS_AUTHORIZATION_TTL_MS).toISOString()
  }
}
