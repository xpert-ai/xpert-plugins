jest.mock('node:https', () => ({ get: jest.fn() }))
jest.mock('node:dns', () => ({ lookup: jest.fn() }))
import { get, type RequestOptions } from 'node:https'
import { lookup } from 'node:dns'
import { IncomingMessage, type ClientRequest } from 'node:http'
import { Socket } from 'node:net'
import { EventEmitter } from 'node:events'
import { isPublicAudioAddress, readPublicAudioUrl } from './audio-download.js'

const getMock = jest.mocked(get)
describe('bounded uploaded-audio download', () => {
  beforeEach(() => jest.resetAllMocks())
  it.each(['127.0.0.1', '10.1.1.1', '172.16.0.2', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', '224.0.0.1'])('rejects private/reserved address %s', (ip) => {
    expect(isPublicAudioAddress(ip)).toBe(false)
  })
  it('rejects invalid URL forms before network access', () => {
    for (const url of ['http://example.com/a.wav', 'https://127.0.0.1/a.wav', 'https://[::1]/a.wav', 'https://a:b@example.com/a.wav', 'https://example.com:444/a.wav']) {
      expect(() => readPublicAudioUrl(url)).toThrow()
    }
    expect(getMock).not.toHaveBeenCalled()
  })
  function mockResponse(status: number, mime: string, body = 'audio', length?: string) {
    // Only the transport's EventEmitter surface is used by this fixture.
    const request = new EventEmitter() as ClientRequest
    getMock.mockImplementation((_url, _options, listener) => {
      const response = new IncomingMessage(new Socket())
      response.statusCode = status
      response.headers = { 'content-type': mime, ...(length ? { 'content-length': length } : {}) }
      queueMicrotask(() => { listener?.(response); response.push(Buffer.from(body)); response.push(null) })
      return request
    })
  }
  it('accepts audio only, with no redirect following or oversized response', async () => {
    mockResponse(200, 'audio/wav')
    await expect(readPublicAudioUrl('https://files.example.com/a')).resolves.toBe('data:audio/wav;base64,YXVkaW8=')
    mockResponse(302, 'audio/wav')
    await expect(readPublicAudioUrl('https://files.example.com/a')).rejects.toThrow('successful audio')
    mockResponse(200, 'text/html')
    await expect(readPublicAudioUrl('https://files.example.com/a')).rejects.toThrow('successful audio')
    mockResponse(200, 'audio/wav', 'audio', String(26 * 1024 * 1024))
    await expect(readPublicAudioUrl('https://files.example.com/a')).rejects.toThrow('25 MiB')
  })
  it('validates the complete DNS result inside the connection lookup', async () => {
    mockResponse(200, 'audio/wav')
    await readPublicAudioUrl('https://files.example.com/a')
    const options = getMock.mock.calls[0][1] as RequestOptions
    expect(options.family).toBe(4)
    jest.mocked(lookup).mockImplementation((_host, _options, callback) => {
      callback(null, [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])
    })
    const callback = jest.fn()
    options.lookup?.('files.example.com', {}, callback)
    expect(callback).toHaveBeenCalledWith(expect.any(Error), '', 4)
  })
})
