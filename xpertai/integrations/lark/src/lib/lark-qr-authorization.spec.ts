import axios from 'axios'
import { beginLarkQrAuthorization, pollLarkQrAuthorization, larkQrIdentity } from './lark-qr-authorization.js'

jest.mock('axios')
const post = jest.mocked(axios.post)
const reply = (data: unknown) => post.mockResolvedValueOnce({ data })

describe('Feishu QR authorization', () => {
  beforeEach(() => post.mockReset())

  it('uses the official PersonalAgent registration and exposes no secret in the authorization URL', async () => {
    reply({ device_code: 'private-device', user_code: 'a&b', expire_in: 400, interval: 3 })
    expect(await beginLarkQrAuthorization()).toEqual({
      deviceCode: 'private-device',
      authorizationUrl: 'https://open.feishu.cn/page/cli?user_code=a%26b',
      expiresInSeconds: 400,
      intervalSeconds: 3
    })
    expect(post.mock.calls[0][0]).toBe('https://accounts.feishu.cn/oauth/v1/app/registration')
    expect(new URLSearchParams(String(post.mock.calls[0][1])).get('archetype')).toBe('PersonalAgent')
    expect(post.mock.calls[0][2]).toMatchObject({ timeout: 15000, maxRedirects: 0 })
  })

  it.each([
    ['authorization_pending', { status: 'waiting' }],
    ['slow_down', { status: 'waiting', intervalIncrementSeconds: 5 }],
    ['expired_token', { status: 'expired' }],
    ['invalid_grant', { status: 'expired' }],
    ['access_denied', { status: 'denied' }],
    ['unknown_error', { status: 'failed' }]
  ])('maps %s without exposing the upstream payload', async (error, expected) => {
    reply({ error, error_description: 'private' })
    expect(await pollLarkQrAuthorization('device')).toEqual(expected)
  })

  it('requires both credentials and enables long connection after authorization', async () => {
    reply({ client_id: 'app' })
    expect(await pollLarkQrAuthorization('device')).toEqual({ status: 'waiting' })
    reply({ client_id: 'app', client_secret: 'private' })
    expect(await pollLarkQrAuthorization('device')).toEqual({
      status: 'authorized',
      options: { appId: 'app', appSecret: 'private', isLark: false, connectionMode: 'long_connection' }
    })
  })

  it('uses only the fixed Lark endpoint for cross-brand discovery', async () => {
    reply({ user_info: { tenant_brand: 'lark' } })
    reply({ client_id: 'app', client_secret: 'private' })
    expect(await pollLarkQrAuthorization('device')).toMatchObject({ status: 'authorized', options: { isLark: true } })
    expect(post.mock.calls[1][0]).toBe('https://accounts.larksuite.com/oauth/v1/app/registration')
  })

  it('sanitizes malformed responses and transport errors', async () => {
    reply({ device_code: ['private'] })
    await expect(beginLarkQrAuthorization()).rejects.toThrow('temporarily unavailable')
    post.mockRejectedValueOnce(new Error('request included private-device'))
    await expect(pollLarkQrAuthorization('private-device')).rejects.toThrow('temporarily unavailable')
  })

  it('reuses the stable app identity within its brand', () => {
    expect(larkQrIdentity({ appId: 'app' })).toBe('feishu:app')
    expect(larkQrIdentity({ appId: 'app', isLark: true })).toBe('lark:app')
    expect(larkQrIdentity({ appSecret: 'secret' })).toBeNull()
  })
})
