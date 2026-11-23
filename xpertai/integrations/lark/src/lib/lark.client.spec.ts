import * as lark from '@larksuiteoapi/node-sdk'
import type { IIntegration } from '@xpert-ai/contracts'
import { LarkClient } from './lark.client.js'
import type { TLarkIntegrationConfig } from './types.js'

const mockListFiles = jest.fn()
const mockRawContent = jest.fn()

jest.mock('@larksuiteoapi/node-sdk', () => ({
  ...jest.requireActual<typeof import('@larksuiteoapi/node-sdk')>('@larksuiteoapi/node-sdk'),
  Client: jest.fn().mockImplementation(() => ({
    drive: { file: { list: mockListFiles } },
    docx: { document: { rawContent: mockRawContent } }
  }))
}))

describe('LarkClient', () => {
  let client: LarkClient

  beforeEach(() => {
    jest.clearAllMocks()
    client = new LarkClient({
      options: { appId: 'fixture-app', appSecret: 'fixture-secret', isLark: false }
    } as IIntegration<TLarkIntegrationConfig>)
  })

  it('configures the SDK from the integration without account environment variables', () => {
    expect(lark.Client).toHaveBeenCalledWith({
      appId: 'fixture-app', appSecret: 'fixture-secret',
      appType: lark.AppType.SelfBuild, domain: lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.debug
    })
  })

  it('returns the requested folder files', async () => {
    const files = [{ token: 'fixture-document', name: 'Review notes', type: 'docx' }]
    mockListFiles.mockResolvedValue({ code: 0, data: { files } })

    await expect(client.listDriveFiles('fixture-folder')).resolves.toEqual(files)
    expect(mockListFiles).toHaveBeenCalledWith({ params: { folder_token: 'fixture-folder' } })
  })

  it('returns raw content for the requested document', async () => {
    mockRawContent.mockResolvedValue({ code: 0, data: { content: 'Review notes' } })

    await expect(client.getDocumentContent('fixture-document')).resolves.toBe('Review notes')
    expect(mockRawContent).toHaveBeenCalledWith({
      params: { lang: 1 }, path: { document_id: 'fixture-document' }
    })
  })
})
