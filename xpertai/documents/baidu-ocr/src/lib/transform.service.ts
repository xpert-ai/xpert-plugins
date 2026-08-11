import { createHash } from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Document } from '@langchain/core/documents'
import type { IIntegration, IKnowledgeDocument, TDocumentAsset } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import type { ChunkMetadata, XpFileSystem } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { v4 as uuid } from 'uuid'
import { BaiduCloudParserClient } from './baidu-cloud.client.js'
import {
  BAIDU_DOCUMENT_EXTENSIONS,
  BAIDU_MAX_BASE64_BYTES,
  BAIDU_MAX_PDF_PAGES,
  BAIDU_OCR,
  BAIDU_PADDLE_OCR_VL,
  BAIDU_UNLIMITED_OCR
} from './constants.js'
import { BaiduOcrError, documentConversionError, normalizeBaiduError } from './errors.js'
import { isRetryableHttpError, retry } from './http.js'
import {
  archiveMergedMarkdown,
  mergePaddleLayoutDocuments,
  mergeUnlimitedMarkdownDocuments,
  uniqueDocumentAssets
} from './markdown-document.js'
import { getPdfPageCount, prepareBaiduPdfBatches, removeBaiduPdfBatchPlan } from './pdf-batch.js'
import type {
  BaiduBaseTransformerConfig,
  BaiduBatchTrace,
  BaiduCloudDocumentInput,
  BaiduDocumentAnalysisBlockType,
  BaiduDocumentAnalysisMetadata,
  BaiduDocumentLayoutMetadata,
  BaiduImage,
  BaiduLayoutChunkMetadata,
  BaiduLayout,
  BaiduOcrChunkMetadata,
  BaiduOcrIntegration,
  BaiduOcrIntegrationOptions,
  BaiduPage,
  BaiduParserEngine,
  BaiduParserRequestOptions,
  BaiduPaddleOcrVlTransformerConfig,
  BaiduTable,
  BaiduTaskOutput
} from './types.js'

type ResolvedSource = {
  fileName: string
  extension: string
  buffer?: Buffer
  fileUrl?: string
}

/** Completed provider task plus the original-page interval represented by that task. */
type CloudBatchResult = {
  batchIndex: number
  sourcePageStart?: number
  sourcePageEnd?: number
  uploadMode: 'base64' | 'url'
  result: BaiduTaskOutput
}

/** Unified parse result for both a single upload and a PDF split into provider-sized batches. */
type CloudBatchCollection = {
  fileName: string
  pageCount?: number
  sourceSha256?: string
  batches: CloudBatchResult[]
}

type BatchAssets = {
  raw: TDocumentAsset[]
  images: Map<string, TDocumentAsset>
}

@Injectable()
export class BaiduOcrTransformService {
  constructor(private readonly client: BaiduCloudParserClient) {}

  validateIntegration(options: BaiduOcrIntegrationOptions): Promise<void> {
    return this.client.validate(options)
  }

  async transform<TConfig extends BaiduBaseTransformerConfig>(
    engine: BaiduParserEngine,
    files: Partial<IKnowledgeDocument>[],
    config: TConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    const fileSystem = config.permissions?.fileSystem
    const integration = config.permissions?.integration
    if (!fileSystem) throw new BaiduOcrError('Baidu OCR requires the knowledge-base file-system permission', { engine })
    if (!isBaiduOcrIntegration(integration)) {
      throw new BaiduOcrError('A Baidu OCR integration connection is required', { engine })
    }

    const output: Partial<IKnowledgeDocument<ChunkMetadata>>[] = []
    for (const file of files) {
      output.push(await this.transformOne(engine, file, integration, fileSystem, config))
    }
    return output
  }

