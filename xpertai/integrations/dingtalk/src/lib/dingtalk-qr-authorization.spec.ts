import axios from 'axios'
import { beginDingTalkQrAuthorization, pollDingTalkQrAuthorization } from './dingtalk-qr-authorization.js'

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }))
jest.mock('./i18n.js', () => ({ translate: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

describe('DingTalk QR authorization', () => {
  const post = jest.mocked(axios.post)
  afterEach(() => jest.resetAllMocks())

  it('uses the official connector source and returns the provider polling interval', async () => {
    post.mockResolvedValueOnce({ data: { errcode: 0, nonce: 'nonce' } })
      .mockResolvedValueOnce({ data: { errcode: 0, device_code: 'device', verification_uri_complete: 'https://open-dev.dingtalk.com/openapp/registration/openClaw?user_code=code', expires_in: 7200, interval: 2 } })
    await expect(beginDingTalkQrAuthorization()).resolves.toMatchObject({ deviceCode: 'device', intervalSeconds: 2, expiresInSeconds: 7200 })
    expect(post.mock.calls[0][1]).toEqual({ source: 'DING_DWS_CLAW' })
    expect(post.mock.calls[1][1]).toEqual({ nonce: 'nonce' })
  })

  it('rejects an unexpected authorization host', async () => {
    post.mockResolvedValueOnce({ data: { errcode: 0, nonce: 'nonce' } })
      .mockResolvedValueOnce({ data: { errcode: 0, device_code: 'device', verification_uri_complete: 'https://example.com/', expires_in: 300 } })
    await expect(beginDingTalkQrAuthorization()).rejects.toThrow('invalid authorization URL')
  })

  it.each([['WAITING', 'waiting'], ['SCANNED', 'waiting'], ['EXPIRED', 'expired'], ['FAIL', 'failed']])('maps %s without exposing credentials', async (upstream, status) => {
    post.mockResolvedValue({ data: { errcode: 0, status: upstream } })
    await expect(pollDingTalkQrAuthorization('device')).resolves.toEqual({ status })
  })

  it('returns Stream credentials only after successful authorization', async () => {
    post.mockResolvedValue({ data: { errcode: 0, status: 'SUCCESS', client_id: 'ding-app', client_secret: 'private' } })
    await expect(pollDingTalkQrAuthorization('device')).resolves.toEqual({ status: 'authorized', options: { clientId: 'ding-app', clientSecret: 'private', robotCode: 'ding-app' } })
  })

  it('rejects missing credentials and never forwards upstream errors containing secrets', async () => {
    post.mockResolvedValueOnce({ data: { errcode: 0, status: 'SUCCESS', client_id: 'app' } })
    await expect(pollDingTalkQrAuthorization('device')).rejects.toThrow('without robot credentials')
    post.mockRejectedValueOnce(new Error('private device code'))
    await expect(pollDingTalkQrAuthorization('device')).rejects.toThrow('Unable to reach DingTalk')
  })
})
