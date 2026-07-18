#!/usr/bin/env node
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const actionRoot = path.dirname(fileURLToPath(import.meta.url))
const actionVersion = '1.0.0'
const progressLogIntervalMs = 2_000
const maxSourceBytes = 4 * 1024 * 1024 * 1024

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  const requestPath = argument('--request')
  const outputDir = argument('--output')
  const request = parseRequest(JSON.parse(await readFile(requestPath, 'utf8')))
  const mediaRoot = path.join(path.dirname(requestPath), 'media')
  const source = await safeMediaFile(mediaRoot, mediaRelativePath(request.payload.sourcePath))
  if (source.size > maxSourceBytes) throw new Error('AUDIO_PROXY_RESOURCE_LIMIT: source media exceeds 4 GiB.')
  await mkdir(outputDir, { recursive: true })
  const server = await startServer(request, mediaRoot)
  let browser
  let progressMonitor
  const browserErrors = []
  try {
    const executablePath = process.env.CUT_SANDBOX_CHROMIUM_EXECUTABLE?.trim() || undefined
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
    })
    const page = await browser.newPage({ acceptDownloads: true })
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    const downloadPromise = page.waitForEvent('download', { timeout: 300_000 })
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    progressMonitor = startProgressMonitor(page)
    const result = await Promise.race([
      downloadPromise.then((download) => ({ download })),
      page.waitForFunction(() => window.__cutAudioProxyState?.state === 'failed', undefined, {
        timeout: 300_000
      }).then(async () => ({ error: await page.evaluate(() => window.__cutAudioProxyState?.error ?? 'Audio preparation failed.') }))
    ])
    if ('error' in result) throw new Error(`AUDIO_PROXY_MEDIA_FAILED: ${result.error}`)
    const temporaryPath = await result.download.path()
    if (!temporaryPath) throw new Error('AUDIO_PROXY_OUTPUT_INVALID: Browser Runtime produced no download path.')
    const outputPath = path.join(outputDir, 'speech.wav')
    await copyFile(temporaryPath, outputPath)
    await rm(temporaryPath, { force: true })
    await validateWav(outputPath)
    if (browserErrors.length) process.stderr.write(`${browserErrors.slice(-10).join('\n')}\n`)
  } catch (error) {
    if (browserErrors.length) process.stderr.write(`CUT_AUDIO_PROXY_DIAGNOSTICS ${JSON.stringify(browserErrors.slice(-10))}\n`)
    throw error
  } finally {
    await progressMonitor?.stop()
    await browser?.close().catch(() => undefined)
    await server.close()
  }
}

function startProgressMonitor(page) {
  let stopped = false
  let lastPercent = -1
  let pending = Promise.resolve()
  const report = async (force = false) => {
    if (stopped) return
    const state = await page.evaluate(() => window.__cutAudioProxyState ?? null).catch(() => null)
    const progress = Math.min(1, Math.max(0, Number.isFinite(state?.progress) ? state.progress : 0))
    const percent = Math.round(progress * 100)
    if (!force && percent === lastPercent) return
    lastPercent = percent
    process.stdout.write(`XPERT_SANDBOX_PROGRESS ${JSON.stringify({
      progress,
      stage: typeof state?.state === 'string' ? state.state : 'starting',
      current: percent,
      total: 100
    })}\n`)
  }
  const schedule = (force = false) => {
    pending = pending.then(() => report(force))
    return pending
  }
  void schedule(true)
  const timer = setInterval(() => void schedule(), progressLogIntervalMs)
  timer.unref()
  return {
    async stop() {
      if (stopped) return
      clearInterval(timer)
      await schedule(true)
      stopped = true
    }
  }
}