  private async transformOne(
    engine: BaiduParserEngine,
    file: Partial<IKnowledgeDocument>,
    integration: BaiduOcrIntegration,
    fileSystem: XpFileSystem,
    config: BaiduBaseTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>> {
    const outputFolder = path.posix.join('baidu-ocr', safePathSegment(file.id ?? uuid()), engine)
    try {
      const source = await resolveSource(file, fileSystem, integration.options)
      if (!BAIDU_DOCUMENT_EXTENSIONS.has(source.extension)) {
        throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} does not support .${source.extension}`, { engine })
      }
      const collection = await parseCloudSource(
        engine,
        source,
        integration.options,
        requestOptions(engine, config),
        this.client,
        config.tempDir
      )
      return engine === 'paddleocr-vl'
        ? mapPaddleCollection(file, collection, fileSystem, outputFolder, config as BaiduPaddleOcrVlTransformerConfig)
        : mapUnlimitedCollection(file, collection, fileSystem, outputFolder, config.preserveRawOutput !== false)
    } catch (error) {
      throw documentConversionError(engine, error, `Baidu Cloud ${engineLabel(engine)} document conversion failed`)
    }
  }
}

async function resolveSource(
  file: Partial<IKnowledgeDocument>,
  fileSystem: XpFileSystem,
  options: BaiduOcrIntegrationOptions
): Promise<ResolvedSource> {
  const fileName = resolveFileName(file)
  const extension = extensionOf(fileName)
  const filePath = file.filePath?.trim()
  if (filePath) {
    return {
      fileName,
      extension,
      buffer: await fileSystem.readFile(filePath),
      fileUrl: normalizeHttpUrl(file.fileUrl) ?? fileSystem.fullUrl(filePath)
    }
  }

  const fileUrl = normalizeHttpUrl(file.fileUrl)
  if (!fileUrl) throw new Error(`Unable to resolve a readable source for '${fileName}'`)
  if (extension !== 'pdf' && options.uploadMode === 'url') {
    return { fileName, extension, fileUrl }
  }
  const response = await retry(
    () => axios.get<ArrayBuffer>(fileUrl, { responseType: 'arraybuffer', timeout: 120_000 }),
    isRetryableHttpError,
    3
  )
  return { fileName, extension, fileUrl, buffer: Buffer.from(response.data) }
}

async function parseCloudSource(
  engine: BaiduParserEngine,
  source: ResolvedSource,
  options: BaiduOcrIntegrationOptions,
  parserOptions: BaiduParserRequestOptions,
  client: BaiduCloudParserClient,
  tempDir?: string
): Promise<CloudBatchCollection> {
  const sourceSha256 = source.buffer?.length ? createHash('sha256').update(source.buffer).digest('hex') : undefined
  if (source.extension !== 'pdf') {
    const result = await client.parse(engine, buildCloudInput(source), options, parserOptions)
    return {
      fileName: source.fileName,
      sourceSha256,
      batches: [{ batchIndex: 0, uploadMode: resolvedUploadMode(source, options), result }]
    }
  }

  if (!source.buffer?.length) {
    throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} requires readable PDF bytes for page validation`, {
      engine
    })
  }
  const pageCount = await inspectPdf(engine, source.buffer)
  if (pageCount <= BAIDU_MAX_PDF_PAGES) {
    const result = await client.parse(engine, buildCloudInput(source, pageCount), options, parserOptions)
    return {
      fileName: source.fileName,
      pageCount,
      sourceSha256,
      batches: [
        {
          batchIndex: 0,
          sourcePageStart: 1,
          sourcePageEnd: pageCount,
          uploadMode: resolvedUploadMode(source, options),
          result
        }
      ]
    }
  }

  // PDFs above the provider limit are split locally, submitted sequentially, then rebased below.
  let plan: Awaited<ReturnType<typeof prepareBaiduPdfBatches>>
  try {
    plan = await prepareBaiduPdfBatches(source.buffer, source.fileName, tempDir)
  } catch (error) {
    throw new BaiduOcrError(error instanceof Error ? error.message : 'Baidu OCR could not prepare the PDF', { engine })
  }
  try {
    const batches: CloudBatchResult[] = []
    for (const batch of plan.batches) {
      const buffer = await fsPromises.readFile(batch.temporaryPath)
      try {
        const result = await client.parse(
          engine,
          {
            fileName: batch.fileName,
            extension: 'pdf',
            buffer,
            pageCount: batch.pageCount
          },
          { ...options, uploadMode: 'base64' },
          parserOptions
        )
        batches.push({
          batchIndex: batch.batchIndex,
          sourcePageStart: batch.sourcePageStart,
          sourcePageEnd: batch.sourcePageEnd,
          uploadMode: 'base64',
          result
        })
      } catch (error) {
        throw batchError(engine, error, batch, plan.batches.length)
      }
    }
    return { fileName: source.fileName, pageCount: plan.pageCount, sourceSha256, batches }
  } finally {
    await removeBaiduPdfBatchPlan(plan).catch(() => undefined)
  }
}

async function mapPaddleCollection(
  file: Partial<IKnowledgeDocument>,
  collection: CloudBatchCollection,
  fileSystem: XpFileSystem,
  outputFolder: string,
  config: BaiduPaddleOcrVlTransformerConfig
): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>> {
  if (!collection.batches.length) {
    throw new BaiduOcrError('Baidu Cloud PaddleOCR-VL returned no document batches', { engine: 'paddleocr-vl' })
  }
  const preserveRawOutput = config.preserveRawOutput !== false
  const preserveImages = config.preserveImages !== false
  const batchCount = collection.batches.length
  const assets: TDocumentAsset[] = []
  const layoutChunks: Document<BaiduLayoutChunkMetadata>[] = []

  for (const batch of collection.batches) {
    const batchAssets = await archiveBatch(
      fileSystem,
      outputFolder,
      batch,
      batchCount,
      preserveRawOutput,
      preserveImages
    )
    assets.push(...batchAssets.raw, ...batchAssets.images.values())
    const parsed = batch.result.parsed
    if (!parsed?.pages?.length) {
      throw new BaiduOcrError(
        `Baidu Cloud PaddleOCR-VL batch ${batch.batchIndex + 1}/${batchCount} returned no structured pages`,
        batchContext('paddleocr-vl', batch, batchCount)
      )
    }
    for (let pageIndex = 0; pageIndex < parsed.pages.length; pageIndex += 1) {
      const page = parsed.pages[pageIndex]
      const pageChunks = mapPaddlePage(page, pageIndex, batch, batchCount, batchAssets)
      layoutChunks.push(...pageChunks)
    }
  }

  if (!layoutChunks.length) {
    throw new BaiduOcrError('Baidu Cloud PaddleOCR-VL returned no parseable layout blocks', {
      engine: 'paddleocr-vl'
    })
  }
  layoutChunks.forEach((chunk, chunkIndex) => {
    chunk.metadata.chunkIndex = chunkIndex
  })
  const manifest = await archiveManifest(fileSystem, outputFolder, collection, 'paddleocr-vl', preserveRawOutput)
  if (manifest) assets.push(manifest)
  const rawAssets = uniqueAssets(assets.filter((asset) => asset.type === 'file'))
  const merged = mergePaddleLayoutDocuments(layoutChunks)
  const mergedAssets = await archiveMergedMarkdown(fileSystem, outputFolder, merged)
  assets.push(...mergedAssets.assets)
  const trace = documentTrace('paddleocr-vl', collection)

  return {
    id: file.id,
    chunks: [
      new Document<ChunkMetadata>({
        pageContent: merged.markdown,
        metadata: {
          chunkId: uuid(),
          chunkIndex: 0,
          mediaType: 'text',
          contentFormat: 'markdown',
          markdownSourceMap: merged.sourceMap,
          sourceMapAsset: mergedAssets.sourceMapAsset,
          baiduOcr: trace
        }
      })
    ],
    metadata: {
      ...(file.metadata ?? {}),
      chunkId: uuid(),
      parser: BAIDU_PADDLE_OCR_VL,
      assets: uniqueDocumentAssets(assets),
      baiduOcr: trace,
      documentAnalysis: {
        schemaVersion: 1,
        provider: 'baidu-cloud',
        engine: 'paddleocr-vl',
        pageCount: collection.pageCount ?? countStructuredPages(collection),
        coordinateSystem: 'page-top-left',
        markdownAsset: mergedAssets.markdownAsset,
        ...(mergedAssets.analysisAsset ? { analysisAsset: mergedAssets.analysisAsset } : {}),
        sourceMapAsset: mergedAssets.sourceMapAsset,
        rawAssets
      } satisfies BaiduDocumentAnalysisMetadata
    }
  }
}

function mapPaddlePage(
  page: BaiduPage,
  pageIndex: number,
  batch: CloudBatchResult,
  batchCount: number,
  assets: BatchAssets
): Document<BaiduLayoutChunkMetadata>[] {
  // Baidu page_num is zero-based; adding the batch's 1-based start yields a global 1-based page.
  const providerPageNumber = finiteInteger(page.page_num) ?? pageIndex
  const sourcePage = (batch.sourcePageStart ?? 1) + providerPageNumber
  const tables = indexByLayoutId(page.tables)
  const images = indexByLayoutId(page.images)
  const layouts = Array.isArray(page.layouts) ? page.layouts : []
  const pageChunks: Document<BaiduLayoutChunkMetadata>[] = []

  for (let blockIndex = 0; blockIndex < layouts.length; blockIndex += 1) {
    const layout = layouts[blockIndex]
    const layoutId = nonEmpty(layout.layout_id)
    const blockType = nonEmpty(layout.type) ?? 'unknown'
    const table = blockType === 'table' && layoutId ? tables.get(layoutId) : undefined
    const image = isImageLayout(blockType) && layoutId ? images.get(layoutId) : undefined
    const imageAsset = layoutId ? assets.images.get(layoutId) : undefined
    const pageContent = renderLayoutContent(layout, table, image, imageAsset, sourcePage)
    const chunkAssets = uniqueAssets([...assets.raw, ...(imageAsset ? [imageAsset] : [])])
    const metadata: BaiduLayoutChunkMetadata = {
      chunkId: uuid(),
      chunkIndex: 0,
      page: sourcePage,
      mediaType: isImageLayout(blockType) ? 'image' : 'text',
      assets: chunkAssets,
      // The host consumes this before splitting; baiduOcr below remains available for diagnostics.
      documentLayout: buildDocumentLayoutMetadata({
        layout,
        table,
        image,
        imageAsset,
        sourcePage,
        blockIndex,
        pageWidth: finiteNumber(page.meta?.page_width),
        pageHeight: finiteNumber(page.meta?.page_height)
      }),
      baiduOcr: {
        provider: 'baidu-cloud',
        engine: 'paddleocr-vl',
        taskId: batch.result.trace.taskId,
        logId: batch.result.trace.logId,
        batchIndex: batch.batchIndex,
        batchCount,
        sourcePageStart: batch.sourcePageStart,
        sourcePageEnd: batch.sourcePageEnd,
        page: sourcePage,
        providerPageNumber,
        pageId: nonEmpty(page.page_id),
        pageWidth: finiteNumber(page.meta?.page_width),
        pageHeight: finiteNumber(page.meta?.page_height),
        blockIndex,
        layoutId,
        blockType,
        subType: nonEmpty(layout.sub_type),
        position: numberArray(layout.position),
        polygon: polygon(layout.polygon),
        spanBoxes: Array.isArray(layout.span_boxes) ? layout.span_boxes : undefined,
        rawLayout: layout,
        table,
        image,
        rawAsset: assets.raw.find((asset) => asset.filePath.endsWith('parse-result.json'))
      } satisfies BaiduOcrChunkMetadata
    }
    pageChunks.push(new Document({ pageContent, metadata }))
  }

  if (!pageChunks.length && page.text?.trim()) {
    pageChunks.push(
      new Document({
        pageContent: page.text.trim(),
        metadata: {
          chunkId: uuid(),
          chunkIndex: 0,
          page: sourcePage,
          mediaType: 'text',
          assets: assets.raw,
          documentLayout: buildFallbackPageLayoutMetadata(page, sourcePage),
          baiduOcr: {
            provider: 'baidu-cloud',
            engine: 'paddleocr-vl',
            taskId: batch.result.trace.taskId,
            logId: batch.result.trace.logId,
            batchIndex: batch.batchIndex,
            batchCount,
            sourcePageStart: batch.sourcePageStart,
            sourcePageEnd: batch.sourcePageEnd,
            page: sourcePage,
            providerPageNumber,
            pageId: nonEmpty(page.page_id),
            pageWidth: finiteNumber(page.meta?.page_width),
            pageHeight: finiteNumber(page.meta?.page_height),
            blockIndex: 0,
            blockType: 'page_text',
            rawAsset: assets.raw.find((asset) => asset.filePath.endsWith('parse-result.json'))
          } satisfies BaiduOcrChunkMetadata
        }
      })
    )
  }
  return pageChunks
}

async function mapUnlimitedCollection(
  file: Partial<IKnowledgeDocument>,
  collection: CloudBatchCollection,
  fileSystem: XpFileSystem,
  outputFolder: string,
  preserveRawOutput: boolean
): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>> {
  if (!collection.batches.length) {
    throw new BaiduOcrError('Baidu Cloud Unlimited-OCR returned no document batches', { engine: 'unlimited-ocr' })
  }
  const batchCount = collection.batches.length
  const assets: TDocumentAsset[] = []
  const batchChunks: Document<BaiduLayoutChunkMetadata>[] = []
  for (const batch of collection.batches) {
    const markdown = batch.result.markdown.trim()
    if (!markdown) {
      throw new BaiduOcrError(
        `Baidu Cloud Unlimited-OCR batch ${batch.batchIndex + 1}/${batchCount} returned no Markdown`,
        batchContext('unlimited-ocr', batch, batchCount)
      )
    }
    const batchAssets = await archiveBatch(fileSystem, outputFolder, batch, batchCount, preserveRawOutput, false)
    assets.push(...batchAssets.raw)
    batchChunks.push(
      new Document<BaiduLayoutChunkMetadata>({
        pageContent: markdown,
        metadata: {
          chunkId: uuid(),
          chunkIndex: batchChunks.length,
          mediaType: 'text',
          assets: batchAssets.raw,
          baiduOcr: {
            provider: 'baidu-cloud',
            engine: 'unlimited-ocr',
            taskId: batch.result.trace.taskId,
            logId: batch.result.trace.logId,
            batchIndex: batch.batchIndex,
            batchCount,
            sourcePageStart: batch.sourcePageStart,
            sourcePageEnd: batch.sourcePageEnd,
            blockType: 'markdown',
            rawAsset: batchAssets.raw.find((asset) => asset.filePath.endsWith('result.md'))
          } satisfies BaiduOcrChunkMetadata
        }
      })
    )
  }
  const manifest = await archiveManifest(fileSystem, outputFolder, collection, 'unlimited-ocr', preserveRawOutput)
  if (manifest) assets.push(manifest)
  const rawAssets = uniqueAssets(assets.filter((asset) => asset.type === 'file'))
  const merged = mergeUnlimitedMarkdownDocuments(batchChunks)
  const mergedAssets = await archiveMergedMarkdown(fileSystem, outputFolder, merged)
  assets.push(...mergedAssets.assets)
  const trace = documentTrace('unlimited-ocr', collection)
  return {
    id: file.id,
    chunks: [
      new Document<ChunkMetadata>({
        pageContent: merged.markdown,
        metadata: {
          chunkId: uuid(),
          chunkIndex: 0,
          mediaType: 'text',
          contentFormat: 'markdown',
          markdownSourceMap: merged.sourceMap,
          sourceMapAsset: mergedAssets.sourceMapAsset,
          baiduOcr: trace
        }
      })
    ],
    metadata: {
      ...(file.metadata ?? {}),
      chunkId: uuid(),
      parser: BAIDU_UNLIMITED_OCR,
      assets: uniqueDocumentAssets(assets),
      baiduOcr: trace,
      documentAnalysis: {
        schemaVersion: 1,
        provider: 'baidu-cloud',
        engine: 'unlimited-ocr',
        pageCount: collection.pageCount,
        coordinateSystem: 'page-top-left',
        markdownAsset: mergedAssets.markdownAsset,
        sourceMapAsset: mergedAssets.sourceMapAsset,
        rawAssets
      } satisfies BaiduDocumentAnalysisMetadata
    }
  }
}

function buildDocumentLayoutMetadata(input: {
  layout: BaiduLayout
  table?: BaiduTable
  image?: BaiduImage
  imageAsset?: TDocumentAsset
  sourcePage: number
  blockIndex: number
  pageWidth?: number
  pageHeight?: number
}): BaiduDocumentLayoutMetadata | undefined {
  const { layout, table, image, imageAsset, sourcePage, blockIndex, pageWidth, pageHeight } = input
  // Without the provider page dimensions, coordinates cannot be projected safely by the host.
  if (!pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) return undefined
  const providerType = nonEmpty(layout.type) ?? 'unknown'
  return {
    schemaVersion: 1,
    page: sourcePage,
    pageWidth,
    pageHeight,
    blockId: nonEmpty(layout.layout_id) ?? `page-${sourcePage}-block-${blockIndex}`,
    order: blockIndex,
    type: analysisBlockType(providerType),
    providerType,
    providerSubType: nonEmpty(layout.sub_type),
    bounds: validBounds(layout.position, pageWidth, pageHeight),
    polygon: validPolygon(layout.polygon, pageWidth, pageHeight),
    asset: imageAsset,
    raw: {
      layout,
      ...(table ? { table } : {}),
      ...(image ? { image } : {})
    }
  }
}

function buildFallbackPageLayoutMetadata(page: BaiduPage, sourcePage: number): BaiduDocumentLayoutMetadata | undefined {
  const pageWidth = finiteNumber(page.meta?.page_width)
  const pageHeight = finiteNumber(page.meta?.page_height)
  if (!pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) return undefined
  return {
    schemaVersion: 1,
    page: sourcePage,
    pageWidth,
    pageHeight,
    blockId: nonEmpty(page.page_id) ?? `page-${sourcePage}-text`,
    order: 0,
    type: 'text',
    providerType: 'page_text',
    raw: { page }
  }
}

function analysisBlockType(providerType: string): BaiduDocumentAnalysisBlockType {
  if (providerType === 'table') return 'table'
  if (isImageLayout(providerType)) return 'image'
  if (providerType === 'doc_title' || providerType === 'paragraph_title' || providerType === 'figure_title') {
    return 'title'
  }
  if (providerType === 'display_formula' || providerType === 'inline_formula' || providerType === 'formula_number') {
    return 'formula'
  }
  if (providerType === 'header') return 'header'
  if (providerType === 'footer') return 'footer'
  if (providerType === 'footnote') return 'footnote'
  if (providerType === 'number') return 'page-number'
  if (providerType === 'seal') return 'seal'
  if (
    providerType === 'text' ||
    providerType === 'abstract' ||
    providerType === 'algorithm' ||
    providerType === 'aside_text' ||
    providerType === 'content' ||
    providerType === 'reference' ||
    providerType === 'reference_content' ||
    providerType === 'vertical_text'
  ) {
    return 'text'
  }
  return 'other'
}

function validBounds(
  value: unknown,
  pageWidth: number,
  pageHeight: number
): BaiduDocumentLayoutMetadata['bounds'] | undefined {
  const position = numberArray(value)
  if (!position || position.length !== 4) return undefined
  const [x, y, width, height] = position
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return undefined
  // A 1% tolerance absorbs provider rounding while rejecting coordinates from a mismatched page.
  if (x + width > pageWidth * 1.01 || y + height > pageHeight * 1.01) return undefined
  return { x, y, width, height }
}

function validPolygon(
  value: unknown,
  pageWidth: number,
  pageHeight: number
): BaiduDocumentLayoutMetadata['polygon'] | undefined {
  const points = polygon(value)
  if (!points || !Array.isArray(points[0])) return undefined
  const nested = points as number[][]
  if (nested.length < 3 || nested.some((point) => point.length < 2)) return undefined
  if (nested.some(([x, y]) => x < 0 || y < 0 || x > pageWidth * 1.01 || y > pageHeight * 1.01)) {
    return undefined
  }
  return nested.map(([x, y]) => ({ x, y }))
}

function countStructuredPages(collection: CloudBatchCollection): number {
  return collection.batches.reduce((total, batch) => total + (batch.result.parsed?.pages?.length ?? 0), 0)
}

async function archiveBatch(
  fileSystem: XpFileSystem,
  outputFolder: string,
  batch: CloudBatchResult,
  batchCount: number,
  preserveRawOutput: boolean,
  preserveImages: boolean
): Promise<BatchAssets> {
  const raw: TDocumentAsset[] = []
  const folder = batchFolder(batch, batchCount)
  if (preserveRawOutput) {
    raw.push(
      await writeAsset(fileSystem, outputFolder, path.posix.join(folder, 'result.md'), batch.result.markdown, 'file')
    )
    raw.push(
      await writeAsset(
        fileSystem,
        outputFolder,
        path.posix.join(folder, 'task-response.json'),
        JSON.stringify(batch.result.rawResponse, null, 2),
        'file'
      )
    )
    if (batch.result.rawJson?.trim()) {
      raw.push(
        await writeAsset(
          fileSystem,
          outputFolder,
          path.posix.join(folder, 'parse-result.json'),
          batch.result.rawJson,
          'file'
        )
      )
    }
  }

  // Layout ids provide the stable join between page.layouts, page.images, and archived assets.
  const images = new Map<string, TDocumentAsset>()
  if (preserveImages && batch.result.parsed?.pages) {
    for (const page of batch.result.parsed.pages) {
      for (const image of page.images ?? []) {
        const layoutId = nonEmpty(image.layout_id)
        const dataUrl = nonEmpty(image.data_url)
        if (!layoutId || !dataUrl || images.has(layoutId)) continue
        const downloaded = await downloadResultImage(dataUrl).catch(() => undefined)
        if (!downloaded) continue
        const safeLayoutId = safePathSegment(layoutId)
        const asset = await writeAsset(
          fileSystem,
          outputFolder,
          path.posix.join(folder, 'images', `${safeLayoutId}.${downloaded.extension}`),
          downloaded.buffer,
          'image'
        )
        images.set(layoutId, asset)
      }
    }
  }
  return { raw, images }
}

async function archiveManifest(
  fileSystem: XpFileSystem,
  outputFolder: string,
  collection: CloudBatchCollection,
  engine: BaiduParserEngine,
  preserveRawOutput: boolean
): Promise<TDocumentAsset | undefined> {
  if (!preserveRawOutput || collection.batches.length <= 1) return undefined
  return writeAsset(
    fileSystem,
    outputFolder,
    'batch-manifest.json',
    JSON.stringify(
      {
        provider: 'baidu-cloud',
        engine,
        fileName: collection.fileName,
        pageCount: collection.pageCount,
        sourceSha256: collection.sourceSha256,
        batchCount: collection.batches.length,
        batches: documentTrace(engine, collection).batches
      },
      null,
      2
    ),
    'file'
  )
}

function renderLayoutContent(
  layout: BaiduLayout,
  table: BaiduTable | undefined,
  image: BaiduImage | undefined,
  imageAsset: TDocumentAsset | undefined,
  sourcePage: number
): string {
  const blockType = nonEmpty(layout.type) ?? 'unknown'
  if (blockType === 'table') {
    return (
      nonEmpty(table?.markdown) ??
      nonEmpty(table?.table_html) ??
      nonEmpty(layout.text) ??
      `[Table block ${nonEmpty(layout.layout_id) ?? 'unknown'} on page ${sourcePage}]`
    )
  }
  if (isImageLayout(blockType)) {
    const description = nonEmpty(image?.image_description)
    if (description) return description
    const url = imageAsset?.url ?? nonEmpty(image?.data_url)
    return url
      ? `![${blockType} on page ${sourcePage}](${url})`
      : `[${blockType} block ${nonEmpty(layout.layout_id) ?? 'unknown'} on page ${sourcePage}]`
  }
  const text = nonEmpty(layout.text)
  if (!text) return `[${blockType} block ${nonEmpty(layout.layout_id) ?? 'unknown'} on page ${sourcePage}]`
  const headingLevel = titleLevel(layout)
  return headingLevel ? `${'#'.repeat(headingLevel)} ${text}` : text
}

function titleLevel(layout: BaiduLayout): number | undefined {
  const type = nonEmpty(layout.type)
  if (type !== 'doc_title' && type !== 'paragraph_title' && type !== 'title') return undefined
  const subType = nonEmpty(layout.sub_type)
  const explicit = subType?.match(/(?:^|[^0-9])([1-6])(?:$|[^0-9])/)
  if (explicit) return Number(explicit[1])
  return type === 'doc_title' ? 1 : 2
}

async function downloadResultImage(url: string): Promise<{ buffer: Buffer; extension: string } | undefined> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  const response = await retry(
    () =>
      axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: 20 * 1024 * 1024,
        maxBodyLength: 20 * 1024 * 1024
      }),
    isRetryableHttpError,
    3
  )
  const contentType = String(response.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
  const extension = imageExtension(contentType, parsed.pathname)
  return { buffer: Buffer.from(response.data), extension }
}

