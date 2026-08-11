import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { IIntegration, IKnowledgeDocument } from '@xpert-ai/contracts'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ChunkMetadata,
  DocumentTransformerStrategy,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  IntegrationPermission,
  type XpFileSystem
} from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { isNil, omitBy } from 'lodash-es'
import { v4 as uuid } from 'uuid'
import {
  MinerUClient,
  type MineruBatchExtractResult
} from './mineru.client.js'
import {
  getMinerUPdfPageCount,
  MINERU_MAX_FILE_BYTES,
  MINERU_MAX_PDF_PAGES,
  MINERU_PDF_BATCH_TARGET_BYTES,
  prepareMinerUPdfBatches,
  removeMinerUPdfBatchPlan,
  type MinerUPdfBatchPlan
} from './pdf-batch.js'
import { MinerUResultParserService } from './result-parser.service.js'
import {
  icon,
  MinerU,
  type MinerUBatchTrace,
  type MinerUIntegrationOptions,
  type TMinerUTransformerConfig
} from './types.js'

const OFFICIAL_BATCH_FILE_LIMIT = 50

type ResolvedSource = {
  fileName: string
  extension: string
  buffer: Buffer
}

type UploadPart = {
  batchIndex: number
  sourcePageStart?: number
  sourcePageEnd?: number
  fileName: string
  buffer?: Buffer
  temporaryPath?: string
}

@Injectable()
@DocumentTransformerStrategy(MinerU)
export class MinerUTransformerStrategy implements IDocumentTransformerStrategy<TMinerUTransformerConfig> {
  @Inject(MinerUResultParserService)
  private readonly resultParser: MinerUResultParserService

  @Inject(forwardRef(() => ConfigService))
  private readonly configService: ConfigService

