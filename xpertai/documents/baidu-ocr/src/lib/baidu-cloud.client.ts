import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import axios, { type AxiosInstance } from 'axios'
import { imageSize } from 'image-size'
import {
  BAIDU_DOCUMENT_EXTENSIONS,
  BAIDU_IMAGE_EXTENSIONS,
  BAIDU_MAX_BASE64_BYTES,
  BAIDU_MAX_IMAGE_BYTES,
  BAIDU_MAX_IMAGE_SIDE_PIXELS,
  BAIDU_MAX_LAYOUT_BYTES,
  BAIDU_MAX_PDF_PAGES,
  BAIDU_MAX_STREAM_BYTES,
  BAIDU_PADDLE_QUERY_URL,
  BAIDU_PADDLE_SUBMIT_URL,
  BAIDU_TOKEN_URL,
  BAIDU_UNLIMITED_QUERY_URL,
  BAIDU_UNLIMITED_SUBMIT_URL
} from './constants.js'
import { BaiduOcrError, normalizeBaiduError } from './errors.js'
import { isRetryableHttpError, retry, sleep } from './http.js'
import type {
  BaiduCloudDocumentInput,
  BaiduOcrIntegrationOptions,
  BaiduParserEngine,
  BaiduParserRequestOptions,
  BaiduParseResult,
  BaiduPaddleRequestOptions,
  BaiduTaskOutput
} from './types.js'

type BaiduTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type BaiduApiEnvelope<TResult> = {
  error_code?: number | string
  error_msg?: string
  log_id?: number | string
  result?: TResult
}

type BaiduSubmitResult = { task_id?: string }
type BaiduQueryResult = {
  task_id?: string
  status?: 'pending' | 'processing' | 'running' | 'success' | 'failed'
  task_error?: string | null
  markdown_url?: string
  parse_result_url?: string
}

type TokenCacheEntry = { token: string; expiresAt: number }

const tokenCache = new Map<string, TokenCacheEntry>()
const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000

export const BAIDU_OCR_HTTP_CLIENT = Symbol('BAIDU_OCR_HTTP_CLIENT')

@Injectable()
export class BaiduCloudParserClient {
  private readonly http: AxiosInstance

  constructor(@Optional() @Inject(BAIDU_OCR_HTTP_CLIENT) http?: AxiosInstance) {
    this.http = http ?? axios.create()
  }

  async validate(options: BaiduOcrIntegrationOptions): Promise<void> {
    validateOptions(options)
    await this.getAccessToken(options, true)
  }

