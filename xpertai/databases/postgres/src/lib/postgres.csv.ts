import { createReadStream } from 'node:fs'
import { PassThrough, Readable } from 'node:stream'
import type { File } from '@xpert-ai/plugin-sdk'

export interface CsvSource {
  header: string
  stream: Readable
  hasDataRows: boolean
}

export function openCsvSource(file: File): Readable {
  if (file.stream) {
    return file.stream
  }
  if (file.path) {
    return createReadStream(file.path)
  }
  throw new Error('CSV file stream is empty')
}

export async function readCsvHeader(source: Readable): Promise<CsvSource> {
  const replay = new PassThrough()
  let headerBuffer = ''
  let replayBuffer = ''
  let header: string | null = null
  let afterHeaderBuffer = ''
  let settled = false

  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      if (settled) {
        replay.destroy(error)
        return
      }
      settled = true
      source.destroy()
      replay.destroy(error)
      reject(error)
    }

    source.on('data', (chunk: Buffer | string) => {
      if (settled) {
        replay.write(chunk)
        return
      }

      const chunkText = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
      replayBuffer += chunkText

      if (header === null) {
        headerBuffer += chunkText
        const lineEnd = headerBuffer.indexOf('\n')
        if (lineEnd === -1) {
          return
        }

        header = headerBuffer.slice(0, lineEnd).replace(/\r$/, '')
        afterHeaderBuffer = headerBuffer.slice(lineEnd + 1)
      } else {
        afterHeaderBuffer += chunkText
      }

      if (!/[^\r\n]/.test(afterHeaderBuffer)) {
        return
      }

      settled = true
      source.pause()
      source.removeAllListeners('data')
      source.removeAllListeners('end')
      source.removeAllListeners('error')

      replay.write(replayBuffer)
      source.pipe(replay)
      source.resume()
      resolve({
        header,
        stream: replay,
        hasDataRows: true
      })
    })

    source.once('end', () => {
      if (settled) {
        return
      }
      settled = true
      replay.end(replayBuffer)
      resolve({
        header: header ?? headerBuffer.replace(/\r$/, ''),
        stream: replay,
        hasDataRows: false
      })
    })

    source.once('error', fail)
    replay.once('error', fail)
  })
}
