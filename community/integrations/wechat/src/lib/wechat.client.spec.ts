import { WechatClient } from './wechat.client.js'

describe('WechatClient', () => {
  const originalFetch = globalThis.fetch
  const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')
  const wavBytes = createWavBytes(1000)
  const wavBase64 = wavBytes.toString('base64')

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

    const result = await new WechatClient().sendText(
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

    const result = await new WechatClient().sendText(
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

  it('maps reverse tunnel sendText to wx2.0 v2 sendtext path and body', async () => {
    const tunnelBroker = {
      syncManagedClientScope: jest.fn(async () => undefined),
      sendHttpRequest: jest.fn(async () => ({
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({ code: 0, data: { newmsgid: 'msg-1' } })),
        text: JSON.stringify({ code: 0, data: { newmsgid: 'msg-1' } })
      }))
    }

    const result = await new WechatClient(tunnelBroker as any).sendText(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1',
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
    expect(tunnelBroker.sendHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        method: 'POST',
        path: '/v1/message/sendtext',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          token: 'token-1'
        }),
        body: JSON.stringify({
          uuid: 'uuid-1',
          contactid: 'wxid_friend',
          textcontent: 'hello',
          atusers: ['wxid_1']
        })
      })
    )
  })

  it('falls back to the legacy path through reverse tunnel when v2 sendtext fails', async () => {
    const tunnelBroker = {
      sendHttpRequest: jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          body: Buffer.from(JSON.stringify({ code: 500, message: 'failed' })),
          text: JSON.stringify({ code: 500, message: 'failed' })
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          body: Buffer.from(JSON.stringify({ code: 0, data: { newmsgid: 'msg-legacy' } })),
          text: JSON.stringify({ code: 0, data: { newmsgid: 'msg-legacy' } })
        })
    }

    const result = await new WechatClient(tunnelBroker as any).sendText(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'hello'
      }
    )

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'msg-legacy' }))
    expect(tunnelBroker.sendHttpRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clientId: 'client-1',
        path: '/message/SendTextMessage?key=uuid-1',
        body: JSON.stringify({
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
    )
  })

  it('maps wx2.0 account APIs through direct_http', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ code: 0, data: { ok: true } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const integration = {
      id: 'integration-1',
      options: {
        baseUrl: 'http://127.0.0.1:8058',
        apiVersion: '/v1/',
        apiToken: 'token-1'
      }
    } as any
    const client = new WechatClient()

    await client.bindDeviceKey(integration, { key: 'SDabc1234567' })
    await client.listDeviceAccounts(integration)
    await client.startDeviceLogin(integration, { uuid: 'SDabc1234567' })
    await client.pollDeviceLogin(integration, { uuid: 'SDabc1234567', sessionId: 'session-1' })
    await client.verifyLoginCode(integration, {
      uuid: 'SDabc1234567',
      code: '123456',
      data62: 'data62',
      ticket: 'ticket',
      sessionId: 'session-1'
    })
    await client.verifyLoginSlide(integration, {
      data62: 'data62',
      ticket: 'ticket',
      randstr: 'rand',
      slideticket: 'slide',
      sessionId: 'session-1'
    })
    await client.logoutDeviceAccount(integration, { uuid: 'SDabc1234567' })
    await client.deleteDeviceAccount(integration, { uuid: 'SDabc1234567' })

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8058/v1/account/bindkey',
      'http://127.0.0.1:8058/v1/account/getalluserlist',
      'http://127.0.0.1:8058/v1/account/getqrcode',
      'http://127.0.0.1:8058/v1/account/getscanuser',
      'http://127.0.0.1:8058/v1/account/verifylogincode',
      'http://127.0.0.1:8058/v1/account/verifyloginslide',
      'http://127.0.0.1:8058/v1/account/exitlogin',
      'http://127.0.0.1:8058/v1/account/deletekey'
    ])
    for (const call of calls) {
      expect(call.init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          token: 'token-1'
        })
      )
    }
    expect(calls.map((call) => JSON.parse(String(call.init.body)))).toEqual([
      { key: 'SDabc1234567' },
      {},
      { uuid: 'SDabc1234567' },
      { uuid: 'SDabc1234567', sessionId: 'session-1' },
      { uuid: 'SDabc1234567', code: '123456', data62: 'data62', ticket: 'ticket', sessionId: 'session-1' },
      { data62: 'data62', ticket: 'ticket', randstr: 'rand', slideticket: 'slide', sessionId: 'session-1' },
      { uuid: 'SDabc1234567' },
      { uuid: 'SDabc1234567' }
    ])
  })

  it('maps wx2.0 account APIs through reverse_tunnel http frames', async () => {
    const tunnelBroker = {
      syncManagedClientScope: jest.fn(async () => undefined),
      sendHttpRequest: jest.fn(async () => ({
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({ code: 0, data: { ok: true } })),
        text: JSON.stringify({ code: 0, data: { ok: true } })
      }))
    }

    const integration = {
      id: 'integration-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      options: {
        connectionMode: 'reverse_tunnel',
        tunnelClientId: 'client-1',
        apiVersion: '/v1/',
        apiToken: 'token-1'
      }
    } as any
    const client = new WechatClient(tunnelBroker as any)

    await client.bindDeviceKey(integration, { key: 'SDabc1234567' })
    await client.listDeviceAccounts(integration)
    await client.startDeviceLogin(integration, { uuid: 'SDabc1234567' })
    await client.pollDeviceLogin(integration, { uuid: 'SDabc1234567', sessionId: 'session-1' })
    await client.verifyLoginCode(integration, {
      uuid: 'SDabc1234567',
      code: '123456',
      data62: 'data62',
      ticket: 'ticket',
      sessionId: 'session-1'
    })
    await client.verifyLoginSlide(integration, {
      data62: 'data62',
      ticket: 'ticket',
      randstr: 'rand',
      slideticket: 'slide',
      sessionId: 'session-1'
    })
    await client.logoutDeviceAccount(integration, { uuid: 'SDabc1234567' })
    await client.deleteDeviceAccount(integration, { uuid: 'SDabc1234567' })

    const tunnelRequests = (
      tunnelBroker.sendHttpRequest.mock.calls as unknown as Array<[
        {
          path: string
          body: string
        }
      ]>
    ).map(([request]) => request)

    expect(tunnelRequests.map((request) => request.path)).toEqual([
      '/v1/account/bindkey',
      '/v1/account/getalluserlist',
      '/v1/account/getqrcode',
      '/v1/account/getscanuser',
      '/v1/account/verifylogincode',
      '/v1/account/verifyloginslide',
      '/v1/account/exitlogin',
      '/v1/account/deletekey'
    ])
    expect(tunnelBroker.sendHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          token: 'token-1'
        })
      })
    )
    expect(tunnelBroker.syncManagedClientScope).toHaveBeenCalledWith('client-1', {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      integrationId: 'integration-1',
      integrationName: 'integration-1'
    })
    expect(tunnelRequests.map((request) => JSON.parse(request.body))).toEqual([
      { key: 'SDabc1234567' },
      {},
      { uuid: 'SDabc1234567' },
      { uuid: 'SDabc1234567', sessionId: 'session-1' },
      { uuid: 'SDabc1234567', code: '123456', data62: 'data62', ticket: 'ticket', sessionId: 'session-1' },
      { data62: 'data62', ticket: 'ticket', randstr: 'rand', slideticket: 'slide', sessionId: 'session-1' },
      { uuid: 'SDabc1234567' },
      { uuid: 'SDabc1234567' }
    ])
  })

  it('maps sendImage to wx2.0 v2 sendimage body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ code: 0, data: { newmsgid: 'img-1' } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().sendImage(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058',
          apiVersion: '/v1/'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        imageContent: 'base64-image'
      }
    )

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'img-1' }))
    expect(calls[0].url).toBe('http://127.0.0.1:8058/v1/message/sendimage')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      imagecontent: 'base64-image'
    })
  })

  it('falls back to legacy endpoint when primary sendimage fails', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (calls.length === 1) {
        return new Response(JSON.stringify({ code: 500, message: 'failed' }), {
          status: 200
        })
      }
      return new Response(JSON.stringify({ code: 0, data: { newmsgid: 'img-legacy' } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().sendImage(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        imageContent: 'base64-image'
      }
    )

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'img-legacy' }))
    expect(calls[1].url).toBe('http://127.0.0.1:8058/message/SendImageMessage?key=uuid-1')
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      MsgItem: [
        {
          ToUserName: 'wxid_friend',
          ImageContent: 'base64-image',
          MsgType: 2
        }
      ]
    })
  })

  it('maps reverse tunnel sendImage to wx2.0 v2 sendimage path and body', async () => {
    const tunnelBroker = {
      sendHttpRequest: jest.fn(async () => ({
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({ code: 0, data: { newmsgid: 'img-1' } })),
        text: JSON.stringify({ code: 0, data: { newmsgid: 'img-1' } })
      }))
    }

    const result = await new WechatClient(tunnelBroker as any).sendImage(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1',
          apiVersion: '/v1/',
          apiToken: 'token-1'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        imageContent: 'base64-image'
      }
    )

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'img-1' }))
    expect(tunnelBroker.sendHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        method: 'POST',
        path: '/v1/message/sendimage',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          token: 'token-1'
        }),
        body: JSON.stringify({
          uuid: 'uuid-1',
          contactid: 'wxid_friend',
          imagecontent: 'base64-image'
        })
      })
    )
  })

  it('downloads inbound images through direct_http as Agent data URLs', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ code: 0, data: { filedata: pngBase64, filename: 'wx.png' } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadImage(
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
        newMsgId: 'new-1',
        msgContent: '<msg><img /></msg>',
        msgType: 3,
        fromUser: 'wxid_friend',
        toUser: 'wxid_owner',
        msgId: 123,
        isSelf: false,
        fileKey: 'file-key-1'
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        file: expect.objectContaining({
          fileUrl: `data:image/png;base64,${pngBase64}`,
          url: `data:image/png;base64,${pngBase64}`,
          mimeType: 'image/png',
          mimetype: 'image/png',
          originalName: 'wx.png',
          name: 'wx.png',
          fileKey: 'file-key-1',
          size: 8,
          extension: 'png'
        })
      })
    )
    expect(result.file).not.toHaveProperty('id')
    expect(calls[0].url).toBe('http://127.0.0.1:8058/v1/message/downloadfile')
    expect(calls[0].init.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        token: 'token-1'
      })
    )
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      uuid: 'uuid-1',
      newmsgid: 'new-1',
      msgcontent: '<msg><img /></msg>',
      msgtype: 3,
      contactid: 'wxid_friend',
      fromuser: 'wxid_friend',
      touser: 'wxid_owner',
      msgid: 123,
      isself: false,
      preferhd: true
    })
  })

  it('downloads inbound images through reverse_tunnel using the wx2.0 v2 path', async () => {
    const tunnelBroker = {
      sendHttpRequest: jest.fn(async () => ({
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({ code: 0, data: { filedata: pngBase64 } })),
        text: JSON.stringify({ code: 0, data: { filedata: pngBase64 } })
      }))
    }

    const result = await new WechatClient(tunnelBroker as any).downloadImage(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1',
          apiVersion: '/v1/',
          apiToken: 'token-1'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'new-1',
        msgContent: '',
        msgType: 3
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        file: expect.objectContaining({
          fileUrl: `data:image/png;base64,${pngBase64}`,
          url: `data:image/png;base64,${pngBase64}`,
          mimeType: 'image/png',
          mimetype: 'image/png',
          originalName: 'new-1.png',
          name: 'new-1.png',
          fileKey: 'new-1',
          size: 8,
          extension: 'png'
        })
      })
    )
    expect(result.file).not.toHaveProperty('id')
    expect(tunnelBroker.sendHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        method: 'POST',
        path: '/v1/message/downloadfile',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          token: 'token-1'
        }),
        body: JSON.stringify({
          uuid: 'uuid-1',
          newmsgid: 'new-1',
          msgcontent: '',
          msgtype: 3,
          contactid: 'wxid_friend',
          fromuser: undefined,
          touser: undefined,
          msgid: undefined,
          isself: undefined,
          preferhd: true
        })
      })
    )
  })

  it('falls back from HD image download to non-HD download', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (calls.length === 1) {
        return new Response(JSON.stringify({ code: 500, message: 'hd failed' }), {
          status: 200
        })
      }
      return new Response(JSON.stringify({ code: 0, data: { filedata: pngBase64 } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadImage(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'new-1',
        msgContent: '',
        msgType: 3
      }
    )

    expect(result.success).toBe(true)
    expect(JSON.parse(String(calls[0].init.body))).toEqual(expect.objectContaining({ preferhd: true }))
    expect(JSON.parse(String(calls[1].init.body))).toEqual(expect.objectContaining({ preferhd: false }))
    expect(result.file?.fileUrl).toBe(`data:image/png;base64,${pngBase64}`)
  })

  it('rejects downloaded inline content that is not an image', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(JSON.stringify({ code: 0, data: { filedata: Buffer.from('plain text').toString('base64') } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadImage(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'new-1',
        msgContent: '',
        msgType: 3,
        preferHd: false
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('non-image')
      })
    )
  })

  it('rejects downloaded inline images larger than 10MB', async () => {
    const bytes = Buffer.alloc(10 * 1024 * 1024 + 1)
    bytes[0] = 0xff
    bytes[1] = 0xd8
    bytes[2] = 0xff
    const oversizedBase64 = bytes.toString('base64')
    globalThis.fetch = jest.fn(async () => {
      return new Response(JSON.stringify({ code: 0, data: { filedata: oversizedBase64 } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadImage(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'new-1',
        msgContent: '',
        msgType: 3,
        preferHd: false
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('maximum is 10485760 bytes')
      })
    )
  })

  it('downloads inbound voice through direct_http as wav bytes', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (calls.length === 1) {
        return new Response(JSON.stringify({ code: 0, data: { fileext: 'silk', filename: 'voice.silk' } }), {
          status: 200
        })
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            offset: 0,
            total: wavBytes.length,
            length: wavBytes.length,
            filedata: wavBase64,
            done: true
          }
        }),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadVoice(
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
        newMsgId: 'voice-1',
        msgContent: '<msg><voicemsg /></msg>',
        msgType: 34,
        fromUser: 'wxid_friend',
        toUser: 'wxid_owner',
        msgId: 234,
        isSelf: false,
        fileKey: 'voice-key-1'
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        audio: expect.objectContaining({
          data: wavBytes,
          mimeType: 'audio/wav',
          originalName: 'voice.silk.wav',
          fileKey: 'voice-key-1',
          size: wavBytes.length,
          durationMs: 1000
        })
      })
    )
    expect(calls[0].url).toBe('http://127.0.0.1:8058/v1/message/downloadfile')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      uuid: 'uuid-1',
      newmsgid: 'voice-1',
      msgcontent: '<msg><voicemsg /></msg>',
      msgtype: 34,
      contactid: 'wxid_friend',
      fromuser: 'wxid_friend',
      touser: 'wxid_owner',
      msgid: 234,
      isself: false,
      preferhd: false
    })
    expect(calls[1].url).toBe('http://127.0.0.1:8058/v1/message/getmediafilechunk')
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      uuid: 'uuid-1',
      newmsgid: 'voice-1',
      variant: 'voice',
      offset: 0,
      length: 2 * 1024 * 1024
    })
  })

  it('downloads inbound voice through reverse_tunnel using the wx2.0 v2 paths', async () => {
    const tunnelBroker = {
      sendHttpRequest: jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          body: Buffer.from(JSON.stringify({ code: 0, data: { fileext: 'silk' } })),
          text: JSON.stringify({ code: 0, data: { fileext: 'silk' } })
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          body: Buffer.from(
            JSON.stringify({
              code: 0,
              data: {
                offset: 0,
                total: wavBytes.length,
                length: wavBytes.length,
                filedata: wavBase64,
                done: true
              }
            })
          ),
          text: JSON.stringify({
            code: 0,
            data: {
              offset: 0,
              total: wavBytes.length,
              length: wavBytes.length,
              filedata: wavBase64,
              done: true
            }
          })
        })
    }

    const result = await new WechatClient(tunnelBroker as any).downloadVoice(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1',
          apiVersion: '/v1/'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'voice-1',
        msgContent: '',
        msgType: 34
      }
    )

    expect(result.success).toBe(true)
    expect(tunnelBroker.sendHttpRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        clientId: 'client-1',
        method: 'POST',
        path: '/v1/message/downloadfile'
      })
    )
    expect(tunnelBroker.sendHttpRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clientId: 'client-1',
        method: 'POST',
        path: '/v1/message/getmediafilechunk',
        body: JSON.stringify({
          uuid: 'uuid-1',
          newmsgid: 'voice-1',
          variant: 'voice',
          offset: 0,
          length: 2 * 1024 * 1024
        })
      })
    )
  })

  it('adds compact diagnostics when wx2.0 rejects voice download', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          code: -2,
          message: 'GetMsgVoiceService err:server returned error -2 for chunk 1 at offset 0'
        }),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadVoice(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        newMsgId: 'voice-err-1',
        msgContent: '<msg><voicemsg bufid="buf-1" length="12345" voicelength="2400" voiceformat="4" /></msg>',
        msgType: 34,
        fromUser: 'room@chatroom',
        toUser: 'wxid_owner',
        msgId: 234,
        isSelf: false,
        bufId: 'buf-1',
        byteLength: 12345,
        durationMs: 2400,
        format: '4'
      }
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('GetMsgVoiceService err')
    expect(result.error).toContain('newMsgId=voice-err-1')
    expect(result.error).toContain('contactId=room@chatroom')
    expect(result.error).toContain('fromUser=room@chatroom')
    expect(result.error).toContain('toUser=wxid_owner')
    expect(result.error).toContain('msgId=234')
    expect(result.error).toContain('isSelf=false')
    expect(result.error).toContain('bufId=buf-1')
    expect(result.error).toContain('byteLength=12345')
    expect(result.error).toContain('durationMs=2400')
    expect(result.error).toContain('format=4')
    expect(result.error).toContain('hasVoiceXml=true')
    expect(result.error).toContain('msgContentLength=')
    expect(result.error).not.toContain('<voicemsg')
  })

  it('retries inbound voice download with persisted history when wx2.0 rejects webhook fields', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            code: -2,
            message: 'GetMsgVoiceService err:server returned error -2 for chunk 1 at offset 0'
          }),
          { status: 200 }
        )
      }
      if (calls.length === 2) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: [
              {
                newmsgid: '145217047247416769',
                msgid: 1227227219,
                msgtype: 34,
                content:
                  '<msg><voicemsg bufid="0" length="4173" voicelength="2440" voiceformat="4" /></msg>',
                fromuser: '52537859575@chatroom',
                touser: 'wxid_3xh67h1ukg5a12',
                isself: false
              }
            ]
          }),
          { status: 200 }
        )
      }
      if (calls.length === 3) {
        return new Response(JSON.stringify({ code: 0, data: { fileext: 'silk', filename: 'voice.silk' } }), {
          status: 200
        })
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            offset: 0,
            total: wavBytes.length,
            length: wavBytes.length,
            filedata: wavBase64,
            done: true
          }
        }),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadVoice(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: '52537859575@chatroom',
        newMsgId: '145217047247416770',
        msgContent: '<msg><voicemsg bufid="0" length="4173" voicelength="2440" voiceformat="4" /></msg>',
        msgType: 34,
        fromUser: '52537859575@chatroom',
        toUser: 'wxid_3xh67h1ukg5a12',
        msgId: 1227227219,
        isSelf: false,
        bufId: '0',
        byteLength: 4173,
        durationMs: 2440,
        format: '4'
      }
    )

    expect(result.success).toBe(true)
    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8058/v1/message/downloadfile',
      'http://127.0.0.1:8058/v1/message/listhistory',
      'http://127.0.0.1:8058/v1/message/downloadfile',
      'http://127.0.0.1:8058/v1/message/getmediafilechunk'
    ])
    expect(JSON.parse(String(calls[0].init.body))).toEqual(
      expect.objectContaining({
        newmsgid: '145217047247416770',
        bufid: '0',
        voicelen: 4173,
        voiceformat: '4'
      })
    )
    expect(JSON.parse(String(calls[2].init.body))).toEqual(
      expect.objectContaining({
        newmsgid: '145217047247416769',
        msgcontent: '<msg><voicemsg bufid="0" length="4173" voicelength="2440" voiceformat="4" /></msg>'
      })
    )
  })

  it('rejects AMR voice downloads without dispatchable wav bytes', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(JSON.stringify({ code: 0, data: { fileext: 'amr' } }), {
        status: 200
      })
    }) as unknown as typeof fetch

    const result = await new WechatClient().downloadVoice(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'voice-1',
        msgContent: '',
        msgType: 34
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('AMR')
      })
    )
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects voice downloads when the wav variant is missing', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { fileext: 'silk' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 1, message: '文件尚未就绪，请先调用 downloadfile' }), { status: 200 })) as unknown as typeof fetch

    const result = await new WechatClient().downloadVoice(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'voice-1',
        msgContent: '',
        msgType: 34
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('文件尚未就绪')
      })
    )
  })

  it('rejects voice messages longer than 60 seconds before calling wx2.0', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch

    const result = await new WechatClient().downloadVoice(
      {
        id: 'integration-1',
        options: {
          baseUrl: 'http://127.0.0.1:8058'
        }
      } as any,
      {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        newMsgId: 'voice-1',
        msgContent: '',
        msgType: 34,
        durationMs: 60001
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('exceeds maximum')
      })
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

function createWavBytes(durationMs: number): Buffer {
  const sampleRate = 8000
  const bitsPerSample = 16
  const channels = 1
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const dataSize = Math.floor((durationMs / 1000) * byteRate)
  const bytes = Buffer.alloc(44 + dataSize)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + dataSize, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(byteRate, 28)
  bytes.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  bytes.writeUInt16LE(bitsPerSample, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(dataSize, 40)
  return bytes
}
