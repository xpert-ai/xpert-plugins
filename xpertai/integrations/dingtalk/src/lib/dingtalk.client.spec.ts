import axios from 'axios'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn()
  }
}))

import { DingTalkClient } from './dingtalk.client.js'

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
        responseType: 'arraybuffer'
      })
    )
  })
})
