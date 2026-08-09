import path from 'node:path'
import { Document } from '@langchain/core/documents'
import type { IKnowledgeDocument } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import type { ChunkMetadata, TDocumentAsset, XpFileSystem } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import unzipper from 'unzipper'
import { v4 as uuid } from 'uuid'
import {
  MinerU,
  type MinerUChunkMetadata,
  type MinerUDocumentMetadata,
  type MineruSelfHostedTaskResult
} from './types.js'

const MAX_RESULT_BYTES = 1024 * 1024 * 1024
const MAX_RESULT_FILES = 20_000

export type MinerUParseContext = Partial<MinerUChunkMetadata> & {
  preserveRawOutput?: boolean
}

type ParsedResult = {
  id?: string
  chunks: Document<ChunkMetadata>[]
  metadata: MinerUDocumentMetadata
}

type ZipEntry = {
  entryPath: string
  data: Buffer
}

@Injectable()
export class MinerUResultParserService {
  private readonly logger = new Logger(MinerUResultParserService.name)

  async parseFromUrl(
    fullZipUrl: string,
    taskId: string,
    document: Partial<IKnowledgeDocument>,
    fileSystem: XpFileSystem,
    context: MinerUParseContext = {}
  ): Promise<ParsedResult> {
    if (!fullZipUrl) throw new Error(`MinerU result URL is missing [taskId=${taskId}]`)
    const response = await axios.get<ArrayBuffer>(fullZipUrl, {
      responseType: 'arraybuffer',
      timeout: 120_000,
      maxContentLength: MAX_RESULT_BYTES,
      maxBodyLength: MAX_RESULT_BYTES
    })
    const zipBuffer = Buffer.from(response.data)
    if (!zipBuffer.length) throw new Error(`MinerU returned an empty result archive [taskId=${taskId}]`)
    if (zipBuffer.length > MAX_RESULT_BYTES) throw new Error('MinerU result archive exceeds the 1 GiB safety limit')

    const directory = await unzipper.Open.buffer(zipBuffer)
    if (directory.files.length > MAX_RESULT_FILES) {
      throw new Error(`MinerU result archive contains more than ${MAX_RESULT_FILES} entries`)
    }

    const entries: ZipEntry[] = []
    let extractedBytes = 0
    for (const entry of directory.files) {
      if (entry.type !== 'File') continue
      const entryPath = safeZipPath(entry.path)
      const data = await entry.buffer()
      extractedBytes += data.length
      if (extractedBytes > MAX_RESULT_BYTES) throw new Error('MinerU extracted output exceeds the 1 GiB safety limit')
      entries.push({ entryPath, data })
    }
    return this.mapZipEntries(entries, taskId, document, fileSystem, context)
  }

  async parseLocalTask(
    result: MineruSelfHostedTaskResult,
    taskId: string,
    document: Partial<IKnowledgeDocument>,
    fileSystem: XpFileSystem,
    context: MinerUParseContext = {}
  ): Promise<ParsedResult> {
    const outputFolder = resultFolder(document, taskId, context)
    const assets: TDocumentAsset[] = []
    const pathMap = new Map<string, string>()

    for (const image of result.images) {
      const imagePath = safeRelativePath(image.name)
      const filePath = path.posix.join(outputFolder, 'images', imagePath)
      const url = await fileSystem.writeFile(filePath, decodeImage(image.dataUrl))
      const asset = { type: 'image' as const, url, filePath }
      assets.push(asset)
      pathMap.set(path.posix.join('images', imagePath), url)
      pathMap.set(imagePath, url)
    }

    if (context.preserveRawOutput !== false) {
      assets.push(await writeAsset(fileSystem, outputFolder, 'result.md', result.mdContent, 'file'))
      if (result.contentList !== undefined) {
        assets.push(
          await writeAsset(
            fileSystem,
            outputFolder,
            'content_list.json',
            JSON.stringify(result.contentList, null, 2),
            'file'
          )
        )
      }
      if (result.contentListV2 !== undefined) {
        assets.push(
          await writeAsset(
            fileSystem,
            outputFolder,
            'content_list_v2.json',
            JSON.stringify(result.contentListV2, null, 2),
            'file'
          )
        )
      }
      assets.push(
        await writeAsset(fileSystem, outputFolder, 'raw-response.json', JSON.stringify(result.raw ?? {}, null, 2), 'file')
      )
    }

    const markdown = rewriteAssetLinks(result.mdContent, '.', pathMap)
    if (!markdown.trim()) throw new Error(`MinerU self-hosted service returned no Markdown [taskId=${taskId}]`)
    const chunkMetadata = createChunkMetadata(taskId, assets, {
      ...context,
      serverType: 'self-hosted',
      fileName: result.fileName
    })
    return {
      id: document.id,
      chunks: [new Document({ pageContent: markdown, metadata: chunkMetadata })],
      metadata: {
        ...(document.metadata ?? {}),
        chunkId: uuid(),
        parser: MinerU,
        taskId,
        taskIds: [taskId],
        assets,
        originPdfUrl: result.sourceUrl
      }
    }
  }

