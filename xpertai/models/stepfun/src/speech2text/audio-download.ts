import { lookup as dnsLookup } from 'node:dns'
import { get } from 'node:https'
import { isIP } from 'node:net'

const maxAudioBytes = 25 * 1024 * 1024

/** Resolve at connection time and pin to a public IPv4 address; never follow redirects. */
export function readPublicAudioUrl(value: string, signal?: AbortSignal): Promise<string> {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Audio download requires a public HTTPS URL on port 443')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !isPublicAudioAddress(host)) throw new Error('Audio download address is not public IPv4')
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
  boundedSignal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const request = get(url, {
      signal: boundedSignal,
      family: 4,
      lookup(hostname, _options, callback) {
        dnsLookup(hostname, { family: 4, all: true }, (error, addresses) => {
          if (error || !addresses.length || addresses.some(entry => !isPublicAudioAddress(entry.address))) {
            callback(new Error('Audio download DNS must resolve to public IPv4'), '', 4)
          } else callback(null, addresses[0].address, 4)
        })
      }
    }, response => {
      const mime = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
      const length = Number(response.headers['content-length'])
      if (response.statusCode !== 200 || !mime || !/^audio\/[a-z0-9.+-]+$/.test(mime) || (Number.isFinite(length) && length > maxAudioBytes)) {
        response.destroy()
        reject(new Error('Audio download requires a successful audio response no larger than 25 MiB'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxAudioBytes) {
          response.destroy(new Error('Audio download exceeds 25 MiB'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (!size) reject(new Error('Audio download returned an empty file'))
        else resolve(`data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`)
      })
      response.on('error', () => reject(new Error('Audio download was interrupted')))
    })
    request.on('error', () => reject(new Error('Audio download failed or was cancelled')))
  })
}

export function isPublicAudioAddress(address: string): boolean {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113))
}