function imageExtension(contentType: string, pathname: string): string {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/bmp') return 'bmp'
  if (contentType === 'image/tiff') return 'tiff'
  const extension = path.extname(pathname).slice(1).toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff'].includes(extension) ? extension : 'bin'
}

function requestOptions(engine: BaiduParserEngine, config: BaiduBaseTransformerConfig): BaiduParserRequestOptions {
  if (engine !== 'paddleocr-vl') return {}
  const paddle = config as BaiduPaddleOcrVlTransformerConfig
  return {
    analysisChart: paddle.analysisChart === true,
    mergeTables: paddle.mergeTables !== false,
    relevelTitles: paddle.relevelTitles !== false,
    recognizeSeal: paddle.recognizeSeal === true,
    returnSpanBoxes: paddle.returnSpanBoxes !== false
  }
}

function buildCloudInput(source: ResolvedSource, pageCount?: number): BaiduCloudDocumentInput {
  return {
    fileName: source.fileName,
    extension: source.extension,
    buffer: source.buffer,
    fileUrl: source.fileUrl,
    pageCount
  }
}

async function inspectPdf(engine: BaiduParserEngine, buffer: Buffer): Promise<number> {
  try {
    return await getPdfPageCount(buffer)
  } catch (error) {
    throw new BaiduOcrError(error instanceof Error ? error.message : 'Baidu OCR could not inspect the PDF', { engine })
  }
}

