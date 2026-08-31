import { get } from 'node:http'
import {
  DINGTALK_DWS_DEVICE_BASE_URL,
  DINGTALK_DWS_MCP_BASE_URL,
  DingTalkDwsAuthClient
} from './dingtalk-dws-auth.client.js'

describe('DingTalkDwsAuthClient', () => {
  const client = new DingTalkDwsAuthClient()

  afterEach(() => jest.restoreAllMocks())

  it('starts device authorization with the official DWS client ID', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ success: true, result: 'official-client' }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: {
            deviceCode: 'device-code',
            userCode: 'ABCD1234',
            verificationUri: 'https://login.dingtalk.com/oauth2/device/verify.htm',
            verificationUriComplete: 'https://login.dingtalk.com/oauth2/device/verify.htm?user_code=ABCD1234',
            expiresIn: 900,
            interval: 5,
            flowId: 'flow-1'
          }
        })
      )

    await expect(client.startDeviceAuthorization(['openid', 'corpid'])).resolves.toEqual({
      clientId: 'official-client',
      deviceCode: 'device-code',
      userCode: 'ABCD1234',
      authorizationUrl: 'https://login.dingtalk.com/oauth2/device/verify.htm?user_code=ABCD1234',
      expiresIn: 900,
      interval: 5,
      flowId: 'flow-1'
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${DINGTALK_DWS_MCP_BASE_URL}/cli/clientId`,
      expect.objectContaining({ headers: expect.any(Headers) })
    )
    const request = fetchMock.mock.calls[1]
    expect(request[0]).toBe(`${DINGTALK_DWS_DEVICE_BASE_URL}/oauth2/device/code.json`)
    expect(String(request[1]?.body)).toBe('client_id=official-client&scope=openid+corpid')
  })

  it('forwards a validated loopback callback to Xpert and closes the listener', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ success: true, result: 'official-client' }))

    const authorization = await client.startLoopbackAuthorization({
      state: 'state-1',
      scopes: ['openid', 'corpid'],
      forwardRedirectUri: 'http://127.0.0.1:3000/api/connector/oauth/callback'
    })

    const authorizationUrl = new URL(authorization.authorizationUrl)
    expect(authorizationUrl.searchParams.get('client_id')).toBe('official-client')
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(authorization.redirectUri)
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code')
    expect(authorizationUrl.searchParams.get('scope')).toBe('openid corpid')
    expect(authorizationUrl.searchParams.get('state')).toBe('state-1')
    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent')

    const callback = new URL(authorization.redirectUri)
    callback.searchParams.set('state', 'state-1')
    callback.searchParams.set('code', 'oauth-code')
    const response = await requestLoopback(callback)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(
      'http://127.0.0.1:3000/api/connector/oauth/callback?state=state-1&code=oauth-code'
    )
    await authorization.close()
  })

  it('rejects a loopback callback with a mismatched state', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ success: true, result: 'official-client' }))

    const authorization = await client.startLoopbackAuthorization({
      state: 'state-1',
      scopes: ['openid'],
      forwardRedirectUri: 'https://xpert.example/api/connector/oauth/callback'
    })

    const callback = new URL(authorization.redirectUri)
    callback.searchParams.set('state', 'wrong-state')
    callback.searchParams.set('code', 'oauth-code')
    const response = await requestLoopback(callback)

    expect(response.status).toBe(400)
    expect(response.body).toBe('Invalid OAuth state')
    await authorization.close()
  })

  it('polls the DWS flow until it returns an authorization code', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, data: { status: 'APPROVED', authCode: 'auth-code' } }))

    await expect(
      client.pollDeviceAuthorization({
        clientId: 'official-client',
        deviceCode: 'device-code',
        flowId: 'flow-1',
        interval: 5
      })
    ).resolves.toEqual({ status: 'approved', authCode: 'auth-code' })
  })

  it('supports the standard device token pending and slow-down responses', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { error: 'authorization_pending' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { error: 'slow_down' } }))

    const input = { clientId: 'official-client', deviceCode: 'device-code', interval: 5 }
    await expect(client.pollDeviceAuthorization(input)).resolves.toEqual({ status: 'pending' })
    await expect(client.pollDeviceAuthorization(input)).resolves.toEqual({ status: 'pending', interval: 10 })
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain('client_secret')
  })

  it('exchanges and refreshes tokens through DWS without a Client Secret', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(tokenResponse('access-1', 'refresh-1')))
      .mockResolvedValueOnce(jsonResponse(tokenResponse('access-2', 'refresh-2')))

    await expect(client.exchangeAuthorizationCode('official-client', 'auth-code')).resolves.toMatchObject({
      clientId: 'official-client',
      accessToken: 'access-1',
      refreshToken: 'refresh-1'
    })
    await expect(client.refreshToken('official-client', 'refresh-1')).resolves.toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2'
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      clientId: 'official-client',
      grantType: 'authorization_code',
      authCode: 'auth-code'
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      clientId: 'official-client',
      grantType: 'refresh_token',
      refreshToken: 'refresh-1'
    })
    expect(fetchMock.mock.calls.map((call) => String(call[1]?.body)).join('\n')).not.toContain('clientSecret')
  })

  it('verifies CLI access without sending the DWS token to DingTalk OpenAPI', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { cliAuthEnabled: true } }))

    await expect(client.assertCliAccess('access-token')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${DINGTALK_DWS_MCP_BASE_URL}/cli/cliAuthEnabled`)
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-user-access-token')).toBe('access-token')
  })

  it('reports when the organization has disabled DWS CLI access', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ success: false, result: { cliAuthEnabled: false, userScope: 'forbidden' } }))

    await expect(client.assertCliAccess('access-token')).rejects.toThrow('disabled DWS CLI access')
  })
})

function tokenResponse(accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    persistentCode: 'persistent-code',
    expiresIn: 7_200,
    refreshExpiresIn: 2_592_000,
    corpId: 'corp-1',
    corpName: 'Ding Corp',
    userId: 'user-1',
    userName: 'Ding User'
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function requestLoopback(url: URL) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>(
    (resolve, reject) => {
      const request = get(url, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString('utf8')
          })
        })
      })
      request.on('error', reject)
    }
  )
}
