import type { IIntegration } from '@metad/contracts'
import { LarkClient } from './lark.client.js'
import { LarkSourceStrategy, normalizeLarkDocxToken } from './source.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  DocumentSourceStrategy: () => () => undefined
}))

describe('LarkSourceStrategy', () => {
  let strategy: LarkSourceStrategy

  beforeEach(() => {
    strategy = new LarkSourceStrategy()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    ['XBundSI8Tobjttxe2Qec1UYwnlc', 'XBundSI8Tobjttxe2Qec1UYwnlc'],
    ['docx/XBundSI8Tobjttxe2Qec1UYwnlc', 'XBundSI8Tobjttxe2Qec1UYwnlc'],
    ['https://my.feishu.cn/docx/XBundSI8Tobjttxe2Qec1UYwnlc?from=from_copylink', 'XBundSI8Tobjttxe2Qec1UYwnlc']
  ])('normalizes docx token from %s', (input, expected) => {
    expect(normalizeLarkDocxToken(input)).toBe(expected)
  })

  it('loads a single docx document from documentId without listing folder files', async () => {
    const listDriveFiles = jest.spyOn(LarkClient.prototype, 'listDriveFiles')

    const documents = await strategy.loadDocuments(
      {
        documentId: 'https://my.feishu.cn/docx/XBundSI8Tobjttxe2Qec1UYwnlc?from=from_copylink',
        types: ['docx']
      },
      { integration: createIntegration() }
    )

    expect(listDriveFiles).not.toHaveBeenCalled()
    expect(documents).toHaveLength(1)
    expect(documents[0].id).toBe('XBundSI8Tobjttxe2Qec1UYwnlc')
    expect(documents[0].metadata).toEqual(
      expect.objectContaining({
        token: 'XBundSI8Tobjttxe2Qec1UYwnlc',
        type: 'docx',
        chunkId: 'XBundSI8Tobjttxe2Qec1UYwnlc',
        title: 'Lark Document XBundSI8Tobjttxe2Qec1UYwnlc'
      })
    )
  })

  it('keeps folder loading behavior and filters by configured document types', async () => {
    const listDriveFiles = jest.spyOn(LarkClient.prototype, 'listDriveFiles').mockResolvedValue([
      {
        token: 'docx-token',
        name: 'Docx file',
        type: 'docx',
        url: 'https://my.feishu.cn/docx/docx-token',
        created_time: '1710000000'
      },
      {
        token: 'sheet-token',
        name: 'Sheet file',
        type: 'sheet'
      }
    ])

    const documents = await strategy.loadDocuments(
      {
        folderToken: 'folder-token',
        types: ['docx']
      },
      { integration: createIntegration() }
    )

    expect(listDriveFiles).toHaveBeenCalledWith('folder-token')
    expect(documents).toHaveLength(1)
    expect(documents[0].id).toBe('docx-token')
    expect(documents[0].metadata).toEqual(
      expect.objectContaining({
        token: 'docx-token',
        title: 'Docx file',
        url: 'https://my.feishu.cn/docx/docx-token',
        createdAt: '1710000000'
      })
    )
  })

  it('requires either documentId or folderToken', async () => {
    await expect(strategy.validateConfig({})).rejects.toThrow('Document ID or Folder Token is required')
  })
})

function createIntegration(): IIntegration {
  return {
    options: {
      appId: 'app-id',
      appSecret: 'app-secret',
      isLark: false
    }
  } as IIntegration
}
