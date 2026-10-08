import { DingTalkConnectorApiClient } from './dingtalk-connector-api.client.js'

describe('DingTalkConnectorApiClient', () => {
  afterEach(() => jest.restoreAllMocks())

  it('exchanges app credentials once and caches the app access token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ accessToken: 'app-token', expireIn: 7200 }))
    const client = new DingTalkConnectorApiClient()
    const credential = { integrationId: 'integration-1', clientId: 'ding-client', clientSecret: 'secret-value' }

    await expect(client.getAppAccessToken(credential)).resolves.toBe('app-token')
    await expect(client.getAppAccessToken(credential)).resolves.toBe('app-token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dingtalk.com/v1.0/oauth2/accessToken',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ appKey: 'ding-client', appSecret: 'secret-value' })
      })
    )
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
