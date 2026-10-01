import { ConfigService } from '@nestjs/config'
import { XpFileSystem } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { MinerUClient } from './mineru.client.js'
import { MinerUResultParserService } from './result-parser.service.js'

async function serve(handler: (request: IncomingMessage, response: ServerResponse, body: Buffer) => void) {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => handler(request, response, Buffer.concat(chunks)))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a local TCP test server')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function client(url: string) {
  return new MinerUClient(new ConfigService(), {
    integration: {
      provider: 'mineru',
      options: { serverType: 'official', apiUrl: `${url}/api/v4`, apiKey: 'test-token', requestTimeoutSeconds: 2 }
    }
  })
}

function uploadUrls(response: ServerResponse, url: string) {
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({
    code: 0, msg: 'ok', trace_id: 'test-trace',
    data: { batch_id: 'test-batch', file_urls: [`${url}/upload?Signature=test-signed-secret`] }
  }))
}

const denied = `<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature does not match.</Message><RequestId>test-request-id</RequestId><SignatureProvided>secret-signature</SignatureProvided><StringToSign>secret-canonical-request</StringToSign></Error>`

describe('MinerU file transfers over HTTP', () => {
  afterEach(() => jest.restoreAllMocks())

  it('sends raw bytes without Content-Type or API authorization to the signed upload URL', async () => {
    const received: { headers: IncomingMessage['headers']; body: Buffer }[] = []
    const server = await serve((request, response, body) => {
      if (request.method === 'POST') return uploadUrls(response, server.url)
      received.push({ headers: request.headers, body })
      response.statusCode = request.headers['content-type'] ? 403 : 200
      response.end(response.statusCode === 403 ? denied : 'ok')
    })
    const bytes = Buffer.from('%PDF-1.4 test file')
    const previousAuthorization = axios.defaults.headers.common.Authorization
    axios.defaults.headers.common.Authorization = 'Bearer inherited-test-token'
    try {
      await expect(client(server.url).createUploadBatch({ files: [{ name: 'test.pdf', buffer: bytes }] }))
        .resolves.toEqual({ batchId: 'test-batch' })
      expect(received).toHaveLength(1)
      expect(received[0].headers['content-type']).toBeUndefined()
      expect(received[0].headers.authorization).toBeUndefined()
      expect(received[0].body).toEqual(bytes)
    } finally {
      if (previousAuthorization === undefined) delete axios.defaults.headers.common.Authorization
      else axios.defaults.headers.common.Authorization = previousAuthorization
      await server.close()
    }
  })

  it('reports upload stage and OSS error details without signed URLs or the full response', async () => {
    let uploads = 0
    const server = await serve((request, response) => {
      if (request.method === 'POST') return uploadUrls(response, server.url)
      uploads++
      response.statusCode = 403
      response.setHeader('Content-Type', 'application/xml')
      response.end(denied)
    })
    try {
      const failure = await client(server.url).createUploadBatch({ files: [{ name: 'test.pdf', buffer: Buffer.from('pdf') }] })
        .catch((error: Error) => error)
      expect(failure).toBeInstanceOf(Error)
      if (!(failure instanceof Error)) throw new Error('Expected the upload to fail')
      expect(failure.message).toContain('file upload failed')
      expect(failure.message).toContain('HTTP 403')
      expect(failure.message).toContain('SignatureDoesNotMatch')
      expect(failure.message).toContain('The request signature does not match.')
      expect(failure.message).toContain('test-request-id')
      expect(failure.message).not.toMatch(/test-signed-secret|secret-signature|secret-canonical-request/)
      expect(uploads).toBe(1)
    } finally {
      await server.close()
    }
  })

  it('reports result-download failures even when Axios returns the XML body as a buffer', async () => {
    const server = await serve((_request, response) => {
      response.statusCode = 403
      response.setHeader('Content-Type', 'application/xml')
      response.end(denied)
    })
    try {
      const fileSystem = new XpFileSystem({ type: 'filesystem', operations: [], scope: [] }, process.cwd(), server.url)
      const failure = await new MinerUResultParserService().parseFromUrl(
        `${server.url}/result.zip?Signature=test-signed-secret`, 'task-1', { id: 'doc-1' }, fileSystem
      ).catch((error: Error) => error)
      expect(failure).toBeInstanceOf(Error)
      if (!(failure instanceof Error)) throw new Error('Expected the download to fail')
      expect(failure.message).toContain('result download failed')
      expect(failure.message).toContain('HTTP 403')
      expect(failure.message).toContain('SignatureDoesNotMatch')
      expect(failure.message).toContain('test-request-id')
      expect(failure.message).not.toContain('test-signed-secret')
    } finally {
      await server.close()
    }
  })

  it('keeps retrying transient upload failures before wrapping the error', async () => {
    let uploads = 0
    const server = await serve((request, response) => {
      if (request.method === 'POST') return uploadUrls(response, server.url)
      uploads++
      response.statusCode = uploads === 1 ? 503 : 200
      response.end(uploads === 1 ? 'temporarily unavailable' : 'ok')
    })
    try {
      await expect(client(server.url).createUploadBatch({ files: [{ name: 'test.pdf', buffer: Buffer.from('pdf') }] }))
        .resolves.toEqual({ batchId: 'test-batch' })
      expect(uploads).toBe(2)
    } finally {
      await server.close()
    }
  })

  it('sanitizes JSON transfer diagnostics and drops unrecognized response fields', async () => {
    const server = await serve((request, response) => {
      if (request.method === 'POST') return uploadUrls(response, server.url)
      response.statusCode = 403
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        code: 'AccessDenied',
        message: 'Denied https://files.test/upload?Signature=signed-secret Bearer bearer-secret token=token-secret',
        request_id: 'test-request-id',
        authorization: 'private-authorization'
      }))
    })
    try {
      const failure = await client(server.url).createUploadBatch({ files: [{ name: 'test.pdf', buffer: Buffer.from('pdf') }] })
        .catch((error: Error) => error)
      if (!(failure instanceof Error)) throw new Error('Expected the upload to fail')
      expect(failure.message).toContain('AccessDenied')
      expect(failure.message).toContain('test-request-id')
      expect(failure.message).not.toMatch(/signed-secret|bearer-secret|token-secret|private-authorization/)
    } finally {
      await server.close()
    }
  })
})
