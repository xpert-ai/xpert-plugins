import { WechatPersonalClient } from './wechat-personal.client.js'

describe('WechatPersonalClient', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('maps sendText to wx2.0 v2 sendtext body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ code: 0, data: { newmsgid: 'msg-1' } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatPersonalClient().sendText(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058',
          apiVersion: '/v1/',
          apiToken: 'token-1'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'hello',
        atUsers: ['wxid_1']
      }
    )

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'msg-1' }))
    expect(calls[0].url).toBe('http://127.0.0.1:8058/v1/message/sendtext')
    expect(calls[0].init.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        token: 'token-1'
      })
    )
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      textcontent: 'hello',
      atusers: ['wxid_1']
    })
  })

  it('falls back to legacy endpoint when primary sendtext fails', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (calls.length === 1) {
        return new Response(JSON.stringify({ code: 500, message: 'failed' }), {
          status: 200
        })
      }
      return new Response(JSON.stringify({ code: 0, data: { newmsgid: 'msg-legacy' } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatPersonalClient().sendText(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'hello'
      }
    )

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'msg-legacy' }))
    expect(calls[1].url).toBe('http://127.0.0.1:8058/message/SendTextMessage?key=uuid-1')
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      MsgItem: [
        {
          ToUserName: 'wxid_friend',
          TextContent: 'hello',
          MsgType: 1,
          AtWxIDList: []
        }
      ]
    })
  })
})
