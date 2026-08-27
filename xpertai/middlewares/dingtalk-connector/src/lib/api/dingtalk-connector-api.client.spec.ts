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

  it('maps member summaries and omits provider mobile and token fields', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        errcode: 0,
        result: {
          list: [
            {
              userid: 'user-1',
              name: 'User One',
              title: 'Engineer',
              dept_id_list: [2],
              mobile: '13800000000',
              access_token: 'provider-secret'
            }
          ],
          has_more: true,
          next_cursor: 20
        }
      })
    )
    const client = new DingTalkConnectorApiClient()

    const result = await client.listDepartmentMembers({
      appAccessToken: 'app-token',
      departmentId: 2,
      cursor: 0,
      limit: 20,
      language: 'zh_CN'
    })

    expect(result).toEqual({
      items: [{ userId: 'user-1', name: 'User One', title: 'Engineer', departmentIds: [2] }],
      hasMore: true,
      nextCursor: 20
    })
    expect(JSON.stringify(result)).not.toContain('13800000000')
    expect(JSON.stringify(result)).not.toContain('provider-secret')
    expect(fetchMock.mock.calls[0][0].toString()).toContain('/topapi/v2/user/list')
  })

  it('sends one confirmed user message with an app token header', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ processQueryKey: 'message-1' }))
    const client = new DingTalkConnectorApiClient()

    await expect(
      client.sendMessage({
        appAccessToken: 'app-token',
        robotCode: 'robot-code',
        recipientType: 'user_id',
        recipientId: 'user-1',
        format: 'text',
        content: 'Hello'
      })
    ).resolves.toEqual({ messageId: 'message-1' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-acs-dingtalk-access-token': 'app-token' }),
        body: JSON.stringify({
          robotCode: 'robot-code',
          userIds: ['user-1'],
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content: 'Hello' })
        })
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
