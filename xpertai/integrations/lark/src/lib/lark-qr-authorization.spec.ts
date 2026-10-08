import axios from 'axios'
import { gunzipSync } from 'node:zlib'
import { beginLarkQrAuthorization, LARK_QR_SCOPES, pollLarkQrAuthorization, validateLarkQrApp } from './lark-qr-authorization.js'

jest.mock('axios')
jest.mock('./i18n.js', () => ({
  translate: (_key: string, options: { defaultValue: string; [key: string]: unknown }) =>
    options.defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(options[key]))
}))

const post = jest.mocked(axios.post)
const get = jest.mocked(axios.get)
const registration = {
  device_code: 'private-device-code',
  verification_uri_complete: 'https://open.feishu.cn/page/launcher?user_code=public-code',
  expires_in: 600,
  interval: 5
}
const app = {
  scopes: LARK_QR_SCOPES.map((scope) => ({ scope, token_types: ['tenant'] })),
  event: { subscription_type: 'websocket', subscribed_events: ['im.message.receive_v1'] },
  callback_info: { callback_type: 'websocket', subscribed_callbacks: ['card.action.trigger'] }
}

beforeEach(() => jest.resetAllMocks())

it('opens the Feishu app picker with explicit app permissions, events and callbacks', async () => {
  post.mockResolvedValue({ data: registration })
  const result = await beginLarkQrAuthorization()
  expect(post).toHaveBeenCalledWith(
    'https://accounts.feishu.cn/oauth/v1/app/registration',
    new URLSearchParams({ action: 'begin', archetype: 'PersonalAgent', auth_method: 'client_secret', request_user_info: 'open_id tenant_brand' }).toString(),
    expect.objectContaining({ timeout: 15000, maxRedirects: 0 })
  )
  const url = new URL(result.authorizationUrl)
  expect(url.searchParams.get('source')).toBe('node-sdk/xpert')
  expect(url.searchParams.get('clientID')).toBeNull()
  expect(url.searchParams.get('createOnly')).toBeNull()
  expect(url.searchParams.get('user_code')).toBe('public-code')
  expect(JSON.parse(gunzipSync(Buffer.from(url.searchParams.get('addons')!, 'base64url')).toString())).toEqual({
    preset: false,
    scopes: { tenant: LARK_QR_SCOPES, user: [] },
    events: { items: { tenant: ['im.message.receive_v1'], user: [] } },
    callbacks: { items: ['card.action.trigger'] }
  })
  expect(result).toMatchObject({ deviceCode: registration.device_code, intervalSeconds: 5, expiresInSeconds: 600 })
  expect(result.authorizationUrl).not.toContain(registration.device_code)
})

it('keeps the app picker when reconnecting a bound integration', async () => {
  post.mockResolvedValue({ data: registration })
  const result = await beginLarkQrAuthorization()
  const url = new URL(result.authorizationUrl)
  expect(url.searchParams.get('clientID')).toBeNull()
  expect(url.searchParams.get('createOnly')).toBeNull()
})

it('keeps international Lark on the app picker flow', async () => {
  post.mockResolvedValue({ data: registration })
  const result = await beginLarkQrAuthorization()
  const url = new URL(result.authorizationUrl)
  expect(url.searchParams.get('clientID')).toBeNull()
  expect(url.searchParams.get('createOnly')).toBeNull()
})

it.each([undefined, 300])('accepts the official expiration fallback (%s)', async (expireIn) => {
  post.mockResolvedValue({ data: { ...registration, interval: undefined, expires_in: undefined, expire_in: expireIn } })
  expect(await beginLarkQrAuthorization()).toMatchObject({ expiresInSeconds: expireIn ?? 600, intervalSeconds: 5 })
})