  readonly permissions = [
    {
      type: 'integration',
      service: MinerU,
      description: 'Access to MinerU system integrations'
    } as IntegrationPermission,
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: []
    } as FileSystemPermission
  ]

  readonly meta = {
    name: MinerU,
    label: { en_US: 'MinerU', zh_Hans: 'MinerU' },
    description: {
      en_US: 'Parse PDF and other supported documents with MinerU into Markdown and structured assets.',
      zh_Hans: '使用 MinerU 将 PDF 等支持的文档解析为 Markdown 与结构化资源。'
    },
    icon: { type: 'svg' as const, value: icon, color: '#14b8a6' },
    helpUrl: 'https://mineru.net/apiManage/docs',
    configSchema: {
      type: 'object',
      properties: {
        isOcr: {
          type: 'boolean',
          title: { en_US: 'Enable OCR', zh_Hans: '启用 OCR' },
          description: {
            en_US: 'Enable OCR for scanned or image-based PDFs.',
            zh_Hans: '对扫描件或图像型 PDF 启用 OCR。'
          },
          default: true
        },
        enableFormula: {
          type: 'boolean',
          title: { en_US: 'Enable Formula Recognition', zh_Hans: '启用公式识别' },
          default: true
        },
        enableTable: {
          type: 'boolean',
          title: { en_US: 'Enable Table Recognition', zh_Hans: '启用表格识别' },
          default: true
        },
        language: {
          type: 'string',
          title: { en_US: 'Document Language', zh_Hans: '文档语言' },
          description: {
            en_US: 'OCR language pack documented by MinerU.',
            zh_Hans: 'MinerU 官方文档定义的 OCR 语言包。'
          },
          enum: [
            'ch',
            'ch_server',
            'en',
            'japan',
            'korean',
            'chinese_cht',
            'ta',
            'te',
            'ka',
            'el',
            'th',
            'latin',
            'arabic',
            'cyrillic',
            'east_slavic',
            'devanagari'
          ],
          default: 'ch'
        },
        modelVersion: {
          type: 'string',
          title: { en_US: 'Model Version', zh_Hans: '模型版本' },
          description: {
            en_US: 'MinerU recommends VLM for the Precise Parsing API.',
            zh_Hans: 'MinerU 精准解析 API 官方推荐使用 VLM。'
          },
          enum: ['vlm', 'pipeline'],
          default: 'vlm'
        },
        selfHostedBackend: {
          type: 'string',
          title: { en_US: 'Self-hosted Backend', zh_Hans: '自托管后端' },
          description: {
            en_US: 'Backend exposed by the current mineru-api/mineru-router service. Pipeline is the broadest compatible default.',
            zh_Hans: '当前 mineru-api/mineru-router 提供的后端；pipeline 是兼容范围最广的默认值。'
          },
          enum: ['pipeline', 'hybrid-engine', 'vlm-engine', 'vlm-http-client', 'hybrid-http-client'],
          default: 'pipeline'
        },
        selfHostedServerUrl: {
          type: 'string',
          title: { en_US: 'Self-hosted Model Server URL', zh_Hans: '自托管模型服务地址' },
          description: {
            en_US: 'Required only for vlm-http-client or hybrid-http-client backends.',
            zh_Hans: '仅 vlm-http-client 或 hybrid-http-client 后端需要。'
          }
        },
        parseMethod: {
          type: 'string',
          title: { en_US: 'Self-hosted Parse Method', zh_Hans: '自托管解析方式' },
          enum: ['auto', 'txt', 'ocr'],
          default: 'auto'
        },
        preserveRawOutput: {
          type: 'boolean',
          title: { en_US: 'Preserve Raw Output', zh_Hans: '保留原始结果' },
          description: {
            en_US: 'Archive MinerU Markdown, JSON and visual assets in the knowledge workspace.',
            zh_Hans: '将 MinerU 的 Markdown、JSON 和可视化资源归档到知识库工作区。'
          },
          default: true
        }
      },
      required: []
    }
  }

  async validateConfig(config: TMinerUTransformerConfig): Promise<void> {
    const modelVersion = config.modelVersion ?? 'vlm'
    if (!['vlm', 'pipeline'].includes(modelVersion)) throw new Error(`Unsupported MinerU model: ${modelVersion}`)
  }

  async transformDocuments(
    documents: Partial<IKnowledgeDocument>[],
    config: TMinerUTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    const client = new MinerUClient(this.configService, config.permissions)
    const fileSystem = config.permissions?.fileSystem
    if (!fileSystem) throw new Error('MinerU requires the knowledge-base file-system permission')

    const output: Partial<IKnowledgeDocument<ChunkMetadata>>[] = []
    for (const document of documents) {
      try {
        output.push(
          client.serverType === 'self-hosted'
            ? await this.transformSelfHosted(document, config, client, fileSystem)
            : await this.transformOfficial(document, config, client, fileSystem)
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`MinerU document conversion failed for '${resolveFileName(document)}': ${message}`, {
          cause: error
        })
      }
    }
    return output
  }

  private async transformSelfHosted(
    document: Partial<IKnowledgeDocument>,
    config: TMinerUTransformerConfig,
    client: MinerUClient,
    fileSystem: XpFileSystem
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>> {
    const { taskId } = await client.createTask({
      filePath: document.filePath,
      fileName: resolveFileName(document),
      isOcr: config.isOcr ?? true,
      enableFormula: config.enableFormula ?? true,
      enableTable: config.enableTable ?? true,
      language: config.language ?? 'ch',
      parseMethod: config.parseMethod ?? 'auto',
      backend: config.selfHostedBackend ?? 'pipeline',
      serverUrl: config.selfHostedServerUrl,
      returnMiddleJson: config.preserveRawOutput !== false
    })
    const result = client.getSelfHostedTask(taskId)
    if (!result) throw new Error(`MinerU self-hosted result is unavailable [taskId=${taskId}]`)
    return this.resultParser.parseLocalTask(result, taskId, document, fileSystem, {
      preserveRawOutput: config.preserveRawOutput !== false,
      backend: config.selfHostedBackend ?? 'pipeline'
    })
  }

  private async transformOfficial(
    document: Partial<IKnowledgeDocument>,
    config: TMinerUTransformerConfig,
    client: MinerUClient,
    fileSystem: XpFileSystem
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>> {
    const integration = config.permissions?.integration as Partial<IIntegration<MinerUIntegrationOptions>> | undefined
    const options = integration?.options
    const uploadMode = options?.uploadMode ?? 'auto'
    const useFileUpload = uploadMode === 'file' || (uploadMode === 'auto' && Boolean(document.filePath))
    const timeoutMs = secondsToMilliseconds(options?.taskTimeoutSeconds, 30 * 60 * 1000)
    const intervalMs = secondsToMilliseconds(options?.pollIntervalSeconds, 5000)
    const request = requestOptions(config)

    if (!useFileUpload) {
      if (!document.fileUrl) throw new Error('MinerU URL mode requires a public document URL')
      const { taskId } = await client.createTask({ url: document.fileUrl, ...request })
      const result = await client.waitForTask(taskId, timeoutMs, intervalMs)
      return this.resultParser.parseFromUrl(result.full_zip_url, taskId, document, fileSystem, {
        preserveRawOutput: config.preserveRawOutput !== false,
        serverType: 'official',
        modelVersion: request.modelVersion,
        batchIndex: 0,
        batchCount: 1,
        fileName: resolveFileName(document)
      })
    }

    const source = await resolveSource(document, fileSystem)
    let plan: MinerUPdfBatchPlan | undefined
    try {
      const prepared = await prepareUploadParts(source)
      plan = prepared.plan
      const batchCount = prepared.parts.length
      const parsed: Awaited<ReturnType<MinerUResultParserService['parseFromUrl']>>[] = []
      const traces: MinerUBatchTrace[] = []
      const taskIds: string[] = []

      for (let offset = 0; offset < prepared.parts.length; offset += OFFICIAL_BATCH_FILE_LIMIT) {
        const partGroup = prepared.parts.slice(offset, offset + OFFICIAL_BATCH_FILE_LIMIT)
        const uploads = await Promise.all(
          partGroup.map(async (part) => ({
            name: part.fileName,
            buffer: await readUploadPart(part),
            dataId: dataIdFor(document.id, part.batchIndex),
            isOcr: request.isOcr
          }))
        )
        const { batchId } = await client.createUploadBatch({
          files: uploads,
          enableFormula: request.enableFormula,
          enableTable: request.enableTable,
          language: request.language,
          modelVersion: request.modelVersion
        })
        taskIds.push(batchId)
        const results = await client.waitForBatch(batchId, uploads.length, timeoutMs, intervalMs)

        for (let index = 0; index < partGroup.length; index += 1) {
          const part = partGroup[index]
          const dataId = uploads[index].dataId
          const result = findBatchResult(results, dataId, part.fileName, index)
          if (!result.full_zip_url) throw new Error(`MinerU result URL is missing [batchId=${batchId}]`)
          traces.push({
            batchId,
            batchIndex: part.batchIndex,
            batchCount,
            fileName: part.fileName,
            sourcePageStart: part.sourcePageStart,
            sourcePageEnd: part.sourcePageEnd,
            dataId
          })
          parsed.push(
            await this.resultParser.parseFromUrl(
              result.full_zip_url,
              `${batchId}:${part.batchIndex + 1}`,
              document,
              fileSystem,
              {
                preserveRawOutput: config.preserveRawOutput !== false,
                serverType: 'official',
                modelVersion: request.modelVersion,
                batchId,
                batchIndex: part.batchIndex,
                batchCount,
                sourcePageStart: part.sourcePageStart,
                sourcePageEnd: part.sourcePageEnd,
                sourcePageCount: prepared.pageCount,
                fileName: part.fileName
              }
            )
          )
        }
      }

      const chunks = parsed.flatMap((item) => item.chunks)
      chunks.forEach((chunk, index) => {
        chunk.metadata.chunkIndex = index
      })
      const assets = parsed.flatMap((item) => item.metadata.assets ?? [])
      return {
        id: document.id,
        chunks,
        metadata: {
          ...(document.metadata ?? {}),
          chunkId: uuid(),
          parser: MinerU,
          taskId: taskIds[0],
          taskIds,
          batches: traces,
          sourcePageCount: prepared.pageCount,
          originPdfUrl: document.fileUrl,
          assets
        }
      }
    } finally {
      if (plan) await removeMinerUPdfBatchPlan(plan).catch(() => undefined)
    }
  }
}

function requestOptions(config: TMinerUTransformerConfig) {
  return omitBy(
    {
      isOcr: config.isOcr ?? true,
      enableFormula: config.enableFormula ?? true,
      enableTable: config.enableTable ?? true,
      language: config.language ?? 'ch',
      modelVersion: config.modelVersion ?? 'vlm'
    },
    isNil
  ) as Required<Pick<TMinerUTransformerConfig, 'isOcr' | 'enableFormula' | 'enableTable' | 'language' | 'modelVersion'>>
}

async function resolveSource(
  document: Partial<IKnowledgeDocument>,
  fileSystem: XpFileSystem
): Promise<ResolvedSource> {
  const fileName = resolveFileName(document)
  const extension = path.extname(fileName).slice(1).toLowerCase()
  if (document.filePath) {
    const buffer = await fileSystem.readFile(document.filePath)
    if (!buffer.length) throw new Error(`MinerU source file is empty: ${fileName}`)
    return { fileName, extension, buffer }
  }
  if (!document.fileUrl) throw new Error(`MinerU cannot resolve source bytes for '${fileName}'`)
  const response = await axios.get<ArrayBuffer>(document.fileUrl, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    maxContentLength: Infinity
  })
  const buffer = Buffer.from(response.data)
  if (!buffer.length) throw new Error(`MinerU source file is empty: ${fileName}`)
  return { fileName, extension, buffer }
}

