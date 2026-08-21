import axios from 'axios'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn()
  }
}))

import { DingTalkClient } from './dingtalk.client.js'
import { DINGTALK_MAX_FILE_BYTES } from './types.js'

describe('DingTalkClient', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('downloads robot message files using downloadCode and robotCode', async () => {
    const http = {
      post: jest.fn().mockResolvedValue({
        data: {
          accessToken: 'access-token',
          expireIn: 7200
        }
      }),
      request: jest.fn().mockResolvedValue({
        data: {
          downloadUrl: 'https://download.example/photo.png',
          fileName: 'photo.png'
        }
      }),
      get: jest.fn().mockResolvedValue({
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        headers: {
          'content-type': 'image/png'
        }
      })
    }
    mockedAxios.create.mockReturnValue(http as any)

    const client = new DingTalkClient({
      id: 'integration-1',
      provider: 'dingtalk',
      options: {
        clientId: 'app-key',
        clientSecret: 'app-secret',
        robotCode: 'configured-robot-code'
      }
    } as any)

    await expect(
      client.downloadMessageFile({
        downloadCode: 'download-code-1',
        robotCode: 'robot-code-1'
      })
    ).resolves.toEqual({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png',
      fileName: 'photo.png'
    })
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.dingtalk.com/v1.0/robot/messageFiles/download',
        method: 'POST',
        data: {
          downloadCode: 'download-code-1',
          robotCode: 'robot-code-1'
        }
      })
    )
    expect(http.get).toHaveBeenCalledWith(
      'https://download.example/photo.png',
      expect.objectContaining({
        responseType: 'arraybuffer',
        maxContentLength: DINGTALK_MAX_FILE_BYTES
      })
    )
  })

  it('uploads files as DingTalk media with the legacy app token', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          access_token: 'legacy-access-token'
        }
      }),
      post: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          media_id: 'media-1',
          type: 'file',
          created_at: 123
        }
      })
    }
    mockedAxios.create.mockReturnValue(http as any)

    const client = new DingTalkClient({
      id: 'integration-1',
      provider: 'dingtalk',
      options: {
        clientId: 'app-key',
        clientSecret: 'app-secret',
        robotCode: 'robot-code-1'
      }
    } as any)

    await expect(
      client.uploadMediaFile({
        buffer: Buffer.from('report bytes'),
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        timeoutMs: 1000
      })
    ).resolves.toEqual({
      mediaId: 'media-1',
      type: 'file',
      createdAt: 123
    })
    expect(http.get).toHaveBeenCalledWith('https://oapi.dingtalk.com/gettoken', {
      params: {
        appkey: 'app-key',
        appsecret: 'app-secret'
      }
    })
    expect(http.post).toHaveBeenCalledWith('https://oapi.dingtalk.com/media/upload', expect.any(FormData), {
      params: {
        access_token: 'legacy-access-token',
        type: 'file'
      },
      timeout: 1000,
      maxBodyLength: Infinity
    })
    const form = http.post.mock.calls[0][1] as FormData
    const media = form.get('media') as File
    expect(media.name).toBe('report.pdf')
    expect(media.type).toBe('application/pdf')
    expect(media.size).toBe(Buffer.byteLength('report bytes'))
  })

  it('uploads images with the DingTalk image media type', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          access_token: 'legacy-access-token'
        }
      }),
      post: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          media_id: 'media-image-1',
          type: 'image',
          created_at: 123
        }
      })
    }
    mockedAxios.create.mockReturnValue(http as any)

    const client = new DingTalkClient({
      id: 'integration-1',
      provider: 'dingtalk',
      options: {
        clientId: 'app-key',
        clientSecret: 'app-secret',
        robotCode: 'robot-code-1'
      }
    } as any)

    await expect(
      client.uploadMediaFile({
        buffer: Buffer.from('image bytes'),
        fileName: 'chart.png',
        mimeType: 'image/png',
        mediaType: 'image'
      })
    ).resolves.toEqual({
      mediaId: 'media-image-1',
      type: 'image',
      createdAt: 123
    })
    expect(http.post).toHaveBeenCalledWith('https://oapi.dingtalk.com/media/upload', expect.any(FormData), {
      params: {
        access_token: 'legacy-access-token',
        type: 'image'
      },
      timeout: 15_000,
      maxBodyLength: Infinity
    })
  })

  it('exchanges an H5 authorization code for a typed DingTalk employee identity', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          access_token: 'legacy-access-token'
        }
      }),
      post: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          result: {
            userid: 'employee-1',
            unionid: 'union-1',
            name: 'Employee One'
          }
        }
      })
    }
    mockedAxios.create.mockReturnValue(http as any)

    const client = new DingTalkClient({
      id: 'integration-1',
      provider: 'dingtalk',
      options: {
        clientId: 'app-key',
        clientSecret: 'app-secret',
        corpId: 'corp-1'
      }
    } as any)

    await expect(client.exchangeAuthorizationCode('auth-code-1')).resolves.toEqual({
      provider: 'dingtalk',
      externalOrganizationId: 'corp-1',
      subjectId: 'employee-1',
      displayName: 'Employee One',
      accountBinding: {
        provider: 'dingtalk-sso',
        subjectId: 'union-1'
      }
    })
    expect(http.post).toHaveBeenCalledWith(
      'https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=legacy-access-token',
      { code: 'auth-code-1' },
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json'
        }
      })
    )
  })

  it('leaves account binding unresolved when DingTalk omits unionid', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({ data: { errcode: 0, access_token: 'legacy-access-token' } }),
      post: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          result: {
            userid: 'employee-1',
            name: 'Employee One'
          }
        }
      })
    }
    mockedAxios.create.mockReturnValue(http as any)

    const client = new DingTalkClient({
      id: 'integration-1',
      provider: 'dingtalk',
      options: {
        clientId: 'app-key',
        clientSecret: 'app-secret',
        corpId: 'corp-1'
      }
    } as any)

    await expect(client.exchangeAuthorizationCode('auth-code-1')).resolves.toEqual({
      provider: 'dingtalk',
      externalOrganizationId: 'corp-1',
      subjectId: 'employee-1',
      displayName: 'Employee One'
    })
  })

  it('rejects an authorization response without an explicit userid', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          access_token: 'legacy-access-token'
        }
      }),
      post: jest.fn().mockResolvedValue({
        data: {
          errcode: 0,
          result: {}
        }
      })
    }
    mockedAxios.create.mockReturnValue(http as any)

    const client = new DingTalkClient({
      id: 'integration-1',
      provider: 'dingtalk',
      options: {
        clientId: 'app-key',
        clientSecret: 'app-secret',
        corpId: 'corp-1'
      }
    } as any)

    await expect(client.exchangeAuthorizationCode('auth-code-1')).rejects.toThrow(
      'Missing userid in DingTalk authorization response'
    )
  })
})