function batchError(
  engine: BaiduParserEngine,
  error: unknown,
  batch: { batchIndex: number; sourcePageStart: number; sourcePageEnd: number },
  batchCount: number
): BaiduOcrError {
  const normalized = normalizeBaiduError(engine, error, `Baidu Cloud ${engineLabel(engine)} PDF batch failed`)
  return new BaiduOcrError(
    `Baidu Cloud ${engineLabel(engine)} batch ${batch.batchIndex + 1}/${batchCount} (source pages ${
      batch.sourcePageStart
    }-${batch.sourcePageEnd}) failed: ${normalized.message}`,
    {
      engine,
      status: normalized.status,
      code: normalized.code,
      taskId: normalized.taskId,
      logId: normalized.logId,
      batchIndex: batch.batchIndex,
      batchCount,
      sourcePageStart: batch.sourcePageStart,
      sourcePageEnd: batch.sourcePageEnd,
      retryable: normalized.retryable
    }
  )
}

function batchContext(
  engine: BaiduParserEngine,
  batch: CloudBatchResult,
  batchCount: number
): ConstructorParameters<typeof BaiduOcrError>[1] {
  return {
    engine,
    taskId: batch.result.trace.taskId,
    logId: batch.result.trace.logId,
    batchIndex: batch.batchIndex,
    batchCount,
    sourcePageStart: batch.sourcePageStart,
    sourcePageEnd: batch.sourcePageEnd
  }
}

