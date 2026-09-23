import { createHash } from 'node:crypto'
import { KDOCS_MAX_FILE_BYTES } from '../constants.js'
import { errorMessage, KdocsConnectorError } from '../errors.js'
import { isWpsHostname } from '../mcp/kdocs-mappers.js'

type ProviderHash = { type: string; sum: string }

export async function downloadWpsFile(input: {
  url: string
  accessToken: string
  hashes: ProviderHash[]
}) {
  let current = requireWpsUrl(input.url)
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    let response: Response
    try {
      response = await fetch(current, {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'User-Agent': 'Xpert-KDocs-Connector'
        },
        redirect: 'manual'
      })
    } catch (error) {
      throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', `WPS file download failed: ${errorMessage(error)}`)
    }
    if (isRedirect(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirectCount === 3) {
        throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', 'WPS file download exceeded the redirect limit')
      }
      current = requireWpsUrl(new URL(location, current).toString())
      continue
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new KdocsConnectorError('TOKEN_EXPIRED', 'WPS rejected the connector credential during file download')
      }
      throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', `WPS file download failed with status ${response.status}`)
    }
    const buffer = await readBoundedBuffer(response)
    verifyHashes(buffer, input.hashes)
    return {
      buffer,
      mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream',
      sha256: createHash('sha256').update(buffer).digest('hex')
    }
  }
  throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', 'WPS file download could not be completed')
}

async function readBoundedBuffer(response: Response) {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > KDOCS_MAX_FILE_BYTES) {
    throw new KdocsConnectorError('FILE_TOO_LARGE', `WPS file exceeds the ${KDOCS_MAX_FILE_BYTES} byte download limit`)
  }
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > KDOCS_MAX_FILE_BYTES) {
        await reader.cancel()
        throw new KdocsConnectorError('FILE_TOO_LARGE', `WPS file exceeds the ${KDOCS_MAX_FILE_BYTES} byte download limit`)
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

function verifyHashes(buffer: Buffer, hashes: ProviderHash[]) {
  const supported = hashes.find((hash) => ['sha256', 'sha1', 'md5'].includes(hash.type.toLowerCase()))
  if (!supported) return
  const actual = createHash(supported.type.toLowerCase()).update(buffer).digest('hex')
  if (actual.toLowerCase() !== supported.sum.toLowerCase()) {
    throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', 'Downloaded WPS file failed its integrity check')
  }
}

function requireWpsUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', 'WPS returned an invalid download URL')
  }
  if (url.protocol !== 'https:' || !isWpsHostname(url.hostname) || url.username || url.password) {
    throw new KdocsConnectorError('FILE_DOWNLOAD_REJECTED', 'WPS returned an untrusted download URL')
  }
  return url
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}
