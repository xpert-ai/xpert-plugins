import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  BAIDU_PADDLE_QUERY_URL,
  BAIDU_PADDLE_SUBMIT_URL,
  BAIDU_TOKEN_URL,
  BAIDU_UNLIMITED_QUERY_URL,
  BAIDU_UNLIMITED_SUBMIT_URL
} from './constants.js'
import { BaiduCloudParserClient, baiduCloudClientTestHelpers } from './baidu-cloud.client.js'
import type { BaiduCloudDocumentInput, BaiduOcrIntegrationOptions } from './types.js'

type CapturedRequest = { url?: string; data?: string; params?: unknown }

const options: BaiduOcrIntegrationOptions = {
  apiKey: 'test-api-key',
  secretKey: 'test-secret-key',
  uploadMode: 'base64',
  pollIntervalSeconds: 1,
  taskTimeoutSeconds: 30
}

const input: BaiduCloudDocumentInput = {
  fileName: 'sample.pdf',
  extension: 'pdf',
  buffer: Buffer.from('pdf-bytes'),
  pageCount: 2
}

describe('BaiduCloudParserClient', () => {
  beforeEach(() => {
    baiduCloudClientTestHelpers.tokenCache.clear()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses the official PaddleOCR-VL endpoints and exact parser parameters', async () => {
    const requests: CapturedRequest[] = []
    let tokenRequests = 0
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({ url: config.url, data: config.data, params: config.params })
      if (config.url === BAIDU_TOKEN_URL) {
        tokenRequests += 1
        return response(config, { access_token: 'cached-token', expires_in: 3600 })
      }
      if (config.url === BAIDU_PADDLE_SUBMIT_URL) {
        return response(config, { log_id: 11, result: { task_id: 'paddle-task' } })
      }
      if (config.url === BAIDU_PADDLE_QUERY_URL) {
        return response(config, {
          log_id: 12,
          result: {
            task_id: 'paddle-task',
            status: 'success',
            markdown_url: 'https://result.example/paddle.md',
            parse_result_url: 'https://result.example/paddle.json'
          }
        })
      }
      if (config.url === 'https://result.example/paddle.md') return response(config, '# Parsed')
      if (config.url === 'https://result.example/paddle.json') {
        return response(config, JSON.stringify({ file_name: 'sample.pdf', pages: [{ page_num: 0, layouts: [] }] }))
      }
      throw new Error(`Unexpected request ${config.url}`)
    }
    const client = new BaiduCloudParserClient(axios.create({ adapter }))

    const firstPromise = client.parse('paddleocr-vl', input, options, {
      analysisChart: true,
      mergeTables: true,
      relevelTitles: true,
      recognizeSeal: false,
      returnSpanBoxes: true
    })
    await jest.advanceTimersByTimeAsync(1_000)
    const first = await firstPromise
    const secondPromise = client.parse('paddleocr-vl', input, options, {
      analysisChart: false,
      mergeTables: false,
      relevelTitles: false,
      recognizeSeal: true,
      returnSpanBoxes: false
    })
    await jest.advanceTimersByTimeAsync(1_000)
    await secondPromise

    expect(tokenRequests).toBe(1)
    expect(first.trace).toEqual({ engine: 'paddleocr-vl', taskId: 'paddle-task', logId: '12' })
    expect(first.parsed?.pages).toHaveLength(1)
    const submit = requests.find((request) => request.url === BAIDU_PADDLE_SUBMIT_URL)
    const form = new URLSearchParams(submit?.data)
    expect(form.get('file_name')).toBe('sample.pdf')
    expect(form.get('file_data')).toBe(input.buffer?.toString('base64'))
    expect(form.get('analysis_chart')).toBe('true')
    expect(form.get('merge_tables')).toBe('true')
    expect(form.get('relevel_titles')).toBe('true')
    expect(form.get('recognize_seal')).toBe('false')
    expect(form.get('return_span_boxes')).toBe('true')
    expect(submit?.params).toEqual({ access_token: 'cached-token' })
  })

  it('uses the separate Unlimited-OCR endpoints without Paddle-only parameters', async () => {
    const requests: CapturedRequest[] = []
    const client = new BaiduCloudParserClient(
      axios.create({
        adapter: async (config) => {
          requests.push({ url: config.url, data: config.data, params: config.params })
          if (config.url === BAIDU_TOKEN_URL) return response(config, { access_token: 'token', expires_in: 3600 })
          if (config.url === BAIDU_UNLIMITED_SUBMIT_URL) {
            return response(config, { result: { task_id: 'unlimited-task' } })
          }
          if (config.url === BAIDU_UNLIMITED_QUERY_URL) {
            return response(config, {
              result: { status: 'success', markdown_url: 'https://result.example/unlimited.md' }
            })
          }
          if (config.url === 'https://result.example/unlimited.md') return response(config, 'Unlimited result')
          throw new Error(`Unexpected request ${config.url}`)
        }
      })
    )

    const promise = client.parse('unlimited-ocr', input, options, {})
    await jest.advanceTimersByTimeAsync(1_000)
    await expect(promise).resolves.toMatchObject({ markdown: 'Unlimited result', parsed: undefined })
    const submit = requests.find((request) => request.url === BAIDU_UNLIMITED_SUBMIT_URL)
    const form = new URLSearchParams(submit?.data)
    expect(form.has('analysis_chart')).toBe(false)
    expect(form.has('merge_tables')).toBe(false)
  })

  it('refreshes an invalid token once and reports provider quota errors with trace IDs', async () => {
    let tokenRequests = 0
    let queryRequests = 0
    const refreshClient = new BaiduCloudParserClient(
      axios.create({
        adapter: async (config) => {
          if (config.url === BAIDU_TOKEN_URL) {
            tokenRequests += 1
            return response(config, { access_token: `token-${tokenRequests}`, expires_in: 3600 })
          }
          if (config.url === BAIDU_UNLIMITED_SUBMIT_URL) return response(config, { result: { task_id: 'task' } })
          if (config.url === BAIDU_UNLIMITED_QUERY_URL) {
            queryRequests += 1
            return queryRequests === 1
              ? response(config, { error_code: 110, error_msg: 'Access token invalid' })
              : response(config, {
                  result: { status: 'success', markdown_url: 'https://result.example/refreshed.md' }
                })
          }
          if (config.url === 'https://result.example/refreshed.md') return response(config, 'refreshed')
          throw new Error(`Unexpected request ${config.url}`)
        }
      })
    )
    const promise = refreshClient.parse('unlimited-ocr', input, options, {})
    await jest.advanceTimersByTimeAsync(1_000)
    await expect(promise).resolves.toMatchObject({ markdown: 'refreshed' })
    expect(tokenRequests).toBe(2)

    baiduCloudClientTestHelpers.tokenCache.clear()
    const quotaClient = new BaiduCloudParserClient(
      axios.create({
        adapter: async (config) => {
          if (config.url === BAIDU_TOKEN_URL) return response(config, { access_token: 'quota-token', expires_in: 3600 })
          if (config.url === BAIDU_PADDLE_SUBMIT_URL) {
            return response(config, { error_code: 282005, error_msg: 'quota exceed error', log_id: 'log-282005' })
          }
          throw new Error(`Unexpected request ${config.url}`)
        }
      })
    )
    await expect(
      quotaClient.parse('paddleocr-vl', input, options, {
        analysisChart: false,
        mergeTables: true,
        relevelTitles: true,
        recognizeSeal: false,
        returnSpanBoxes: true
      })
    ).rejects.toMatchObject({ code: 282005, logId: 'log-282005', engine: 'paddleocr-vl' })
  })

  it('validates official formats, dimensions, sizes, page count and URL mode', () => {
    expect(() => baiduCloudClientTestHelpers.validateInput('paddleocr-vl', { ...input, extension: 'webp' })).toThrow(
      'does not support .webp'
    )
    expect(() => baiduCloudClientTestHelpers.validateInput('paddleocr-vl', { ...input, pageCount: 501 })).toThrow(
      'at most 500 PDF pages per task'
    )
    expect(() =>
      baiduCloudClientTestHelpers.validateInput('paddleocr-vl', { ...input, buffer: Buffer.alloc(0) })
    ).toThrow('empty document')
    expect(() =>
      baiduCloudClientTestHelpers.resolveUploadMode(
        { ...input, buffer: undefined, fileUrl: 'https://example.com/sample.pdf' },
        { ...options, uploadMode: 'url' }
      )
    ).not.toThrow()
    expect(() =>
      baiduCloudClientTestHelpers.resolveUploadMode(
        { ...input, buffer: undefined, fileUrl: undefined },
        { ...options, uploadMode: 'url' }
      )
    ).toThrow('requires a public URL')
  })
})

function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}