it.each(['http://open.feishu.cn/page/launcher', 'https://open.feishu.cn.evil.test/', 'https://secret@open.feishu.cn/', 'https://open.feishu.cn:8443/'])('rejects unsafe authorization URL %s', async (url) => {
  post.mockResolvedValue({ data: { ...registration, verification_uri_complete: url } })
  await expect(beginLarkQrAuthorization()).rejects.toThrow('invalid authorization URL')
})

it.each([
  ['authorization_pending', { status: 'waiting' }],
  ['slow_down', { status: 'waiting', intervalIncrementSeconds: 5 }],
  ['access_denied', { status: 'denied' }],
  ['expired_token', { status: 'expired' }],
  ['invalid_request', { status: 'failed' }]
])('handles HTTP 400 OAuth result %s without leaking the provider error', async (error, expected) => {
  post.mockResolvedValue({ status: 400, data: { error, error_description: 'private-device-code and secret' } })
  expect(await pollLarkQrAuthorization('private-device-code')).toEqual(expected)
  const config = post.mock.calls[0][2]!
  expect(config.validateStatus!(400)).toBe(true)
  expect(config.validateStatus!(500)).toBe(false)
})

it('returns only server-side bot credentials and long connection options after consent', async () => {
  post.mockResolvedValue({ data: { client_id: 'cli_bot', client_secret: 'secret', user_info: { tenant_brand: 'feishu', open_id: 'user' } } })
  expect(await pollLarkQrAuthorization('private-device-code')).toEqual({
    status: 'authorized',
    options: { appId: 'cli_bot', appSecret: 'secret', isLark: false, connectionMode: 'long_connection', setupSource: 'qr' }
  })
  expect(post.mock.calls[0][1]).toBe('action=poll&device_code=private-device-code')
})

it.each([
  {},
  { client_id: 'cli_bot' },
  { client_id: 'cli_bot', client_secret: ' ' },
  { client_id: 'cli_bot', client_secret: 'secret', user_info: { tenant_brand: 'lark' } },
  { client_id: 'cli_bot', client_secret: 'secret', error: 'invalid_request' }
])('does not authorize malformed, incomplete or international responses', async (data) => {
  post.mockResolvedValue({ data })
  expect(await pollLarkQrAuthorization('private-device-code')).toEqual({ status: 'failed' })
  expect(post).toHaveBeenCalledTimes(1)
})

it('sanitizes network and malformed begin failures', async () => {
  post.mockRejectedValueOnce(new Error('private-device-code secret'))
  await expect(pollLarkQrAuthorization('private-device-code')).rejects.toThrow('Unable to reach Feishu')
  post.mockResolvedValueOnce({ data: { error_description: 'secret' } })
  await expect(beginLarkQrAuthorization()).rejects.toThrow('Feishu QR authorization is unavailable')
})

it('checks the current app subscriptions and tenant permissions before saving a QR integration', async () => {
  get.mockResolvedValue({ status: 200, data: { code: 0, data: { app } } })
  await expect(validateLarkQrApp('tenant-secret')).resolves.toBeUndefined()
  expect(get).toHaveBeenCalledWith('https://open.feishu.cn/open-apis/application/v6/applications/me', {
    params: { lang: 'en_us' }, headers: { Authorization: 'Bearer tenant-secret' }, timeout: 10000, maxRedirects: 0,
    validateStatus: expect.any(Function)
  })
})

it('reads published event IDs when the app response omits event configuration', async () => {
  get.mockResolvedValueOnce({ status: 200, data: { code: 0, data: { app: {
    ...app, app_id: 'cli_bot', online_version_id: 'version-live', event: undefined
  } } } })
  get.mockResolvedValueOnce({ status: 200, data: { code: 0, data: { app_version: {
    events: ['接收消息'], event_infos: [{ event_type: 'im.message.receive_v1', event_name: '接收消息' }]
  } } } })
  await expect(validateLarkQrApp('tenant-secret')).resolves.toBeUndefined()
  expect(get).toHaveBeenNthCalledWith(2,
    'https://open.feishu.cn/open-apis/application/v6/applications/cli_bot/app_versions/version-live',
    expect.objectContaining({ params: { lang: 'en_us' }, headers: { Authorization: 'Bearer tenant-secret' } })
  )
})

