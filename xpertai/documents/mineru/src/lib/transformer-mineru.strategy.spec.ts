import { Document } from '@langchain/core/documents'
import type { IKnowledgeDocument } from '@xpert-ai/contracts'
import type { ConfigService } from '@nestjs/config'
import type { ChunkMetadata, XpFileSystem } from '@xpert-ai/plugin-sdk'
import { PDFDocument } from 'pdf-lib'
import { MinerUClient } from './mineru.client.js'
import type { MinerUResultParserService } from './result-parser.service.js'
import { MinerUTransformerStrategy } from './transformer-mineru.strategy.js'

async function createPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([100, 100])
  const bytes = await pdf.save()
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function createStrategy(parser: Partial<MinerUResultParserService>) {
  const strategy = new MinerUTransformerStrategy()
  ;(strategy as any).configService = { get: jest.fn() } as unknown as ConfigService
  ;(strategy as any).resultParser = parser
  return strategy
}

describe('MinerUTransformerStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('uploads workspace PDFs through signed URLs and preserves batch metadata', async () => {
    const pdf = await createPdf()
    const fileSystem = {
      readFile: jest.fn().mockResolvedValue(pdf),
      writeFile: jest.fn(),
    } as unknown as XpFileSystem
    const parseFromUrl = jest.fn().mockResolvedValue({
      chunks: [new Document<ChunkMetadata>({ pageContent: '# Parsed', metadata: { chunkId: 'chunk-1' } })],
      metadata: { parser: 'mineru', taskId: 'batch-1:1', chunkId: 'meta-1', assets: [] },
    })
    const createUploadBatch = jest
      .spyOn(MinerUClient.prototype, 'createUploadBatch')
      .mockResolvedValue({ batchId: 'batch-1' })
    jest.spyOn(MinerUClient.prototype, 'waitForBatch').mockResolvedValue([
      {
        file_name: 'document.pdf',
        data_id: 'doc-1.part-0001',
        state: 'done',
        full_zip_url: 'https://cdn.test/result.zip',
      },
    ])

    const result = await createStrategy({ parseFromUrl } as any).transformDocuments(
      [
        {
          id: 'doc-1',
          name: 'document.pdf',
          filePath: 'documents/document.pdf',
          fileUrl: 'http://localhost:3333/files/document.pdf',
        } as Partial<IKnowledgeDocument>,
      ],
      {
        modelVersion: 'vlm',
        permissions: {
          fileSystem,
          integration: {
            provider: 'mineru',
            options: { serverType: 'official', apiKey: 'token', uploadMode: 'auto' },
          },
        },
      } as any
    )

    expect(fileSystem.readFile).toHaveBeenCalledWith('documents/document.pdf')
    expect(createUploadBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersion: 'vlm',
        files: [expect.objectContaining({ name: 'document.pdf', dataId: 'doc-1.part-0001', buffer: pdf })],
      })
    )
    expect(parseFromUrl).toHaveBeenCalledWith(
      'https://cdn.test/result.zip',
      'batch-1:1',
      expect.objectContaining({ id: 'doc-1' }),
      fileSystem,
      expect.objectContaining({ sourcePageStart: 1, sourcePageEnd: 1, sourcePageCount: 1 })
    )
    expect(result[0].chunks?.[0].pageContent).toBe('# Parsed')
    expect(result[0].metadata).toEqual(
      expect.objectContaining({ parser: 'mineru', taskIds: ['batch-1'], sourcePageCount: 1 })
    )
  })

  it('keeps explicit public URL mode for externally reachable files', async () => {
    const fileSystem = {} as XpFileSystem
    jest.spyOn(MinerUClient.prototype, 'createTask').mockResolvedValue({ taskId: 'task-url' })
    jest.spyOn(MinerUClient.prototype, 'waitForTask').mockResolvedValue({
      state: 'done',
      full_zip_url: 'https://cdn.test/url-result.zip',
    })
    const parseFromUrl = jest.fn().mockResolvedValue({
      chunks: [new Document<ChunkMetadata>({ pageContent: '# URL', metadata: { chunkId: 'chunk-url' } })],
      metadata: { parser: 'mineru', taskId: 'task-url', chunkId: 'meta-url', assets: [] },
    })

    const result = await createStrategy({ parseFromUrl } as any).transformDocuments(
      [{ id: 'doc-url', name: 'public.pdf', fileUrl: 'https://files.test/public.pdf' }],
      {
        permissions: {
          fileSystem,
          integration: {
            provider: 'mineru',
            options: { serverType: 'official', apiKey: 'token', uploadMode: 'url' },
          },
        },
      } as any
    )

    expect(MinerUClient.prototype.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://files.test/public.pdf', modelVersion: 'vlm' })
    )
    expect(parseFromUrl).toHaveBeenCalledWith(
      'https://cdn.test/url-result.zip',
      'task-url',
      expect.any(Object),
      fileSystem,
      expect.objectContaining({ batchCount: 1, modelVersion: 'vlm' })
    )
    expect(result[0].chunks?.[0].pageContent).toBe('# URL')
  })
})
