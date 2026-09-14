import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Inject, Injectable, Optional } from '@nestjs/common'
import axios, { type AxiosInstance } from 'axios'
import { z } from 'zod'
import { BAIDU_IMAGE_EXTENSIONS } from './constants.js'
import { paddleOcrBaseUrl } from './parse-options.js'
import type {
  BaiduCloudDocumentInput,
  BaiduOcrIntegrationOptions,
  BaiduPaddleOptions,
  BaiduTaskOutput
} from './types.js'

// Full PaddleOCR-VL pipeline API: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PaddleOCR-VL.en.md
const responseSchema = z
  .object({
    logId: z.string().optional(),
    errorCode: z.number(),
    errorMsg: z.string().optional(),
    result: z
      .object({
        layoutParsingResults: z.array(
          z
            .object({
              prunedResult: z
                .object({ width: z.number().optional(), height: z.number().optional() })
                .passthrough()
                .optional(),
              markdown: z.object({ text: z.string(), images: z.record(z.string()).nullish() }).passthrough()
            })
            .passthrough()
        )
      })
      .passthrough()
      .optional()
  })
  .passthrough()

export const PADDLEOCR_SELF_HOSTED_HTTP_CLIENT = Symbol('PADDLEOCR_SELF_HOSTED_HTTP_CLIENT')
const MAX_INPUT_BYTES = 100 * 1024 * 1024
const MAX_RESPONSE_BYTES = 150 * 1024 * 1024

@Injectable()
export class PaddleOcrSelfHostedClient {
  private readonly http: AxiosInstance

  constructor(@Optional() @Inject(PADDLEOCR_SELF_HOSTED_HTTP_CLIENT) http?: AxiosInstance) {
    this.http = http ?? axios.create()
  }

  async validate(options: BaiduOcrIntegrationOptions): Promise<void> {
    const response = await this.http.get(`${paddleOcrBaseUrl(options)}/layout-parsing`, {
      timeout: 5_000,
      maxRedirects: 0,
      validateStatus: () => true
    })
    // This is a POST-only route. A 404 or a generic HTML home page does not confirm a pipeline endpoint.
    if (response.status !== 405)
      throw new Error(
        `PaddleOCR-VL endpoint check failed (HTTP ${response.status}); expected the full /layout-parsing pipeline service`
      )
  }

  async parse(
    input: BaiduCloudDocumentInput,
    integration: BaiduOcrIntegrationOptions,
    options: Required<BaiduPaddleOptions>
  ): Promise<BaiduTaskOutput> {
    const baseUrl = paddleOcrBaseUrl(integration)
    if (input.extension !== 'pdf' && !BAIDU_IMAGE_EXTENSIONS.has(input.extension)) {
      throw new Error(`Self-hosted PaddleOCR-VL does not support .${input.extension}; use PDF or an image`)
    }
    if (!input.buffer?.length) throw new Error('Self-hosted PaddleOCR-VL requires readable file bytes')
    if (input.buffer.length > MAX_INPUT_BYTES)
      throw new Error('Self-hosted PaddleOCR-VL input exceeds the 100 MiB upload limit')
    const seconds = integration.taskTimeoutSeconds ?? 1800
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('PaddleOCR-VL task timeout must be positive')
    const response = await this.http.post(
      `${baseUrl}/layout-parsing`,
      {
        file: input.buffer.toString('base64'),
        fileType: input.extension === 'pdf' ? 0 : 1,
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useLayoutDetection: true,
        useChartRecognition: options.analysisChart,
        useSealRecognition: options.recognizeSeal,
        restructurePages: options.mergeTables || options.relevelTitles,
        mergeTables: options.mergeTables,
        relevelTitles: options.relevelTitles,
        returnMarkdownImages: options.preserveImages,
        visualize: false
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: seconds * 1000,
        maxBodyLength: MAX_RESPONSE_BYTES,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxRedirects: 0
      }
    )
    const parsedResponse = responseSchema.safeParse(response.data)
    if (!parsedResponse.success) throw new Error('PaddleOCR-VL returned an invalid layout-parsing response')
    const body = parsedResponse.data
    if (body.errorCode !== 0)
      throw new Error(`PaddleOCR-VL failed (${body.errorCode}): ${body.errorMsg || 'service error'}`)
    const pages = body.result?.layoutParsingResults
    if (!pages?.length || !pages.some((page) => page.markdown.text.trim()))
      throw new Error('PaddleOCR-VL returned no Markdown content')
    return {
      markdown: pages.map((page) => page.markdown.text).join('\n\n'),
      rawJson: JSON.stringify(body),
      rawResponse: body,
      trace: {
        provider: 'paddleocr-self-hosted',
        engine: 'paddleocr-vl',
        taskId: body.logId || randomUUID(),
        logId: body.logId
      },
      parsed: {
        file_name: input.fileName,
        pages: pages.map((page, index) => ({
          page_num: index,
          // Keep the service's final Markdown (including reconstructed headings/tables) authoritative.
          text: options.preserveImages
            ? page.markdown.text
            : page.markdown.text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'),
          meta: { page_width: page.prunedResult?.width, page_height: page.prunedResult?.height },
          prunedResult: page.prunedResult,
          images: options.preserveImages
            ? Object.entries(page.markdown.images ?? {}).map(([ref, data], imageIndex) => ({
                layout_id: `page-${index + 1}-image-${imageIndex + 1}`,
                original_ref: ref,
                data_url: imageSource(ref, data)
              }))
            : []
        }))
      }
    }
  }
}

function imageSource(ref: string, value: string): string {
  if (/^https?:\/\//i.test(value) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return value
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.replace(/\s/g, '')))
    throw new Error('PaddleOCR-VL returned invalid image data')
  const extension = path.extname(ref).slice(1).toLowerCase()
  const mime =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'tif' || extension === 'tiff'
      ? 'image/tiff'
      : `image/${['png', 'bmp', 'webp', 'gif'].includes(extension) ? extension : 'png'}`
  return `data:${mime};base64,${value.replace(/\s/g, '')}`
}