  private async mapZipEntries(
    entries: ZipEntry[],
    taskId: string,
    document: Partial<IKnowledgeDocument>,
    fileSystem: XpFileSystem,
    context: MinerUParseContext
  ): Promise<ParsedResult> {
    const outputFolder = resultFolder(document, taskId, context)
    const assets: TDocumentAsset[] = []
    const pathMap = new Map<string, string>()
    const markdownEntries: ZipEntry[] = []
    let layoutJson: any

    for (const entry of entries) {
      const baseName = path.posix.basename(entry.entryPath)
      const isImage = isImagePath(entry.entryPath)
      const isMarkdown = baseName.toLowerCase().endsWith('.md')
      if (isMarkdown) markdownEntries.push(entry)
      if (isLayoutJson(baseName)) {
        try {
          layoutJson = JSON.parse(entry.data.toString('utf8'))
        } catch (error) {
          this.logger.warn(`MinerU layout JSON is invalid: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (isImage || context.preserveRawOutput !== false) {
        const filePath = path.posix.join(outputFolder, entry.entryPath)
        const url = await fileSystem.writeFile(filePath, entry.data)
        const asset = { type: isImage ? ('image' as const) : ('file' as const), url, filePath }
        assets.push(asset)
        pathMap.set(entry.entryPath, url)
      }
    }

    const markdownEntry = selectMarkdown(markdownEntries, context.fileName)
    if (!markdownEntry) throw new Error(`MinerU result archive contains no Markdown [taskId=${taskId}]`)
    const markdown = rewriteAssetLinks(
      markdownEntry.data.toString('utf8'),
      path.posix.dirname(markdownEntry.entryPath),
      pathMap
    )
    if (!markdown.trim()) throw new Error(`MinerU result Markdown is empty [taskId=${taskId}]`)

    const metadata: MinerUDocumentMetadata = {
      ...(document.metadata ?? {}),
      chunkId: uuid(),
      parser: MinerU,
      taskId,
      taskIds: [taskId],
      assets,
      mineruBackend: layoutJson?._backend,
      mineruVersion: layoutJson?._version_name,
      sourcePageCount: context.sourcePageCount,
      originPdfUrl: document.fileUrl
    }
    const chunkMetadata = createChunkMetadata(taskId, assets, context)
    return {
      id: document.id,
      chunks: [new Document({ pageContent: markdown, metadata: chunkMetadata })],
      metadata
    }
  }
}

function createChunkMetadata(
  taskId: string,
  assets: TDocumentAsset[],
  context: MinerUParseContext
): ChunkMetadata {
  const mineru: MinerUChunkMetadata = {
    serverType: context.serverType ?? 'official',
    modelVersion: context.modelVersion,
    backend: context.backend,
    batchId: context.batchId,
    batchIndex: context.batchIndex,
    batchCount: context.batchCount,
    sourcePageStart: context.sourcePageStart,
    sourcePageEnd: context.sourcePageEnd,
    sourcePageCount: context.sourcePageCount,
    fileName: context.fileName
  }
  return {
    parser: MinerU,
    taskId,
    chunkId: uuid(),
    chunkIndex: context.batchIndex ?? 0,
    mediaType: 'text',
    assets,
    mineru
  }
}

function resultFolder(
  document: Partial<IKnowledgeDocument>,
  taskId: string,
  context: MinerUParseContext
): string {
  const documentId = safeSegment(document.id || 'document')
  const part = context.batchCount && context.batchCount > 1
    ? `part-${String((context.batchIndex ?? 0) + 1).padStart(4, '0')}`
    : safeSegment(taskId)
  return path.posix.join(document.folder || '', 'mineru', documentId, part)
}

function selectMarkdown(entries: ZipEntry[], fileName?: string): ZipEntry | undefined {
  const sourceStem = fileName ? path.posix.basename(fileName, path.posix.extname(fileName)).toLowerCase() : undefined
  return (
    entries.find((entry) => path.posix.basename(entry.entryPath).toLowerCase() === 'full.md') ??
    entries.find((entry) => sourceStem && path.posix.basename(entry.entryPath, '.md').toLowerCase() === sourceStem) ??
    entries[0]
  )
}

function rewriteAssetLinks(markdown: string, markdownDirectory: string, pathMap: Map<string, string>): string {
  const resolve = (rawPath: string): string | undefined => {
    if (/^(?:https?:|data:|#)/i.test(rawPath)) return undefined
    const [assetPath, suffix = ''] = rawPath.split(/(?=[?#])/u, 2)
    let decoded = assetPath
    try {
      decoded = decodeURIComponent(assetPath)
    } catch {
      // Keep the original path when it is not URL encoded.
    }
    const relative = path.posix.normalize(path.posix.join(markdownDirectory, decoded.replace(/^\.\//, '')))
    const url = pathMap.get(relative) ?? pathMap.get(decoded.replace(/^\.\//, ''))
    return url ? `${url}${suffix}` : undefined
  }

  return markdown
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, assetPath) => {
      const url = resolve(assetPath)
      return url ? `![${alt}](${url})` : match
    })
    .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, assetPath, suffix) => {
      const url = resolve(assetPath)
      return url ? `${prefix}${url}${suffix}` : match
    })
}

function safeZipPath(value: string): string {
  return safeRelativePath(value.replace(/\\/g, '/'))
}

function safeRelativePath(value: string): string {
  if (!value || value.includes('\0') || path.posix.isAbsolute(value)) throw new Error('MinerU result contains an unsafe path')
  const normalized = path.posix.normalize(value).replace(/^\.\//, '')
  if (!normalized || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`MinerU result contains an unsafe path: ${value}`)
  }
  return normalized
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'result'
}

function isImagePath(filePath: string): boolean {
  return /\.(?:png|jpe?g|jp2|webp|gif|bmp|tiff?)$/i.test(filePath)
}

function isLayoutJson(baseName: string): boolean {
  const lower = baseName.toLowerCase()
  return lower === 'layout.json' || lower === 'middle.json' || lower.endsWith('_middle.json')
}

function decodeImage(value: string): Buffer {
  const comma = value.indexOf(',')
  return Buffer.from(comma >= 0 ? value.slice(comma + 1) : value, 'base64')
}

async function writeAsset(
  fileSystem: XpFileSystem,
  outputFolder: string,
  relativePath: string,
  content: Buffer | string,
  type: TDocumentAsset['type']
): Promise<TDocumentAsset> {
  const filePath = path.posix.join(outputFolder, relativePath)
  const url = await fileSystem.writeFile(filePath, content)
  return { type, filePath, url }
}
