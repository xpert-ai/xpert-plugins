import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const requestPath = argument('--request')
const inputDir = path.dirname(requestPath)
const outputDir = argument('--output')

try {
  const request = JSON.parse(await readFile(requestPath, 'utf8'))
  validateRequest(request)
  const sourcePath = path.join(inputDir, 'media', 'source.mp4')
  const sourceStat = await stat(sourcePath)
  if (!sourceStat.isFile() || sourceStat.size < 12) {
    throw new Error('EXPORT_INPUT_INVALID: source video is missing.')
  }

  await mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'continuity-frame.png')

  try {
    await extractWithFfmpeg(sourcePath, outputPath, request.payload.position)
  } catch {
    await extractWithBrowser(sourcePath, sourceStat.size, outputPath, request.payload.position)
  }

  const buffer = await readFile(outputPath)
  validateOutput(buffer)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}

async function extractWithFfmpeg(sourcePath, outputPath, position) {
  const args = position === 'first'
    ? ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-frames:v', '1', '-an', '-sn', '-dn', outputPath]
    : ['-hide_banner', '-loglevel', 'error', '-y', '-sseof', '-0.08', '-i', sourcePath, '-frames:v', '1', '-an', '-sn', '-dn', outputPath]
  await execFileAsync('ffmpeg', args, { maxBuffer: 4 * 1024 * 1024 })
}

async function extractWithBrowser(sourcePath, size, outputPath, position) {
  const server = await serveVideo(sourcePath, size)
  try {
    const { chromium } = await import('playwright-core')
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
      await page.goto(server.url, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => {
        document.body.innerHTML = '<video id="source" muted playsinline preload="auto"></video><canvas id="frame"></canvas>'
      })
      const sourceUrl = new URL('source.mp4', server.url).href
      const png = await page.evaluate(async ({ url, position }) => {
        const video = document.getElementById('source')
        const canvas = document.getElementById('frame')
        video.crossOrigin = 'anonymous'
        video.src = url
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve
          video.onerror = () => reject(new Error('EXPORT_MEDIA_FAILED: video metadata could not be decoded.'))
        })
        const target = position === 'first'
          ? 0
          : Math.max(0, video.duration - Math.min(0.08, video.duration / 20))
        await new Promise((resolve, reject) => {
          video.onseeked = resolve
          video.onerror = () => reject(new Error('EXPORT_MEDIA_FAILED: video frame could not be decoded.'))
          video.currentTime = target
        })
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d').drawImage(video, 0, 0)
        return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
      }, { url: sourceUrl, position })
      if (!png.width || !png.height || !png.dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error('EXPORT_OUTPUT_INVALID: extracted frame is empty.')
      }
      const buffer = Buffer.from(png.dataUrl.slice('data:image/png;base64,'.length), 'base64')
      if (buffer.length < 64 || buffer.subarray(1, 4).toString('ascii') !== 'PNG') {
        throw new Error('EXPORT_OUTPUT_INVALID: extracted frame is not a PNG image.')
      }
      await writeFile(outputPath, buffer)
    } finally {
      await browser.close()
    }
  } finally {
    await server.close()
  }
}

async function serveVideo(filePath, size) {
  const server = createServer(async (request, response) => {
    if (request.url === '/' || request.url === '/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
      response.end('<!doctype html><html><body></body></html>')
      return
    }
    if (request.url !== '/source.mp4') {
      response.writeHead(404).end()
      return
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
    const buffer = await readFile(filePath)
    if (!range) {
      response.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': size,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      })
      response.end(buffer)
      return
    }
    const start = Number(range[1])
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    response.writeHead(206, {
      'Content-Type': 'video/mp4',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    })
    response.end(buffer.subarray(start, end + 1))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return {
    url: `http://127.0.0.1:${address.port}/source.mp4`,
    close: () => new Promise((resolve) => server.close(resolve))
  }
}

function validateRequest(value) {
  if (!value || value.contractVersion !== '1' || value.action !== 'story-studio.extract-video-frame' || value.actionVersion !== '1.0.0') {
    throw new Error('EXPORT_INPUT_INVALID: action contract does not match.')
  }
  if (!value.payload || !['first', 'last'].includes(value.payload.position)) {
    throw new Error('EXPORT_INPUT_INVALID: payload.position must be first or last.')
  }
}

function validateOutput(buffer) {
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
    throw new Error('EXPORT_OUTPUT_INVALID: extracted frame is empty.')
  }
  if (buffer.subarray(1, 4).toString('ascii') !== 'PNG') {
    throw new Error('EXPORT_OUTPUT_INVALID: extracted frame is not a PNG image.')
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`EXPORT_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}
