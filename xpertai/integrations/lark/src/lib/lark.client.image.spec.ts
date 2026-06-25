import { Readable } from 'node:stream'
import type { IIntegration } from '@metad/contracts'
import type { XpFileSystem } from '@xpert-ai/plugin-sdk'
import { LarkClient } from './lark.client.js'
import type { TLarkIntegrationConfig } from './types.js'

type LarkClientWithImages = LarkClient & {
  getDocumentImages: (
    docToken: string,
    fileSystem?: XpFileSystem,
    baseFolder?: string
  ) => Promise<
    Array<{
      type: 'image'
      url: string
      filePath: string
      token: string
      caption?: string
      width?: number
      height?: number
    }>
  >
}

describe('LarkClient document images', () => {
  it('downloads docx image blocks into the provided file system', async () => {
    const client = new LarkClient(createIntegration()) as LarkClientWithImages
    const sdkClient = {
      docx: {
        documentBlock: {
          list: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              items: [
                {
                  block_id: 'block-image',
                  image: {
                    token: 'img-token',
                    width: 640,
                    height: 480,
                    caption: {
                      content: '报错截图'
                    }
                  }
                }
              ],
              has_more: false
            }
          })
        }
      },
      drive: {
        media: {
          batchGetTmpDownloadUrl: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              tmp_download_urls: [
                {
                  file_token: 'img-token',
                  tmp_download_url: 'https://tmp.example/img-token'
                }
              ]
            }
          }),
          download: jest.fn().mockResolvedValue({
            getReadableStream: () => Readable.from([new Uint8Array(Buffer.from('image-bytes'))]),
            headers: {
              'content-type': 'image/png'
            }
          })
        }
      }
    }
    Reflect.set(client, 'client', sdkClient)

    const fileSystem = {
      writeFile: jest.fn().mockResolvedValue('http://localhost/files/kb/doc-1/images/img-token.png')
    } as unknown as XpFileSystem

    const images = await client.getDocumentImages('doc-token', fileSystem, 'kb/doc-1')

    expect(sdkClient.docx.documentBlock.list).toHaveBeenCalledWith({
      path: { document_id: 'doc-token' },
      params: { page_size: 500 }
    })
    expect(sdkClient.drive.media.batchGetTmpDownloadUrl).not.toHaveBeenCalled()
    expect(sdkClient.drive.media.download).toHaveBeenCalledWith({
      path: { file_token: 'img-token' }
    })
    expect(fileSystem.writeFile).toHaveBeenCalledWith('kb/doc-1/images/img-token.png', Buffer.from('image-bytes'))
    expect(images).toEqual([
      {
        type: 'image',
        url: 'http://localhost/files/kb/doc-1/images/img-token.png',
        filePath: 'kb/doc-1/images/img-token.png',
        token: 'img-token',
        sourceUrl: undefined,
        blockId: 'block-image',
        caption: '报错截图',
        width: 640,
        height: 480,
        mimeType: 'image/png'
      }
    ])
  })

  it('uses temporary media URLs when no file system is provided', async () => {
    const client = new LarkClient(createIntegration()) as LarkClientWithImages
    const sdkClient = {
      docx: {
        documentBlock: {
          list: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              items: [
                {
                  block_id: 'block-image',
                  image: {
                    token: 'img-token'
                  }
                }
              ],
              has_more: false
            }
          })
        }
      },
      drive: {
        media: {
          batchGetTmpDownloadUrl: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              tmp_download_urls: [
                {
                  file_token: 'img-token',
                  tmp_download_url: 'https://tmp.example/img-token'
                }
              ]
            }
          }),
          download: jest.fn()
        }
      }
    }
    Reflect.set(client, 'client', sdkClient)

    const images = await client.getDocumentImages('doc-token')

    expect(sdkClient.drive.media.batchGetTmpDownloadUrl).toHaveBeenCalledWith({
      params: { file_tokens: ['img-token'] }
    })
    expect(sdkClient.drive.media.download).not.toHaveBeenCalled()
    expect(images).toEqual([
      expect.objectContaining({
        url: 'https://tmp.example/img-token',
        filePath: 'https://tmp.example/img-token',
        sourceUrl: 'https://tmp.example/img-token'
      })
    ])
  })
})

function createIntegration(): IIntegration<TLarkIntegrationConfig> {
  return {
    options: {
      appId: 'app-id',
      appSecret: 'app-secret',
      isLark: false
    }
  } as IIntegration<TLarkIntegrationConfig>
}