function parseRequest(value) {
  if (!isObject(value) || value.contractVersion !== '1' || value.action !== 'cut.prepare-transcription-audio' || value.actionVersion !== actionVersion) {
    throw new Error('AUDIO_PROXY_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  const payload = value.payload
  if (!isObject(payload) || typeof payload.sourcePath !== 'string' || typeof payload.sourceName !== 'string' || typeof payload.sourceMimeType !== 'string') {
    throw new Error('AUDIO_PROXY_INPUT_INVALID: sourcePath, sourceName, and sourceMimeType are required.')
  }
  if (payload.sampleRate !== 16_000 || payload.channels !== 1) {
    throw new Error('AUDIO_PROXY_INPUT_INVALID: output must be 16 kHz mono audio.')
  }
  mediaRelativePath(payload.sourcePath)
  return value
}

async function startServer(request, mediaRoot) {
  const browserBundle = await readFile(path.join(actionRoot, 'browser-entry.js'))
  const requestBody = Buffer.from(JSON.stringify(request))
  const server = createServer(async (incoming, response) => {
    try {
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1')
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      if (url.pathname === '/') return send(response, 200, 'text/html; charset=utf-8', Buffer.from('<!doctype html><html><body><script type="module" src="/browser-entry.js"></script></body></html>'))
      if (url.pathname === '/browser-entry.js') return send(response, 200, 'text/javascript; charset=utf-8', browserBundle)
      if (url.pathname === '/request.json') return send(response, 200, 'application/json', requestBody)
      if (url.pathname.startsWith('/media/')) return await sendMedia(incoming, response, mediaRoot, mediaRelativePath(url.pathname))
      return send(response, 404, 'text/plain; charset=utf-8', Buffer.from('Not found'))
    } catch (error) {
      return send(response, 400, 'text/plain; charset=utf-8', Buffer.from(error instanceof Error ? error.message : String(error)))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('SANDBOX_START_FAILED: audio proxy server did not bind.')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}

async function sendMedia(request, response, mediaRoot, relativePath) {
  const file = await safeMediaFile(mediaRoot, relativePath)
  const range = parseRange(request.headers.range, file.size)
  response.statusCode = range ? 206 : 200
  response.setHeader('Accept-Ranges', 'bytes')
  response.setHeader('Content-Type', mimeType(file.path))
  response.setHeader('Content-Length', String(range ? range.end - range.start + 1 : file.size))
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  if (range) response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`)
  if (request.method === 'HEAD') return response.end()
  const stream = createReadStream(file.path, range ? { start: range.start, end: range.end } : undefined)
  const stop = () => stream.destroy()
  request.once('aborted', stop)
  response.once('close', stop)
  stream.once('error', () => response.destroy())
  stream.pipe(response)
}

async function safeMediaFile(root, relativePath) {
  const resolvedRoot = await realpath(root).catch(() => null)
  if (!resolvedRoot) throw new Error('AUDIO_PROXY_INPUT_INVALID: staged media directory is missing.')
  const candidate = await realpath(path.join(resolvedRoot, relativePath)).catch(() => null)
  if (!candidate || !(candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`))) {
    throw new Error('AUDIO_PROXY_INPUT_INVALID: media path escapes the staged directory or does not exist.')
  }
  const file = await stat(candidate)
  if (!file.isFile()) throw new Error('AUDIO_PROXY_INPUT_INVALID: media reference is not a regular file.')
  return { path: candidate, size: file.size }
}

function mediaRelativePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/media/')) throw new Error('AUDIO_PROXY_INPUT_INVALID: sourcePath must use /media/<file>.')
  const decoded = decodeURIComponent(value.slice('/media/'.length))
  if (!decoded || decoded.includes('\0') || decoded.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')) {
    throw new Error('AUDIO_PROXY_INPUT_INVALID: media path is invalid.')
  }
  return decoded
}

function parseRange(header, size) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) throw new Error('AUDIO_PROXY_INPUT_INVALID: invalid byte range.')
  let start
  let end
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('AUDIO_PROXY_INPUT_INVALID: invalid suffix range.')
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    throw new Error('AUDIO_PROXY_INPUT_INVALID: unsatisfiable byte range.')
  }
  return { start, end: Math.min(end, size - 1) }
}

async function validateWav(outputPath) {
  const content = await readFile(outputPath)
  if (content.length <= 44 || content.toString('ascii', 0, 4) !== 'RIFF' || content.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('AUDIO_PROXY_OUTPUT_INVALID: WAVE header is invalid.')
  }
  if (content.readUInt16LE(22) !== 1 || content.readUInt32LE(24) !== 16_000 || content.readUInt16LE(34) !== 16) {
    throw new Error('AUDIO_PROXY_OUTPUT_INVALID: WAVE output is not 16 kHz mono PCM16.')
  }
}

function send(response, status, contentType, body) {
  response.statusCode = status
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Length', String(body.length))
  response.end(body)
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return ({ '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac' })[extension] ?? 'application/octet-stream'
}

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`AUDIO_PROXY_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}

function classify(message) {
  const value = message.toUpperCase()
  if (value.includes('OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (value.includes('MEDIA_FAILED')) return 'EXPORT_MEDIA_FAILED'
  if (value.includes('INPUT_INVALID') || value.includes('RESOURCE_LIMIT')) return 'EXPORT_INPUT_INVALID'
  if (value.includes('BROWSER') || value.includes('CHROMIUM') || value.includes('PLAYWRIGHT')) return 'BROWSER_LAUNCH_FAILED'
  if (value.includes('ENOMEM') || value.includes('OUT OF MEMORY') || value.includes('OOM')) return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
