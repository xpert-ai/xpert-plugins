import { WeComApiClient } from './wecom-api.client.js'

describe('WeComApiClient', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('sends bounded application message payloads without putting the token in the body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ errcode: 0, msgid: 'message-1' }))
    global.fetch = fetchMock

    await new WeComApiClient().sendMessage({
      accessToken: 'secret-token',
      agentId: '1000002',
      userIds: ['user-1', 'user-2'],
      message: { type: 'text', content: 'Hello' }
    })

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.searchParams.get('access_token')).toBe('secret-token')
    expect(JSON.parse(String(init.body))).toEqual({
      touser: 'user-1|user-2',
      agentid: 1000002,
      safe: 0,
      enable_duplicate_check: 1,
      duplicate_check_interval: 1800,
      msgtype: 'text',
      text: { content: 'Hello' }
    })
    expect(String(init.body)).not.toContain('secret-token')
  })

  it('maps expired-token provider errors without exposing the token', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ errcode: 42001, errmsg: 'access_token=secret-token expired' }))

    await expect(new WeComApiClient().listTags('secret-token')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
      providerCode: 42001,
      retryable: true
    })
    await expect(new WeComApiClient().listTags('secret-token')).rejects.not.toThrow('secret-token')
  })

  it('maps provider rate limits to a retryable stable error', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ errcode: 45009, errmsg: 'api freq out of limit' }))

    await expect(new WeComApiClient().listTags('token')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      providerCode: 45009,
      retryable: true
    })
  })
})

function jsonResponse(value: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