function documentTrace(engine: BaiduParserEngine, collection: CloudBatchCollection): Record<string, unknown> {
  const batchCount = collection.batches.length
  const batches: BaiduBatchTrace[] = collection.batches.map((batch) => ({
    batchIndex: batch.batchIndex,
    batchCount,
    sourcePageStart: batch.sourcePageStart,
    sourcePageEnd: batch.sourcePageEnd,
    taskId: batch.result.trace.taskId,
    logId: batch.result.trace.logId,
    uploadMode: batch.uploadMode
  }))
  return {
    provider: 'baidu-cloud',
    engine,
    pageCount: collection.pageCount,
    sourceSha256: collection.sourceSha256,
    batchCount,
    batches
  }
}

function batchFolder(batch: CloudBatchResult, batchCount: number): string {
  if (batchCount === 1) return ''
  const start = batch.sourcePageStart ? String(batch.sourcePageStart).padStart(4, '0') : 'unknown'
  const end = batch.sourcePageEnd ? String(batch.sourcePageEnd).padStart(4, '0') : 'unknown'
  return path.posix.join('parts', `part-${String(batch.batchIndex + 1).padStart(4, '0')}-pages-${start}-${end}`)
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

function isBaiduOcrIntegration(integration: IIntegration | undefined): integration is BaiduOcrIntegration {
  return Boolean(
    integration?.provider === BAIDU_OCR &&
      integration.options &&
      typeof integration.options === 'object' &&
      !Array.isArray(integration.options)
  )
}

function resolveFileName(file: Partial<IKnowledgeDocument>): string {
  const value = file.name?.trim() || file.filePath?.trim() || file.fileUrl?.trim()
  if (!value) throw new Error('Baidu OCR document name is required')
  if (/^https?:\/\//i.test(value)) return path.posix.basename(new URL(value).pathname) || 'document'
  return path.basename(value)
}

function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase()
}

function normalizeHttpUrl(value?: string | null): string | undefined {
  const normalized = value?.trim()
  if (!normalized) return undefined
  try {
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:' ? normalized : undefined
  } catch {
    return undefined
  }
}

function resolvedUploadMode(source: ResolvedSource, options: BaiduOcrIntegrationOptions): 'base64' | 'url' {
  if (options.uploadMode === 'base64') return 'base64'
  if (options.uploadMode === 'url') return 'url'
  return source.buffer?.length && source.buffer.length <= BAIDU_MAX_BASE64_BYTES ? 'base64' : 'url'
}

function engineLabel(engine: BaiduParserEngine): string {
  return engine === 'paddleocr-vl' ? 'PaddleOCR-VL' : 'Unlimited-OCR'
}

function indexByLayoutId<T extends { layout_id?: string }>(values: T[] | undefined): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values ?? []) {
    const id = nonEmpty(value.layout_id)
    if (id) result.set(id, value)
  }
  return result
}

function isImageLayout(type: string): boolean {
  return type === 'image' || type === 'chart' || type === 'header_image' || type === 'footer_image'
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function numberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? value
    : undefined
}

function polygon(value: unknown): number[][] | number[] | undefined {
  if (numberArray(value)) return numberArray(value)
  if (
    Array.isArray(value) &&
    value.every(
      (point) => Array.isArray(point) && point.every((item) => typeof item === 'number' && Number.isFinite(item))
    )
  ) {
    return value as number[][]
  }
  return undefined
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || uuid()
}

function uniqueAssets(assets: TDocumentAsset[]): TDocumentAsset[] {
  const seen = new Set<string>()
  return assets.filter((asset) => {
    if (seen.has(asset.filePath)) return false
    seen.add(asset.filePath)
    return true
  })
}

export const baiduTransformTestHelpers = {
  requestOptions,
  renderLayoutContent,
  titleLevel,
  mapPaddlePage,
  resolvedUploadMode,
  analysisBlockType,
  validBounds,
  validPolygon
}
