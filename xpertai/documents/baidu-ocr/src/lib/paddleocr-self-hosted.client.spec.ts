import axios, { type InternalAxiosRequestConfig } from 'axios'
import { PaddleOcrSelfHostedClient } from './paddleocr-self-hosted.client.js'
import { resolveBaiduParseOptions } from './parse-options.js'
import type { BaiduOcrIntegrationOptions } from './types.js'

const integration: BaiduOcrIntegrationOptions = {
  serverType: 'self-hosted',
  apiUrl: 'http://paddleocr:8080/layout-parsing/',
  taskTimeoutSeconds: 30
}
const output = {
  logId: 'request-1',
  errorCode: 0,
  errorMsg: 'Success',
  result: {
    layoutParsingResults: [
      { prunedResult: { width: 600, height: 800 }, markdown: { text: '# First page', images: {} } },
      { markdown: { text: '| Column |\n|---|\n| Second page |', images: {} } }
    ]
  }
}

function testClient(data: unknown = output, status = 200) {
  const requests: InternalAxiosRequestConfig[] = []
  const client = new PaddleOcrSelfHostedClient(
    axios.create({
      adapter: async (config) => {
        requests.push(config)
        return { data, status, statusText: '', headers: {}, config }
      }
    })
  )
  return { client, requests }
}

describe('PaddleOcrSelfHostedClient', () => {
  it.each([
    ['pdf', 0],
    ['png', 1]
  ] as const)(
    'submits %s bytes to the configured pipeline and preserves page Markdown',
    async (extension, fileType) => {
      const { client, requests } = testClient()
      const result = await client.parse(
        { fileName: `input.${extension}`, extension, buffer: Buffer.from('source') },
        { ...integration, apiKey: 'old-key', secretKey: 'old-secret' },
        resolveBaiduParseOptions(
          {},
          { analysisChart: true, recognizeSeal: true, mergeTables: false, relevelTitles: false }
        )
      )

      expect(requests).toHaveLength(1)
      expect(requests[0].url).toBe('http://paddleocr:8080/layout-parsing')
      expect(requests[0].timeout).toBe(30_000)
      expect(JSON.parse(requests[0].data)).toEqual({
        file: Buffer.from('source').toString('base64'),
        fileType,
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useLayoutDetection: true,
        useChartRecognition: true,
        useSealRecognition: true,
        restructurePages: false,
        mergeTables: false,
        relevelTitles: false,
        returnMarkdownImages: true,
        visualize: false
      })
      expect(JSON.stringify(requests[0])).not.toContain('old-secret')
      expect(result.trace).toMatchObject({ provider: 'paddleocr-self-hosted', taskId: 'request-1' })
      expect(result.parsed?.pages).toEqual([
        expect.objectContaining({ page_num: 0, text: '# First page', meta: { page_width: 600, page_height: 800 } }),
        expect.objectContaining({ page_num: 1, text: '| Column |\n|---|\n| Second page |' })
      ])
      expect(JSON.parse(result.rawJson!)).toEqual(output)
    }
  )

  it('enables page restructuring when merging tables or inferring titles', async () => {
    const { client, requests } = testClient()
    await client.parse(
      { fileName: 'input.pdf', extension: 'pdf', buffer: Buffer.from('source') },
      integration,
      resolveBaiduParseOptions({}, { mergeTables: true, relevelTitles: false })
    )
    expect(JSON.parse(requests[0].data)).toMatchObject({
      restructurePages: true,
      mergeTables: true,
      relevelTitles: false
    })
  })

  it.each([
    [{ errorCode: 1001, errorMsg: 'unsupported model' }, 'unsupported model'],
    [{ errorCode: 0, result: { layoutParsingResults: [] } }, 'no Markdown'],
    ['<html>gateway</html>', 'invalid layout-parsing']
  ])('rejects unsuccessful or unusable service output', async (data, message) => {
    const { client } = testClient(data)
    await expect(
      client.parse(
        { fileName: 'input.png', extension: 'png', buffer: Buffer.from('source') },
        integration,
        resolveBaiduParseOptions({}, {})
      )
    ).rejects.toThrow(message)
  })

  it.each([404, 200])('does not accept HTTP %s as a pipeline connection test', async (status) => {
    const { client } = testClient('<html>Not a pipeline</html>', status)
    await expect(client.validate(integration)).rejects.toThrow(`HTTP ${status}`)
  })

  it('recognizes the POST-only pipeline route without submitting a document', async () => {
    const { client, requests } = testClient({}, 405)
    await client.validate(integration)
    expect(requests[0].method).toBe('get')
    expect(requests[0].url).toBe('http://paddleocr:8080/layout-parsing')
  })

  it('rejects unsupported files before sending a request', async () => {
    const { client, requests } = testClient()
    await expect(
      client.parse(
        { fileName: 'input.docx', extension: 'docx', buffer: Buffer.from('source') },
        integration,
        resolveBaiduParseOptions({}, {})
      )
    ).rejects.toThrow('use PDF or an image')
    expect(requests).toHaveLength(0)
  })
})