  async parse(
    engine: BaiduParserEngine,
    input: BaiduCloudDocumentInput,
    options: BaiduOcrIntegrationOptions,
    requestOptions: BaiduParserRequestOptions
  ): Promise<BaiduTaskOutput> {
    validateOptions(options)
    validateInput(engine, input)

    const submit = await this.withAccessToken(options, (accessToken) =>
      this.submitTask(engine, input, options, requestOptions, accessToken)
    )
    const taskId = submit.result?.task_id?.trim()
    if (!taskId) {
      throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} did not return a task ID`, {
        engine,
        logId: stringifyIdentifier(submit.log_id)
      })
    }

    const deadline = Date.now() + positiveInteger(options.taskTimeoutSeconds, 1800) * 1000
    const pollIntervalMs = positiveInteger(options.pollIntervalSeconds, 7) * 1000
    let query: BaiduApiEnvelope<BaiduQueryResult>
    while (true) {
      if (Date.now() >= deadline) {
        throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} task timed out`, { engine, taskId })
      }
      await sleep(pollIntervalMs)
      query = await this.withAccessToken(options, (accessToken) => this.queryTask(engine, taskId, accessToken))
      const status = query.result?.status
      if (status === 'success') break
      if (status === 'failed') {
        throw new BaiduOcrError(
          query.result?.task_error?.trim() || `Baidu Cloud ${engineLabel(engine)} task failed`,
          { engine, taskId, logId: stringifyIdentifier(query.log_id) }
        )
      }
      if (status !== 'pending' && status !== 'processing' && status !== 'running') {
        throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} returned an unknown task status`, {
          engine,
          taskId,
          logId: stringifyIdentifier(query.log_id)
        })
      }
    }

    const trace = {
      engine,
      taskId,
      logId: stringifyIdentifier(query.log_id ?? submit.log_id)
    }
    const markdownUrl = query.result?.markdown_url?.trim()
    if (!markdownUrl) {
      throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} did not return markdown_url`, trace)
    }
    const markdown = await this.downloadText(markdownUrl, options, trace)
    if (!markdown.trim()) {
      throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} returned empty Markdown`, trace)
    }

    const parseResultUrl = query.result?.parse_result_url?.trim()
    if (engine === 'paddleocr-vl' && !parseResultUrl) {
      throw new BaiduOcrError('Baidu Cloud PaddleOCR-VL did not return parse_result_url', trace)
    }
    const rawJson = parseResultUrl ? await this.downloadText(parseResultUrl, options, trace) : undefined
    const parsed = engine === 'paddleocr-vl' && rawJson ? parseStructuredResult(engine, rawJson, trace) : undefined

    return {
      markdown,
      rawJson,
      parsed,
      trace,
      rawResponse: {
        submit: sanitizeEnvelope(submit),
        query: sanitizeEnvelope(query)
      }
    }
  }

  private async getAccessToken(options: BaiduOcrIntegrationOptions, forceRefresh = false): Promise<string> {
    const key = createHash('sha256').update(`${options.apiKey}\0${options.secretKey}`).digest('hex')
    const cached = tokenCache.get(key)
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.token
    }

    try {
      const response = await retry(
        () =>
          this.http.post<BaiduTokenResponse>(BAIDU_TOKEN_URL, undefined, {
            params: {
              grant_type: 'client_credentials',
              client_id: options.apiKey,
              client_secret: options.secretKey
            },
            headers: { Accept: 'application/json' },
            timeout: 30_000
          }),
        isRetryableHttpError,
        3
      )
      const token = response.data.access_token
      if (!token) {
        throw new BaiduOcrError(
          response.data.error_description?.trim() || response.data.error?.trim() || 'Baidu OAuth rejected the credentials',
          { code: response.data.error }
        )
      }
      const expiresInSeconds = positiveInteger(response.data.expires_in, 30 * 24 * 60 * 60)
      tokenCache.set(key, {
        token,
        expiresAt: Date.now() + Math.max(expiresInSeconds * 1000 - TOKEN_EXPIRY_SKEW_MS, 60_000)
      })
      return token
    } catch (error) {
      throw normalizeBaiduError(undefined, error, 'Unable to obtain a Baidu Cloud access token')
    }
  }

  private async withAccessToken<T>(
    options: BaiduOcrIntegrationOptions,
    operation: (accessToken: string) => Promise<T>
  ): Promise<T> {
    const token = await this.getAccessToken(options)
    try {
      return await operation(token)
    } catch (error) {
      if (error instanceof BaiduOcrError && (String(error.code) === '110' || String(error.code) === '111')) {
        const refreshed = await this.getAccessToken(options, true)
        return operation(refreshed)
      }
      throw error
    }
  }

  private async submitTask(
    engine: BaiduParserEngine,
    input: BaiduCloudDocumentInput,
    options: BaiduOcrIntegrationOptions,
    requestOptions: BaiduParserRequestOptions,
    accessToken: string
  ): Promise<BaiduApiEnvelope<BaiduSubmitResult>> {
    const form = new URLSearchParams({ file_name: input.fileName })
    const uploadMode = resolveUploadMode(input, options)
    if (uploadMode === 'url') {
      form.set('file_url', requireFileUrl(input, engine))
    } else {
      if (!input.buffer?.length) {
        throw new BaiduOcrError('Baidu Cloud base64 upload requires readable file bytes', { engine })
      }
      form.set('file_data', input.buffer.toString('base64'))
    }
    if (engine === 'paddleocr-vl') {
      const paddle = requestOptions as BaiduPaddleRequestOptions
      form.set('analysis_chart', String(paddle.analysisChart))
      form.set('merge_tables', String(paddle.mergeTables))
      form.set('relevel_titles', String(paddle.relevelTitles))
      form.set('recognize_seal', String(paddle.recognizeSeal))
      form.set('return_span_boxes', String(paddle.returnSpanBoxes))
    }

    try {
      const response = await retry(
        async () => {
          const current = await this.http.post<BaiduApiEnvelope<BaiduSubmitResult>>(
            endpoints(engine).submit,
            form.toString(),
            {
              params: { access_token: accessToken },
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 120_000
            }
          )
          assertBaiduSuccess(engine, current.data)
          return current
        },
        isRetryableBaiduError,
        3
      )
      return response.data
    } catch (error) {
      throw normalizeBaiduError(engine, error, `Baidu Cloud ${engineLabel(engine)} task submission failed`)
    }
  }

  private async queryTask(
    engine: BaiduParserEngine,
    taskId: string,
    accessToken: string
  ): Promise<BaiduApiEnvelope<BaiduQueryResult>> {
    const form = new URLSearchParams({ task_id: taskId })
    try {
      const response = await retry(
        async () => {
          const current = await this.http.post<BaiduApiEnvelope<BaiduQueryResult>>(
            endpoints(engine).query,
            form.toString(),
            {
              params: { access_token: accessToken },
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 60_000
            }
          )
          assertBaiduSuccess(engine, current.data, taskId)
          return current
        },
        isRetryableBaiduError,
        3
      )
      return response.data
    } catch (error) {
      throw withTrace(normalizeBaiduError(engine, error, `Baidu Cloud ${engineLabel(engine)} task query failed`), {
        engine,
        taskId
      })
    }
  }

  private async downloadText(
    url: string,
    options: BaiduOcrIntegrationOptions,
    trace: { engine: BaiduParserEngine; taskId: string; logId?: string }
  ): Promise<string> {
    assertHttpUrl(url, trace.engine)
    try {
      const response = await retry(
        () =>
          this.http.get<unknown>(url, {
            responseType: 'text',
            timeout: positiveInteger(options.taskTimeoutSeconds, 1800) * 1000
          }),
        isRetryableHttpError,
        3
      )
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    } catch (error) {
      throw withTrace(
        normalizeBaiduError(trace.engine, error, `Failed to download a Baidu Cloud ${engineLabel(trace.engine)} result`),
        trace
      )
    }
  }
}

function endpoints(engine: BaiduParserEngine): { submit: string; query: string } {
  return engine === 'paddleocr-vl'
    ? { submit: BAIDU_PADDLE_SUBMIT_URL, query: BAIDU_PADDLE_QUERY_URL }
    : { submit: BAIDU_UNLIMITED_SUBMIT_URL, query: BAIDU_UNLIMITED_QUERY_URL }
}

function engineLabel(engine: BaiduParserEngine): string {
  return engine === 'paddleocr-vl' ? 'PaddleOCR-VL' : 'Unlimited-OCR'
}

function validateOptions(options: BaiduOcrIntegrationOptions): void {
  if (!options.apiKey?.trim() || !options.secretKey?.trim()) {
    throw new BaiduOcrError('Baidu OCR requires API Key and Secret Key')
  }
}

function validateInput(engine: BaiduParserEngine, input: BaiduCloudDocumentInput): void {
  if (!BAIDU_DOCUMENT_EXTENSIONS.has(input.extension)) {
    throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} does not support .${input.extension}`, { engine })
  }
  if (input.extension === 'pdf' && input.pageCount && input.pageCount > BAIDU_MAX_PDF_PAGES) {
    throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} supports at most ${BAIDU_MAX_PDF_PAGES} PDF pages per task`, {
      engine
    })
  }
  if (!input.buffer) return
  if (!input.buffer.length) {
    throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} cannot parse an empty document`, { engine })
  }
  const maximum = BAIDU_IMAGE_EXTENSIONS.has(input.extension)
    ? BAIDU_MAX_IMAGE_BYTES
    : input.extension === 'pdf' || input.extension === 'ofd'
      ? BAIDU_MAX_LAYOUT_BYTES
      : BAIDU_MAX_STREAM_BYTES
  if (input.buffer.length > maximum) {
    throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} file exceeds the official size limit`, { engine })
  }
  if (BAIDU_IMAGE_EXTENSIONS.has(input.extension)) {
    validateImageDimensions(engine, input.buffer)
  }
}

function validateImageDimensions(engine: BaiduParserEngine, buffer: Buffer): void {
  let dimensions: { width?: number; height?: number }
  try {
    dimensions = imageSize(buffer)
  } catch {
    throw new BaiduOcrError(`Baidu Cloud ${engineLabel(engine)} cannot read the image dimensions`, { engine })
  }
  if (!dimensions.width || !dimensions.height || Math.max(dimensions.width, dimensions.height) > BAIDU_MAX_IMAGE_SIDE_PIXELS) {
    throw new BaiduOcrError(
      `Baidu Cloud ${engineLabel(engine)} images must not exceed ${BAIDU_MAX_IMAGE_SIDE_PIXELS}px on the longest side`,
      { engine }
    )
  }
}

function resolveUploadMode(input: BaiduCloudDocumentInput, options: BaiduOcrIntegrationOptions): 'base64' | 'url' {
  const configured = options.uploadMode ?? 'auto'
  if (configured === 'url') {
    requireFileUrl(input)
    return 'url'
  }
  if (configured === 'base64') {
    if (!input.buffer?.length || input.buffer.length > BAIDU_MAX_BASE64_BYTES) {
      throw new BaiduOcrError('Configured base64 upload cannot be used for this document')
    }
    return 'base64'
  }
  if (input.buffer?.length && input.buffer.length <= BAIDU_MAX_BASE64_BYTES) return 'base64'
  requireFileUrl(input)
  return 'url'
}

function requireFileUrl(input: BaiduCloudDocumentInput, engine?: BaiduParserEngine): string {
  const value = input.fileUrl?.trim()
  if (!value || Buffer.byteLength(value, 'utf8') > 1024) {
    throw new BaiduOcrError('Baidu Cloud URL upload requires a public URL no longer than 1024 bytes', { engine })
  }
  assertHttpUrl(value, engine)
  return value
}

function assertHttpUrl(value: string, engine?: BaiduParserEngine): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new BaiduOcrError('Baidu OCR result and input URL is invalid', { engine })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BaiduOcrError('Baidu OCR result and input URLs must use HTTP or HTTPS', { engine })
  }
}

function parseStructuredResult(
  engine: BaiduParserEngine,
  rawJson: string,
  trace: { taskId: string; logId?: string }
): BaiduParseResult {
  try {
    const parsed: unknown = JSON.parse(rawJson)
    if (!isRecord(parsed)) throw new Error('result is not an object')
    if (engine === 'paddleocr-vl' && !Array.isArray(parsed.pages)) {
      throw new Error('result does not contain pages')
    }
    return parsed as BaiduParseResult
  } catch (error) {
    throw new BaiduOcrError(
      `Baidu Cloud ${engineLabel(engine)} returned invalid structured JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`,
      { engine, ...trace }
    )
  }
}

function assertBaiduSuccess<TResult>(
  engine: BaiduParserEngine,
  envelope: BaiduApiEnvelope<TResult>,
  taskId?: string
): void {
  const code = envelope.error_code
  if (code === undefined || Number(code) === 0) return
  const numericCode = Number(code)
  throw new BaiduOcrError(envelope.error_msg?.trim() || `Baidu Cloud error ${code}`, {
    engine,
    code,
    taskId,
    logId: stringifyIdentifier(envelope.log_id),
    retryable: numericCode === 2 || numericCode === 4 || numericCode === 18
  })
}

function isRetryableBaiduError(error: unknown): boolean {
  return error instanceof BaiduOcrError ? error.retryable : isRetryableHttpError(error)
}

function withTrace(error: BaiduOcrError, trace: BaiduOcrError): BaiduOcrError
function withTrace(error: BaiduOcrError, trace: { engine?: BaiduParserEngine; taskId?: string; logId?: string }): BaiduOcrError
function withTrace(
  error: BaiduOcrError,
  trace: { engine?: BaiduParserEngine; taskId?: string; logId?: string }
): BaiduOcrError {
  return new BaiduOcrError(error.message, {
    engine: error.engine ?? trace.engine,
    status: error.status,
    code: error.code,
    taskId: error.taskId ?? trace.taskId,
    logId: error.logId ?? trace.logId,
    batchIndex: error.batchIndex,
    batchCount: error.batchCount,
    sourcePageStart: error.sourcePageStart,
    sourcePageEnd: error.sourcePageEnd,
    retryable: error.retryable
  })
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback
}

function stringifyIdentifier(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : String(value)
}

function sanitizeEnvelope<TResult>(envelope: BaiduApiEnvelope<TResult>): Record<string, unknown> {
  return {
    error_code: envelope.error_code,
    error_msg: envelope.error_msg,
    log_id: envelope.log_id,
    result: envelope.result
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const baiduCloudClientTestHelpers = {
  tokenCache,
  validateInput,
  resolveUploadMode,
  parseStructuredResult
}
