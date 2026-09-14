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
      writeFile: jest.fn()
    } as unknown as XpFileSystem
    const parseFromUrl = jest.fn().mockResolvedValue({
      chunks: [new Document<ChunkMetadata>({ pageContent: '# Parsed', metadata: { chunkId: 'chunk-1' } })],
      metadata: { parser: 'mineru', taskId: 'batch-1:1', chunkId: 'meta-1', assets: [] }
    })
    const createUploadBatch = jest
      .spyOn(MinerUClient.prototype, 'createUploadBatch')
      .mockResolvedValue({ batchId: 'batch-1' })
    jest.spyOn(MinerUClient.prototype, 'waitForBatch').mockResolvedValue([
      {
        file_name: 'document.pdf',
        data_id: 'doc-1.part-0001',
        state: 'done',
        full_zip_url: 'https://cdn.test/result.zip'
      }
    ])

    const result = await createStrategy({ parseFromUrl } as any).transformDocuments(
      [
        {
          id: 'doc-1',
          name: 'document.pdf',
          filePath: 'documents/document.pdf',
          fileUrl: 'http://localhost:3333/files/document.pdf'
        } as Partial<IKnowledgeDocument>
      ],
      {
        modelVersion: 'vlm',
        permissions: {
          fileSystem,
          integration: {
            provider: 'mineru',
            options: { serverType: 'official', apiKey: 'token', uploadMode: 'auto' }
          }
        }
      } as any
    )

    expect(fileSystem.readFile).toHaveBeenCalledWith('documents/document.pdf')
    expect(createUploadBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersion: 'vlm',
        files: [expect.objectContaining({ name: 'document.pdf', dataId: 'doc-1.part-0001', buffer: pdf })]
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
      full_zip_url: 'https://cdn.test/url-result.zip'
    })
    const parseFromUrl = jest.fn().mockResolvedValue({
      chunks: [new Document<ChunkMetadata>({ pageContent: '# URL', metadata: { chunkId: 'chunk-url' } })],
      metadata: { parser: 'mineru', taskId: 'task-url', chunkId: 'meta-url', assets: [] }
    })

    const result = await createStrategy({ parseFromUrl } as any).transformDocuments(
      [{ id: 'doc-url', name: 'public.pdf', fileUrl: 'https://files.test/public.pdf' }],
      {
        permissions: {
          fileSystem,
          integration: {
            provider: 'mineru',
            options: { serverType: 'official', apiKey: 'token', uploadMode: 'url' }
          }
        }
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
  it('uses integration defaults for new requests while retaining explicit legacy overrides', async () => {
    const createTask = jest.spyOn(MinerUClient.prototype, 'createTask').mockResolvedValue({ taskId: 'task-config' })
    jest
      .spyOn(MinerUClient.prototype, 'waitForTask')
      .mockResolvedValue({ state: 'done', full_zip_url: 'https://cdn.test/result.zip' })
    const strategy = createStrategy({ parseFromUrl: jest.fn().mockResolvedValue({ chunks: [] }) })
    const permissions = {
      fileSystem: {} as XpFileSystem,
      integration: {
        provider: 'mineru',
        options: {
          serverType: 'official' as const,
          apiKey: 'token',
          uploadMode: 'url' as const,
          modelVersion: 'pipeline' as const,
          isOcr: false,
          enableFormula: false,
          enableTable: false,
          language: 'en' as const
        }
      }
    }
    const docs = [{ name: 'document.pdf', fileUrl: 'https://files.test/document.pdf' }]
    await strategy.transformDocuments(docs, { stage: 'test', permissions })
    expect(createTask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modelVersion: 'pipeline',
        isOcr: false,
        enableFormula: false,
        enableTable: false,
        language: 'en'
      })
    )
    await strategy.transformDocuments(docs, {
      stage: 'test',
      permissions,
      modelVersion: 'vlm',
      isOcr: true,
      enableTable: true
    })
    expect(createTask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modelVersion: 'vlm',
        isOcr: true,
        enableTable: true,
        enableFormula: false,
        language: 'en'
      })
    )
    expect(strategy.meta.configSchema.properties).toEqual({})
  })

  it('passes self-hosted integration parameters to file parsing and preserves legacy parameters', async () => {
    const createTask = jest.spyOn(MinerUClient.prototype, 'createTask').mockResolvedValue({ taskId: 'local' })
    jest.spyOn(MinerUClient.prototype, 'getSelfHostedTask').mockReturnValue({ mdContent: 'text', images: [], raw: {} })
    const strategy = createStrategy({ parseLocalTask: jest.fn().mockResolvedValue({ chunks: [] }) })
    const permissions = {
      fileSystem: {} as XpFileSystem,
      integration: {
        provider: 'mineru',
        options: {
          serverType: 'self-hosted' as const,
          apiUrl: 'http://localhost:8000',
          selfHostedBackend: 'vlm-http-client' as const,
          selfHostedServerUrl: 'http://models:30000',
          parseMethod: 'ocr' as const,
          enableTable: false,
          language: 'en' as const
        }
      }
    }
    await strategy.transformDocuments([{ filePath: 'document.pdf' }], { stage: 'test', permissions })
    expect(createTask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        backend: 'vlm-http-client',
        serverUrl: 'http://models:30000',
        parseMethod: 'ocr',
        enableTable: false,
        language: 'en'
      })
    )
    await strategy.transformDocuments([{ filePath: 'document.pdf' }], {
      stage: 'test',
      permissions,
      selfHostedBackend: 'pipeline',
      parseMethod: 'txt',
      preserveRawOutput: false
    })
    expect(createTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ backend: 'pipeline', parseMethod: 'txt', returnMiddleJson: false })
    )
  })
})