it.each([undefined, [{ event_type: 'unrelated.event', event_name: 'im.message.receive_v1' }]])(
  'does not accept display names as proof of a published message subscription', async (eventInfos) => {
    get.mockResolvedValueOnce({ status: 200, data: { code: 0, data: { app: {
      ...app, app_id: 'cli_bot', online_version_id: 'version-live', event: undefined
    } } } })
    get.mockResolvedValueOnce({ status: 200, data: { code: 0, data: { app_version: {
      events: ['im.message.receive_v1'], event_infos: eventInfos
    } } } })
    await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow('im.message.receive_v1')
  }
)

it('rejects explicit webhook mode even when a published version is available', async () => {
  get.mockResolvedValue({ status: 200, data: { code: 0, data: { app: {
    ...app, app_id: 'cli_bot', online_version_id: 'version-live', event: { ...app.event, subscription_type: 'webhook' }
  } } } })
  await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow('im.message.receive_v1')
  expect(get).toHaveBeenCalledTimes(1)
})

it('does not skip a failed published-version query', async () => {
  get.mockResolvedValueOnce({ status: 200, data: { code: 0, data: { app: {
    ...app, app_id: 'cli_bot', online_version_id: 'version-live', event: undefined
  } } } })
  get.mockResolvedValueOnce({ status: 403, data: { code: 99991672, msg: 'tenant-secret' } })
  await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow('HTTP 403, code 99991672')
})

it.each([
  [{ ...app, scopes: [] }, 'app permissions: im:message.p2p_msg:readonly'],
  [{ ...app, scopes: LARK_QR_SCOPES.map((scope) => ({ scope, token_types: ['user'] })) }, 'app permissions:'],
  [{ ...app, event: { ...app.event, subscription_type: 'webhook' } }, 'im.message.receive_v1'],
  [{ ...app, event: { ...app.event, subscribed_events: [] } }, 'im.message.receive_v1'],
  [{ ...app, event: undefined }, 'im.message.receive_v1'],
  [{ ...app, callback_info: { ...app.callback_info, subscribed_callbacks: [] } }, 'card.action.trigger'],
  [{ ...app, callback_info: { ...app.callback_info, callback_type: 'webhook' } }, 'card.action.trigger'],
  [{ ...app, callback_info: undefined }, 'card.action.trigger']
])('identifies the missing app configuration without bypassing validation', async (data, reason) => {
  get.mockResolvedValue({ status: 200, data: { code: 0, data: { app: data } } })
  await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow(reason)
})

it('sanitizes configuration API errors and accepts the callback response field', async () => {
  get.mockRejectedValueOnce(new Error('tenant-secret'))
  await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow('Unable to reach Feishu to verify the app')
  get.mockResolvedValueOnce({ status: 200, data: { code: 0, data: { app: { ...app, callback_info: undefined, callback: app.callback_info } } } })
  await expect(validateLarkQrApp('tenant-secret')).resolves.toBeUndefined()
})

it.each([200, 400])('reports numeric API failure details for HTTP %s without exposing provider secrets', async (status) => {
  get.mockResolvedValue({ status, data: { code: 99991672, msg: 'tenant-secret', error: { token: 'tenant-secret' } } })
  await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow(
    `Feishu app verification failed (HTTP ${status}, code 99991672). Please check the app self-management permission and retry.`
  )
})

it('distinguishes malformed responses from missing permissions', async () => {
  get.mockResolvedValue({ status: 200, data: { code: 0, data: { secret: 'tenant-secret' } } })
  await expect(validateLarkQrApp('tenant-secret')).rejects.toThrow('incomplete or unsupported app information')
})