async function prepareUploadParts(source: ResolvedSource): Promise<{
  parts: UploadPart[]
  pageCount?: number
  plan?: MinerUPdfBatchPlan
}> {
  if (source.extension !== 'pdf') {
    if (source.buffer.length > MINERU_MAX_FILE_BYTES) {
      throw new Error('MinerU official API accepts files up to 200 MB')
    }
    return { parts: [{ batchIndex: 0, fileName: source.fileName, buffer: source.buffer }] }
  }

  const pageCount = await getMinerUPdfPageCount(source.buffer)
  if (pageCount <= MINERU_MAX_PDF_PAGES && source.buffer.length <= MINERU_PDF_BATCH_TARGET_BYTES) {
    return {
      pageCount,
      parts: [
        {
          batchIndex: 0,
          sourcePageStart: 1,
          sourcePageEnd: pageCount,
          fileName: source.fileName,
          buffer: source.buffer
        }
      ]
    }
  }

  const plan = await prepareMinerUPdfBatches(source.buffer, source.fileName)
  return {
    pageCount: plan.pageCount,
    plan,
    parts: plan.batches.map((batch) => ({
      batchIndex: batch.batchIndex,
      sourcePageStart: batch.sourcePageStart,
      sourcePageEnd: batch.sourcePageEnd,
      fileName: batch.fileName,
      temporaryPath: batch.temporaryPath
    }))
  }
}

