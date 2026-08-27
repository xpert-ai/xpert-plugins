import { WPS_SKILLHUB_CODE_URL, WPS_SKILLHUB_EXCHANGE_URL } from './constants.js'
import { WpsSkillHubAuthClient } from './wps-skillhub-auth.client.js'

describe('WpsSkillHubAuthClient', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('generates a server-owned SkillHub device code', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      code: 0,
      msg: 'ok',
      data: { code: '0123456789abcdef0123456789abcdef' }
    }))
    global.fetch = fetchMock

    await expect(new WpsSkillHubAuthClient().generateCode())
      .resolves.toBe('0123456789abcdef0123456789abcdef')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(WPS_SKILLHUB_CODE_URL)
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('X-Kwiki-Cli-Ver')).toBe('2.0.2')
  })

  it('maps HTTP 202 to a pending login', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ code: 0, msg: 'waiting for login', data: null }, 202))
    await expect(new WpsSkillHubAuthClient().exchange('device-code')).resolves.toEqual({ status: 'pending' })
  })

  it('normalizes a completed access token without leaking provider fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: { access_token: 'Bearer secret-token', expires_in: 3_600, ignored: 'drop' }
    }))
    global.fetch = fetchMock
    await expect(new WpsSkillHubAuthClient().exchange('device-code')).resolves.toEqual({
      status: 'complete',
      accessToken: 'secret-token',
      expiresIn: 3_600
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(WPS_SKILLHUB_EXCHANGE_URL)
  })
})

function jsonResponse(value: object, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
