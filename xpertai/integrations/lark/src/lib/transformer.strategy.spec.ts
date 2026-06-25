import type { IIntegration, IKnowledgeDocument } from '@metad/contracts'
import type { TDocumentTransformerConfig } from '@xpert-ai/plugin-sdk'
import { LarkClient } from './lark.client.js'
import { LarkDocTransformerStrategy } from './transformer.strategy.js'
import type { LarkDocumentMetadata, TLarkIntegrationConfig } from './types.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  DocumentTransformerStrategy: () => () => undefined
}))

type FileSystemPermissionStub = NonNullable<TDocumentTransformerConfig['permissions']>['fileSystem']

describe('LarkDocTransformerStrategy', () => {
  let strategy: LarkDocTransformerStrategy

  beforeEach(() => {
    strategy = new LarkDocTransformerStrategy()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(LarkClient.prototype, 'getDocumentImages')
  })

  it('replaces docx image placeholders with downloaded images in order', async () => {
    const fileSystem = {
      writeFile: jest.fn()
    } as unknown as FileSystemPermissionStub
    const imageAssets = [
      {
        type: 'image' as const,
        url: 'http://localhost/files/kb/doc-1/images/img-token-1.png',
        filePath: 'kb/doc-1/images/img-token-1.png',
        token: 'img-token-1',
        caption: '报错截图'
      },
      {
        type: 'image' as const,
        url: 'http://localhost/files/kb/doc-1/images/img-token-2.png',
        filePath: 'kb/doc-1/images/img-token-2.png',
        token: 'img-token-2',
        caption: '处理结果'
      },
      {
        type: 'image' as const,
        url: 'http://localhost/files/kb/doc-1/images/img-token-3.png',
        filePath: 'kb/doc-1/images/img-token-3.png',
        token: 'img-token-3'
      }
    ]
    const getDocumentImages = jest.fn().mockResolvedValue(imageAssets)

    Object.defineProperty(LarkClient.prototype, 'getDocumentImages', {
      configurable: true,
      value: getDocumentImages
    })
    jest.spyOn(LarkClient.prototype, 'getDocumentContent').mockResolvedValue(
      '报错界面\nimage.png\n报错原因\nimage.png\n处理方案'
    )

    const [result] = await strategy.transformDocuments(
      [
        {
          id: 'doc-1',
          folder: 'kb/doc-1',
          metadata: {
            token: 'doc-token'
          }
        } as Partial<IKnowledgeDocument<LarkDocumentMetadata>>
      ],
      {
        stage: 'prod',
        permissions: {
          integration: createIntegration(),
          fileSystem
        }
      }
    )

    expect(getDocumentImages).toHaveBeenCalledWith('doc-token', fileSystem, 'kb/doc-1')
    expect(result.chunks?.[0].pageContent).toBe(
      [
        '报错界面',
        '![报错截图](http://localhost/files/kb/doc-1/images/img-token-1.png)',
        '报错原因',
        '![处理结果](http://localhost/files/kb/doc-1/images/img-token-2.png)',
        '处理方案',
        '![image](http://localhost/files/kb/doc-1/images/img-token-3.png)'
      ].join('\n')
    )
    expect(result.metadata?.assets).toEqual(imageAssets)
    expect(result.chunks?.[0].metadata.assets).toEqual(imageAssets)
  })

  it('keeps text content when docx image extraction fails', async () => {
    const getDocumentImages = jest.fn().mockRejectedValue('### Lark API Error: params error')

    Object.defineProperty(LarkClient.prototype, 'getDocumentImages', {
      configurable: true,
      value: getDocumentImages
    })
    jest.spyOn(LarkClient.prototype, 'getDocumentContent').mockResolvedValue('报错界面\n报错原因')

    const [result] = await strategy.transformDocuments(
      [
        {
          id: 'doc-1',
          folder: 'kb/doc-1',
          metadata: {
            token: 'doc-token'
          }
        } as Partial<IKnowledgeDocument<LarkDocumentMetadata>>
      ],
      {
        stage: 'prod',
        permissions: {
          integration: createIntegration()
        }
      }
    )

    expect(getDocumentImages).toHaveBeenCalledWith('doc-token', undefined, 'kb/doc-1')
    expect(result.chunks?.[0].pageContent).toBe('报错界面\n报错原因')
    expect(result.metadata?.assets).toEqual([])
    expect(result.metadata?.imageAssetError).toContain('params error')
    expect(result.chunks?.[0].metadata.imageAssetError).toContain('params error')
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
