import type { IIntegration, TDocumentAsset } from '@xpert-ai/contracts'
import type { TDocumentTransformerConfig } from '@xpert-ai/plugin-sdk'

export type BaiduParserEngine = 'paddleocr-vl' | 'unlimited-ocr'
export type BaiduUploadMode = 'auto' | 'base64' | 'url'

export type BaiduOcrIntegrationOptions = {
  apiKey: string
  secretKey: string
  uploadMode?: BaiduUploadMode
  pollIntervalSeconds?: number
  taskTimeoutSeconds?: number
}

export type BaiduOcrIntegration = IIntegration<BaiduOcrIntegrationOptions>

export type BaiduBaseTransformerConfig = TDocumentTransformerConfig & {
  /** Archives provider responses for diagnostics and structured preview reconstruction. */
  preserveRawOutput?: boolean
}

export type BaiduPaddleOcrVlTransformerConfig = BaiduBaseTransformerConfig & {
  analysisChart?: boolean
  mergeTables?: boolean
  relevelTitles?: boolean
  recognizeSeal?: boolean
  returnSpanBoxes?: boolean
  preserveImages?: boolean
}

export type BaiduUnlimitedOcrTransformerConfig = BaiduBaseTransformerConfig

/** Normalized input boundary shared by upload-mode selection and both Baidu engines. */
export type BaiduCloudDocumentInput = {
  fileName: string
  extension: string
  buffer?: Buffer
  fileUrl?: string
  pageCount?: number
}

export type BaiduPaddleRequestOptions = {
  analysisChart: boolean
  mergeTables: boolean
  relevelTitles: boolean
  recognizeSeal: boolean
  returnSpanBoxes: boolean
}

export type BaiduParserRequestOptions = BaiduPaddleRequestOptions | Record<string, never>

export type BaiduTaskTrace = {
  engine: BaiduParserEngine
  taskId: string
  logId?: string
}

/** Engine-independent result returned after the asynchronous Baidu task finishes. */
export type BaiduTaskOutput = {
  markdown: string
  rawJson?: string
  parsed?: BaiduParseResult
  trace: BaiduTaskTrace
  rawResponse: Record<string, unknown>
}

/** PaddleOCR-VL provider payload. Unknown fields are retained instead of guessed or discarded. */
export type BaiduLayout = {
  layout_id?: string
  text?: string
  /** Official PaddleOCR-VL rectangle format: [x, y, width, height]. */
  position?: number[]
  polygon?: number[][] | number[]
  span_boxes?: unknown[]
  type?: string
  sub_type?: string
  [key: string]: unknown
}

export type BaiduTable = {
  layout_id?: string
  markdown?: string
  table_html?: string
  position?: number[]
  cells?: unknown[]
  matrix?: unknown[][]
  merge_table?: string
  [key: string]: unknown
}

export type BaiduImage = {
  layout_id?: string
  position?: number[]
  data_url?: string
  image_description?: string
  [key: string]: unknown
}

/** One provider page; `page_num` is zero-based in the PaddleOCR-VL response. */
export type BaiduPage = {
  page_id?: string
  page_num?: number
  text?: string
  layouts?: BaiduLayout[]
  tables?: BaiduTable[]
  images?: BaiduImage[]
  meta?: {
    page_width?: number
    page_height?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type BaiduParseResult = {
  file_name?: string
  file_id?: string
  pages?: BaiduPage[]
  [key: string]: unknown
}

/** Maps a provider task back to its original global PDF page interval. */
export type BaiduBatchTrace = {
  batchIndex: number
  batchCount: number
  sourcePageStart?: number
  sourcePageEnd?: number
  taskId: string
  logId?: string
  uploadMode: 'base64' | 'url'
}

/** Lossless provider-specific metadata kept alongside the provider-neutral layout contract. */
export type BaiduOcrChunkMetadata = {
  provider: 'baidu-cloud'
  engine: BaiduParserEngine
  taskId?: string
  logId?: string
  batchIndex?: number
  batchCount?: number
  sourcePageStart?: number
  sourcePageEnd?: number
  page?: number
  providerPageNumber?: number
  pageId?: string
  pageWidth?: number
  pageHeight?: number
  blockIndex?: number
  layoutId?: string
  blockType?: string
  subType?: string
  position?: number[]
  polygon?: number[][] | number[]
  spanBoxes?: unknown[]
  rawLayout?: BaiduLayout
  table?: BaiduTable
  image?: BaiduImage
  rawAsset?: TDocumentAsset
}

export type BaiduDocumentAnalysisBlockType =
  | 'text'
  | 'title'
  | 'table'
  | 'image'
  | 'formula'
  | 'header'
  | 'footer'
  | 'footnote'
  | 'page-number'
  | 'seal'
  | 'other'

/**
 * Mirrors the provider-neutral host contract. It remains local until the next
 * published @xpert-ai/contracts version becomes the plugin peer baseline.
 */
export type BaiduDocumentLayoutMetadata = {
  schemaVersion: 1
  /** Global 1-based page after rebasing a provider batch onto the original document. */
  page: number
  pageWidth: number
  pageHeight: number
  blockId: string
  order: number
  type: BaiduDocumentAnalysisBlockType
  providerType?: string
  providerSubType?: string
  /** Provider coordinates are preserved as [x, y, width, height], not normalized. */
  bounds?: { x: number; y: number; width: number; height: number }
  polygon?: Array<{ x: number; y: number }>
  asset?: TDocumentAsset
  raw?: Record<string, unknown>
}

/** Document-level marker that enables host-side analysis snapshot materialization. */
export type BaiduDocumentAnalysisMetadata = {
  schemaVersion: 1
  provider: 'baidu-cloud'
  engine: BaiduParserEngine
  pageCount?: number
  coordinateSystem: 'page-top-left'
  markdownAsset?: TDocumentAsset
  rawAssets?: TDocumentAsset[]
}
