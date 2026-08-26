import { createHash } from 'node:crypto'
import { KdocsConnectorError } from '../errors.js'
import { downloadWpsFile } from './kdocs-file-transfer.js'

describe('downloadWpsFile', () => {
  afterEach(() => jest.restoreAllMocks())

  it('downloads from a trusted WPS domain and verifies the provider hash', async () => {
    const bytes = Buffer.from('verified content')
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(bytes, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.length) }
    }))

    await expect(downloadWpsFile({
      url: 'https://download.kdocs.cn/files/report.pdf',
      accessToken: 'token',
      hashes: [{ type: 'sha256', sum: createHash('sha256').update(bytes).digest('hex') }]
    })).resolves.toMatchObject({ buffer: bytes, mimeType: 'application/pdf' })
  })

  it('rejects a redirect that leaves WPS-controlled domains', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: 'https://attacker.example/file.pdf' }
    }))

    await expect(downloadWpsFile({
      url: 'https://download.kdocs.cn/files/report.pdf',
      accessToken: 'token',
      hashes: []
    })).rejects.toEqual(expect.objectContaining<Partial<KdocsConnectorError>>({ code: 'FILE_DOWNLOAD_REJECTED' }))
  })

  it('rejects downloaded bytes that do not match the provider hash', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(Buffer.from('changed')))

    await expect(downloadWpsFile({
      url: 'https://download.kdocs.cn/files/report.pdf',
      accessToken: 'token',
      hashes: [{ type: 'sha256', sum: createHash('sha256').update('expected').digest('hex') }]
    })).rejects.toEqual(expect.objectContaining<Partial<KdocsConnectorError>>({ code: 'FILE_DOWNLOAD_REJECTED' }))
  })
})