function findBatchResult(
  results: MineruBatchExtractResult[],
  dataId: string | undefined,
  fileName: string,
  fallbackIndex: number
): MineruBatchExtractResult {
  const result =
    results.find((item) => dataId && item.data_id === dataId) ??
    results.find((item) => item.file_name === fileName) ??
    results[fallbackIndex]
  if (!result) throw new Error(`MinerU returned no result for '${fileName}'`)
  return result
}

async function readUploadPart(part: UploadPart): Promise<Buffer> {
  if (part.buffer) return part.buffer
  if (part.temporaryPath) return fsPromises.readFile(part.temporaryPath)
  throw new Error(`MinerU upload part '${part.fileName}' has no readable content`)
}

function dataIdFor(documentId: string | undefined, batchIndex: number): string {
  const base = (documentId || 'document').replace(/[^a-zA-Z0-9_.-]+/g, '-').slice(0, 100)
  return `${base}.part-${String(batchIndex + 1).padStart(4, '0')}`
}

function resolveFileName(document: Partial<IKnowledgeDocument>): string {
  const name = document.name?.trim() || document.filePath?.split('/').pop() || document.fileUrl?.split('/').pop()
  if (!name) return 'document.pdf'
  try {
    return decodeURIComponent(name.split('?')[0])
  } catch {
    return name.split('?')[0]
  }
}

function secondsToMilliseconds(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || Number(value) <= 0) return fallback
  return Math.floor(Number(value) * 1000)
}
