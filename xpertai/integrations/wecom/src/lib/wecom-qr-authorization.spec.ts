import { beginWeComQrAuthorization, pollWeComQrAuthorization } from './wecom-qr-authorization.js'

describe('WeCom QR authorization', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch')

  afterEach(() => {
    fetchMock.mockReset()
  })

  afterAll(() => {
    fetchMock.mockRestore()
  })

  it('starts authorization with the official CLI QR source', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { scode: 'scode-1234', auth_url: 'https://qr.example/1' } }))

    await expect(beginWeComQrAuthorization()).resolves.toEqual({
      deviceCode: 'scode-1234',
      authorizationUrl: 'https://qr.example/1',
      expiresInSeconds: 300,
      intervalSeconds: 3
    })

    const request = new URL(fetchMock.mock.calls[0][0] as string)
    expect(request.origin + request.pathname).toBe('https://work.weixin.qq.com/ai/qc/generate')
    expect(request.searchParams.get('source')).toBe('wecom_cli_external')
    expect(request.searchParams.get('plat')).toBe('3')
  })

  it('keeps polling without exposing credentials before authorization completes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'waiting' } }))

    await expect(pollWeComQrAuthorization('scode-1234')).resolves.toEqual({ status: 'waiting' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://work.weixin.qq.com/ai/qc/query_result?scode=scode-1234')
  })

  it('maps authorized bot credentials to long-connection integration options', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { status: 'success', bot_info: { botid: 'bot-1', secret: 'secret-1' } } })
    )

    await expect(pollWeComQrAuthorization('scode-1234')).resolves.toEqual({
      status: 'authorized',
      options: { botId: 'bot-1', secret: 'secret-1' }
    })
  })

  it('rejects a successful response without bot credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'success' } }))

    await expect(pollWeComQrAuthorization('scode-1234')).rejects.toThrow('completed without robot credentials')
  })

  it('sanitizes network failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private scode'))

    await expect(pollWeComQrAuthorization('scode-1234')).rejects.toThrow(
      'Unable to reach WeCom QR authorization service'
    )
  })
})

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload
  } as Response
}
