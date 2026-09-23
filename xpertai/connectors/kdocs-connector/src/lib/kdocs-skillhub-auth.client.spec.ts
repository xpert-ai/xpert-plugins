import { KdocsConnectorError } from './errors.js'
import { KdocsSkillHubAuthClient } from './kdocs-skillhub-auth.client.js'

describe('KdocsSkillHubAuthClient', () => {
  afterEach(() => jest.restoreAllMocks())

  it('maps WPS code 202 to a pending result', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ code: 202 }))

    await expect(new KdocsSkillHubAuthClient().exchange('one-time-code')).resolves.toEqual({ status: 'pending' })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.wps.cn/office/v5/ai/skill_hub/wps_auth/exchange',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'one-time-code' }), redirect: 'error' })
    )
  })

  it('reads nested tokens and strips an accidental Bearer prefix', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      code: 200,
      data: { token: 'Bearer token-value', expires_in: '3600' }
    }))

    await expect(new KdocsSkillHubAuthClient().exchange('one-time-code')).resolves.toEqual({
      status: 'complete',
      accessToken: 'token-value',
      expiresIn: 3_600
    })
  })

  it('returns a stable error for a rejected authorization', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ code: 400006 }, 401))

    await expect(new KdocsSkillHubAuthClient().exchange('one-time-code')).resolves.toEqual({
      status: 'error',
      message: 'WPS authorization was rejected or has expired'
    })
  })

  it('rejects non-JSON authorization responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<html>error</html>'))

    await expect(new KdocsSkillHubAuthClient().exchange('one-time-code')).rejects
      .toEqual(expect.objectContaining<Partial<KdocsConnectorError>>({ code: 'AUTHORIZATION_RESPONSE_INVALID' }))
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
