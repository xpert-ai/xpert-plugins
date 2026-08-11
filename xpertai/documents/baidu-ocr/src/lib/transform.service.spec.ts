jest.mock('@xpert-ai/plugin-sdk', () => ({
  XpFileSystem: class {
    private readonly files = new Map<string, Buffer>()

    fullUrl(filePath: string) {
      return `https://assets.example/knowledge/${filePath}`
    }

    async readFile(filePath: string) {
      const content = this.files.get(filePath)
      if (!content) throw new Error(`Missing test file ${filePath}`)
      return content
    }

    async writeFile(filePath: string, content: string | Buffer) {
      this.files.set(filePath, Buffer.isBuffer(content) ? content : Buffer.from(content))
      return this.fullUrl(filePath)
    }

    async exists(filePath: string) {
      return this.files.has(filePath)
    }
  }
}))

import axios, { type InternalAxiosRequestConfig } from 'axios'
import { XpFileSystem } from '@xpert-ai/plugin-sdk'
import { BaiduCloudParserClient, baiduCloudClientTestHelpers } from './baidu-cloud.client.js'
import {
  BAIDU_PADDLE_QUERY_URL,
  BAIDU_PADDLE_SUBMIT_URL,
  BAIDU_TOKEN_URL,
  BAIDU_UNLIMITED_QUERY_URL,
  BAIDU_UNLIMITED_SUBMIT_URL
} from './constants.js'
import { BaiduOcrTransformService, baiduTransformTestHelpers } from './transform.service.js'
import type { BaiduOcrIntegration } from './types.js'

const integration: BaiduOcrIntegration = {
  name: 'Baidu OCR test',
  slug: 'baidu-ocr-test',
  provider: 'baidu-ocr',
  options: {
    apiKey: 'test-api-key',
    secretKey: 'test-secret-key',
    uploadMode: 'base64',
    pollIntervalSeconds: 1,
    taskTimeoutSeconds: 30
  }
}

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlpcAAAAASUVORK5CYII=',
  'base64'
)

