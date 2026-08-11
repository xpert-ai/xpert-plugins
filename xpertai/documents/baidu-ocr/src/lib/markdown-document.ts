import { Document } from '@langchain/core/documents'
import type { TDocumentAsset } from '@xpert-ai/contracts'
import type { XpFileSystem } from '@xpert-ai/plugin-sdk'
import path from 'node:path'
import type {
  BaiduDocumentAnalysisSource,
  BaiduLayoutChunkMetadata,
  BaiduMarkdownSourceMap,
  BaiduMarkdownSourceMapEntry
} from './types.js'

export type MergedBaiduMarkdown = {
  markdown: string
  analysis?: BaiduDocumentAnalysisSource
  sourceMap: BaiduMarkdownSourceMap
}

export type MergedBaiduMarkdownAssets = {
  markdownAsset: TDocumentAsset
  analysisAsset?: TDocumentAsset
  sourceMapAsset: TDocumentAsset
  assets: TDocumentAsset[]
}

/**
 * Converts provider layout fragments into the single Markdown input expected by generic host splitters.
 * The parallel analysis payload preserves the original page/block geometry for the preview pipeline.
 */
export function mergePaddleLayoutDocuments(
  chunks: Document<BaiduLayoutChunkMetadata>[]
): MergedBaiduMarkdown {
  const ordered = orderLayoutDocuments(chunks)
  const entries: BaiduMarkdownSourceMapEntry[] = []
  const pageRecords = new Map<number, BaiduDocumentAnalysisSource['pages'][number]>()
  let markdown = ''

  for (const chunk of ordered) {
    const content = chunk.pageContent.trim()
    if (!content) continue
    const page = sourcePage(chunk)
    const separator = markdown ? '\n\n' : ''
    markdown += separator
    const startOffset = markdown.length
    markdown += content
    const endOffset = markdown.length
    const layout = chunk.metadata.documentLayout
    const asset = layout?.asset

    entries.push({
      startOffset,
      endOffset,
      pageStart: page,
      pageEnd: page,
      ...(layout?.blockId ? { blockIds: [layout.blockId] } : {}),
      ...(asset ? { assets: [asset] } : {})
    })

    if (!layout) continue
    const record = pageRecords.get(layout.page) ?? {
      schemaVersion: 1,
      page: layout.page,
      width: layout.pageWidth,
      height: layout.pageHeight,
      blocks: []
    }
    if (record.width !== layout.pageWidth || record.height !== layout.pageHeight) continue
    record.blocks.push({
      id: layout.blockId,
      order: layout.order,
      type: layout.type,
      ...(layout.providerType ? { providerType: layout.providerType } : {}),
      ...(layout.providerSubType ? { providerSubType: layout.providerSubType } : {}),
      markdown: content,
      ...(layout.bounds ? { bounds: layout.bounds } : {}),
      ...(layout.polygon ? { polygon: layout.polygon } : {}),
      ...(asset ? { asset } : {}),
      ...(layout.raw ? { raw: layout.raw } : {})
    })
    pageRecords.set(layout.page, record)
  }

  const pages = [...pageRecords.values()]
    .sort((left, right) => left.page - right.page)
    .map((page) => ({ ...page, blocks: page.blocks.sort((left, right) => left.order - right.order) }))

  return {
    markdown,
    ...(pages.length ? { analysis: { schemaVersion: 1, pages } as const } : {}),
    sourceMap: { schemaVersion: 1, entries }
  }
}

/** Merges provider-sized Unlimited-OCR batches back into one source-document Markdown stream. */
export function mergeUnlimitedMarkdownDocuments(
  chunks: Document<BaiduLayoutChunkMetadata>[]
): Pick<MergedBaiduMarkdown, 'markdown' | 'sourceMap'> {
  const entries: BaiduMarkdownSourceMapEntry[] = []
  let markdown = ''
  for (const chunk of chunks) {
    const content = chunk.pageContent.trim()
    if (!content) continue
    markdown += markdown ? '\n\n' : ''
    const startOffset = markdown.length
    markdown += content
    const pageStart = positiveInteger(chunk.metadata.baiduOcr.sourcePageStart) ?? 1
    const pageEnd = positiveInteger(chunk.metadata.baiduOcr.sourcePageEnd) ?? pageStart
    entries.push({ startOffset, endOffset: markdown.length, pageStart, pageEnd })
  }
  return { markdown, sourceMap: { schemaVersion: 1, entries } }
}

/** Archives the canonical Markdown and its compact preview/provenance sidecars in the plugin workspace. */
export async function archiveMergedMarkdown(
  fileSystem: XpFileSystem,
  outputFolder: string,
  merged: MergedBaiduMarkdown
): Promise<MergedBaiduMarkdownAssets> {
  const markdownAsset = await writeAsset(fileSystem, outputFolder, 'document.md', merged.markdown)
  const sourceMapAsset = await writeAsset(
    fileSystem,
    outputFolder,
    'markdown-source-map.json',
    JSON.stringify(merged.sourceMap)
  )
  const analysisAsset = merged.analysis
    ? await writeAsset(fileSystem, outputFolder, 'analysis-source.json', JSON.stringify(merged.analysis))
    : undefined
  return {
    markdownAsset,
    ...(analysisAsset ? { analysisAsset } : {}),
    sourceMapAsset,
    assets: [markdownAsset, sourceMapAsset, ...(analysisAsset ? [analysisAsset] : [])]
  }
}

function orderLayoutDocuments(chunks: Document<BaiduLayoutChunkMetadata>[]) {
  return chunks
    .map((chunk, index) => ({ chunk, index }))
    .sort((left, right) => {
      const pageDifference = sourcePage(left.chunk) - sourcePage(right.chunk)
      if (pageDifference) return pageDifference
      const leftOrder = left.chunk.metadata.documentLayout?.order ?? left.chunk.metadata.baiduOcr.blockIndex ?? left.index
      const rightOrder =
        right.chunk.metadata.documentLayout?.order ?? right.chunk.metadata.baiduOcr.blockIndex ?? right.index
      return leftOrder - rightOrder || left.index - right.index
    })
    .map(({ chunk }) => chunk)
}

function sourcePage(chunk: Document<BaiduLayoutChunkMetadata>) {
  return (
    positiveInteger(chunk.metadata.documentLayout?.page) ?? positiveInteger(chunk.metadata.baiduOcr.page) ?? 1
  )
}

function positiveInteger(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined
}

export function uniqueDocumentAssets(assets: TDocumentAsset[]) {
  return [...new Map(assets.map((asset) => [asset.filePath, asset])).values()]
}

async function writeAsset(fileSystem: XpFileSystem, outputFolder: string, fileName: string, content: string) {
  const filePath = path.posix.join(outputFolder, fileName)
  const url = await fileSystem.writeFile(filePath, content)
  return { type: 'file', filePath, url } satisfies TDocumentAsset
}