describe('BaiduOcrTransformService', () => {
  beforeEach(() => {
    baiduCloudClientTestHelpers.tokenCache.clear()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('merges PaddleOCR-VL layouts into one Markdown document and archives structured analysis', async () => {
    const parsed = {
      file_name: 'input.png',
      file_id: 'file-1',
      pages: [
        {
          page_id: 'page-0',
          page_num: 0,
          text: 'Contract\nTable content',
          meta: { page_width: 1000, page_height: 1400 },
          layouts: [
            {
              layout_id: 'layout-title',
              text: 'Contract',
              position: [10, 20, 300, 40],
              polygon: [
                [10, 20],
                [310, 20],
                [310, 60],
                [10, 60]
              ],
              span_boxes: [{ text: ['Contract'], location: [10, 20, 300, 40] }],
              type: 'doc_title',
              sub_type: 'level-1'
            },
            {
              layout_id: 'layout-table',
              text: '',
              position: [10, 100, 800, 500],
              type: 'table'
            },
            {
              layout_id: 'layout-image',
              text: '',
              position: [10, 650, 400, 300],
              type: 'image'
            }
          ],
          tables: [
            {
              layout_id: 'layout-table',
              markdown: '| A | B |\n|---|---|\n| 1 | 2 |',
              position: [10, 100, 800, 500],
              cells: [{ layout_id: 'cell-1', text: 'A', position: [10, 100, 20, 20], type: 'text' }],
              matrix: [[0]],
              merge_table: 'begin'
            }
          ],
          images: [
            {
              layout_id: 'layout-image',
              position: [10, 650, 400, 300],
              data_url: 'https://result.example/image.png',
              image_description: '{"summary":"trend chart"}'
            }
          ]
        }
      ]
    }
    const client = clientFor({
      submitUrl: BAIDU_PADDLE_SUBMIT_URL,
      queryUrl: BAIDU_PADDLE_QUERY_URL,
      taskId: 'paddle-task',
      markdown: '# Contract',
      parsed
    })
    const service = new BaiduOcrTransformService(client)
    const fileSystem = new XpFileSystem(
      { type: 'filesystem', operations: ['read', 'write', 'list'], scope: [] },
      '/virtual',
      'https://assets.example/knowledge'
    )
    await fileSystem.writeFile('input.png', onePixelPng)

    const promise = service.transform(
      'paddleocr-vl',
      [{ id: 'document-1', name: 'input.png', filePath: 'input.png' }],
      {
        stage: 'test',
        analysisChart: true,
        mergeTables: true,
        relevelTitles: true,
        recognizeSeal: false,
        returnSpanBoxes: true,
        preserveRawOutput: true,
        preserveImages: false,
        permissions: { fileSystem, integration }
      }
    )
    await jest.advanceTimersByTimeAsync(1_000)
    const [result] = await promise

    expect(result.metadata).toMatchObject({
      parser: 'baidu-paddleocr-vl',
      baiduOcr: { provider: 'baidu-cloud', engine: 'paddleocr-vl', batchCount: 1 },
      documentAnalysis: {
        schemaVersion: 1,
        provider: 'baidu-cloud',
        engine: 'paddleocr-vl',
        pageCount: 1,
        coordinateSystem: 'page-top-left'
      }
    })
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks?.[0].pageContent).toBe(
      '# Contract\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n{"summary":"trend chart"}'
    )
    expect(result.chunks?.[0].metadata).toMatchObject({
      contentFormat: 'markdown',
      baiduOcr: { provider: 'baidu-cloud', engine: 'paddleocr-vl', batchCount: 1 },
      markdownSourceMap: {
        schemaVersion: 1,
        entries: [
          expect.objectContaining({ pageStart: 1, pageEnd: 1, blockIds: ['layout-title'] }),
          expect.objectContaining({ pageStart: 1, pageEnd: 1, blockIds: ['layout-table'] }),
          expect.objectContaining({ pageStart: 1, pageEnd: 1, blockIds: ['layout-image'] })
        ]
      }
    })
    expect(result.chunks?.[0].metadata.documentLayout).toBeUndefined()
    await expect(fileSystem.exists('baidu-ocr/document-1/paddleocr-vl/result.md')).resolves.toBe(true)
    await expect(fileSystem.exists('baidu-ocr/document-1/paddleocr-vl/parse-result.json')).resolves.toBe(true)
    await expect(fileSystem.exists('baidu-ocr/document-1/paddleocr-vl/task-response.json')).resolves.toBe(true)
    await expect(fileSystem.exists('baidu-ocr/document-1/paddleocr-vl/document.md')).resolves.toBe(true)
    await expect(fileSystem.exists('baidu-ocr/document-1/paddleocr-vl/analysis-source.json')).resolves.toBe(true)
    await expect(fileSystem.exists('baidu-ocr/document-1/paddleocr-vl/markdown-source-map.json')).resolves.toBe(true)

    const analysis = JSON.parse(
      (await fileSystem.readFile('baidu-ocr/document-1/paddleocr-vl/analysis-source.json')).toString()
    )
    expect(analysis.pages[0].blocks).toEqual([
      expect.objectContaining({
        id: 'layout-title',
        type: 'title',
        markdown: '# Contract',
        bounds: { x: 10, y: 20, width: 300, height: 40 }
      }),
      expect.objectContaining({ id: 'layout-table', type: 'table' }),
      expect.objectContaining({ id: 'layout-image', type: 'image' })
    ])
  })

  it('keeps Unlimited-OCR as a separate strategy using the shared Baidu connection', async () => {
    const service = new BaiduOcrTransformService(
      clientFor({
        submitUrl: BAIDU_UNLIMITED_SUBMIT_URL,
        queryUrl: BAIDU_UNLIMITED_QUERY_URL,
        taskId: 'unlimited-task',
        markdown: '# Unlimited result'
      })
    )
    const fileSystem = new XpFileSystem(
      { type: 'filesystem', operations: ['read', 'write', 'list'], scope: [] },
      '/virtual',
      'https://assets.example/knowledge'
    )
    await fileSystem.writeFile('input.png', onePixelPng)
    const promise = service.transform(
      'unlimited-ocr',
      [{ id: 'document-2', name: 'input.png', filePath: 'input.png' }],
      {
        stage: 'test',
        preserveRawOutput: true,
        permissions: { fileSystem, integration }
      }
    )
    await jest.advanceTimersByTimeAsync(1_000)
    const [result] = await promise

    expect(result.metadata).toMatchObject({
      parser: 'baidu-unlimited-ocr',
      baiduOcr: { provider: 'baidu-cloud', engine: 'unlimited-ocr' },
      documentAnalysis: {
        schemaVersion: 1,
        provider: 'baidu-cloud',
        engine: 'unlimited-ocr',
        coordinateSystem: 'page-top-left'
      }
    })
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks?.[0].pageContent).toBe('# Unlimited result')
    expect(result.chunks?.[0].metadata).toMatchObject({
      contentFormat: 'markdown',
      baiduOcr: { engine: 'unlimited-ocr', batchCount: 1 },
      markdownSourceMap: { schemaVersion: 1, entries: [expect.objectContaining({ pageStart: 1, pageEnd: 1 })] }
    })
    expect(result.chunks?.[0].metadata.documentLayout).toBeUndefined()
  })

  it('keeps provider coordinates raw but suppresses invalid preview boundaries', () => {
    expect(baiduTransformTestHelpers.validBounds([10, 20, 300, 40], 1000, 1400)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 40
    })
    expect(baiduTransformTestHelpers.validBounds([950, 20, 300, 40], 1000, 1400)).toBeUndefined()
    expect(
      baiduTransformTestHelpers.validPolygon(
        [
          [10, 20],
          [310, 20],
          [310, 60],
          [10, 60]
        ],
        1000,
        1400
      )
    ).toEqual([
      { x: 10, y: 20 },
      { x: 310, y: 20 },
      { x: 310, y: 60 },
      { x: 10, y: 60 }
    ])
    expect(
      baiduTransformTestHelpers.validPolygon(
        [
          [10, 20],
          [310, 20],
          [1200, 60],
          [10, 60]
        ],
        1000,
        1400
      )
    ).toBeUndefined()
  })

  it('maps a batched provider page back to its global PDF page number', () => {
    const [chunk] = baiduTransformTestHelpers.mapPaddlePage(
      {
        page_num: 159,
        meta: { page_width: 1000, page_height: 1400 },
        layouts: [{ layout_id: 'page-660-title', type: 'doc_title', text: 'Page 660' }]
      },
      159,
      {
        batchIndex: 1,
        sourcePageStart: 501,
        sourcePageEnd: 815,
        result: { trace: { taskId: 'task-2' } }
      } as never,
      2,
      { raw: [], images: new Map() }
    )

    expect(chunk.metadata.page).toBe(660)
    expect(chunk.metadata.documentLayout).toMatchObject({ page: 660, blockId: 'page-660-title' })
    expect(chunk.metadata.baiduOcr).toMatchObject({ page: 660, providerPageNumber: 159, sourcePageStart: 501 })
  })
})

function clientFor(input: {
  submitUrl: string
  queryUrl: string
  taskId: string
  markdown: string
  parsed?: Record<string, unknown>
}): BaiduCloudParserClient {
  return new BaiduCloudParserClient(
    axios.create({
      adapter: async (config) => {
        if (config.url === BAIDU_TOKEN_URL) {
          return response(config, { access_token: 'token', expires_in: 3600 })
        }
        if (config.url === input.submitUrl)
          return response(config, { log_id: 'submit-log', result: { task_id: input.taskId } })
        if (config.url === input.queryUrl) {
          return response(config, {
            log_id: 'query-log',
            result: {
              status: 'success',
              markdown_url: 'https://result.example/result.md',
              parse_result_url: input.parsed ? 'https://result.example/result.json' : undefined
            }
          })
        }
        if (config.url === 'https://result.example/result.md') return response(config, input.markdown)
        if (config.url === 'https://result.example/result.json') return response(config, JSON.stringify(input.parsed))
        throw new Error(`Unexpected request ${config.url}`)
      }
    })
  )
}

function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}
