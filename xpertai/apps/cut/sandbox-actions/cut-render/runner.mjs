#!/usr/bin/env node
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const actionRoot = path.dirname(fileURLToPath(import.meta.url))
const actionVersion = '1.1.5'
const progressLogIntervalMs = 5_000
const limits = Object.freeze({
  maxWidth: 3840,
  maxHeight: 2160,
  maxPixels: 3840 * 2160,
  maxFps: 60,
  maxDurationSeconds: 600,
  maxFrames: 18_000,
  maxTracks: 64,
  maxClips: 2_000,
  maxMediaBytes: 4 * 1024 * 1024 * 1024
})

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  const requestPath = argument('--request')
  const outputDir = argument('--output')
  const request = parseRequest(JSON.parse(await readFile(requestPath, 'utf8')))
  const exportProfile = videoExportProfile(request.payload.exportSettings)
  const mediaRoot = path.join(path.dirname(requestPath), 'media')
  await validateMediaReferences(request.payload.document, mediaRoot)
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
    const downloadPromise = page.waitForEvent('download', { timeout: request.payload.timeoutMs })
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    progressMonitor = startProgressMonitor(page, request)
    const result = await Promise.race([
      downloadPromise.then((download) => ({ download })),
      page.waitForFunction(() => window.__cutRenderState?.state === 'failed', undefined, {
        timeout: request.payload.timeoutMs
      }).then(async () => ({ error: await page.evaluate(() => window.__cutRenderState?.error ?? 'Browser render failed.') }))
    ])
    if ('error' in result) throw new Error(`RENDER_FAILED: ${result.error}`)
    const temporaryPath = await result.download.path()
    if (!temporaryPath) throw new Error('RENDER_OUTPUT_INVALID: Browser Runtime produced no download path.')
    const outputPath = path.join(outputDir, `cut.${exportProfile.extension}`)
    await copyFile(temporaryPath, outputPath)
    await rm(temporaryPath, { force: true })
    const output = await validateVideo(outputPath, exportProfile.format)
    const state = await page.evaluate(() => window.__cutRenderState)
    const report = {
      contractVersion: '1',
      action: 'cut.render-mp4',
      actionVersion,
      sourceRevision: request.payload.sourceRevision,
      width: request.payload.document.settings.width,
      height: request.payload.document.settings.height,
      fps: request.payload.document.settings.fps,
      durationSeconds: request.payload.document.settings.durationSeconds,
      frameCount: Math.round(request.payload.document.settings.durationSeconds * request.payload.document.settings.fps),
      bytes: output.size,
      format: exportProfile.format,
      quality: request.payload.exportSettings.quality,
      includeAudio: request.payload.exportSettings.includeAudio,
      ...(output.hasMovieBox === undefined ? {} : { hasMovieBox: output.hasMovieBox }),
      progress: state?.progress ?? 1
    }
    await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    if (browserErrors.length) process.stderr.write(`${browserErrors.slice(-10).join('\n')}\n`)
  } catch (error) {
    if (browserErrors.length) {
      process.stderr.write(`CUT_BROWSER_DIAGNOSTICS ${JSON.stringify(browserErrors.slice(-10))}\n`)
    }
    throw error
  } finally {
    await progressMonitor?.stop()
    await browser?.close().catch(() => undefined)
    await server.close()
  }
}

function startProgressMonitor(page, request) {
  const startedAt = Date.now()
  const frameCount = Math.round(request.payload.document.settings.durationSeconds * request.payload.document.settings.fps)
  let stopped = false
  let lastPercent = -1
  let pending = Promise.resolve()
  const report = async (force = false) => {
    if (stopped) return
    const state = await page.evaluate(() => window.__cutRenderState ?? null).catch(() => null)
    const progress = Math.min(1, Math.max(0, Number.isFinite(state?.progress) ? state.progress : 0))
    const percent = Math.round(progress * 100)
    if (!force && percent === lastPercent) return
    lastPercent = percent
    const renderProgress = {
      state: typeof state?.state === 'string' ? state.state : 'starting',
      progress,
      percent,
      frame: Math.min(frameCount, Math.round(progress * frameCount)),
      frameCount,
      elapsedMs: Date.now() - startedAt
    }
    process.stdout.write(`XPERT_SANDBOX_PROGRESS ${JSON.stringify({
      progress,
      stage: renderProgress.state,
      current: renderProgress.frame,
      total: frameCount
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
  if (!isObject(value) || value.contractVersion !== '1' || value.action !== 'cut.render-mp4' || value.actionVersion !== actionVersion) {
    throw new Error('RENDER_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  const payload = value.payload
  if (!isObject(payload) || !Number.isInteger(payload.sourceRevision) || payload.sourceRevision < 1 || !isObject(payload.document)) {
    throw new Error('RENDER_INPUT_INVALID: payload requires sourceRevision and document.')
  }
  const settings = payload.document.settings
  if (!isObject(settings)) throw new Error('RENDER_INPUT_INVALID: document settings are required.')
  integerWithin(settings.width, 16, limits.maxWidth, 'width')
  integerWithin(settings.height, 16, limits.maxHeight, 'height')
  integerWithin(settings.fps, 1, limits.maxFps, 'fps')
  finiteWithin(settings.durationSeconds, 0.001, limits.maxDurationSeconds, 'durationSeconds')
  if (settings.width * settings.height > limits.maxPixels) throw new Error('RENDER_RESOURCE_LIMIT: output pixel count exceeds the 4K limit.')
  const frameCount = Math.round(settings.durationSeconds * settings.fps)
  if (frameCount < 1 || frameCount > limits.maxFrames) throw new Error('RENDER_RESOURCE_LIMIT: frame count exceeds 18,000.')
  if (!Array.isArray(payload.document.tracks) || payload.document.tracks.length > limits.maxTracks) {
    throw new Error('RENDER_RESOURCE_LIMIT: track count exceeds 64.')
  }
  const clips = payload.document.tracks.flatMap((track) => Array.isArray(track?.clips) ? track.clips : [])
  if (clips.length > limits.maxClips) throw new Error('RENDER_RESOURCE_LIMIT: clip count exceeds 2,000.')
  const timeoutMs = payload.timeoutMs ?? 15 * 60_000
  integerWithin(timeoutMs, 10_000, 30 * 60_000, 'timeoutMs')
  payload.timeoutMs = timeoutMs
  payload.exportSettings = parseExportSettings(payload.exportSettings)
  return value
}

async function validateMediaReferences(document, mediaRoot) {
  const urls = document.tracks.flatMap((track) => track.clips ?? []).map((clip) => clip.previewUrl).filter(Boolean)
  let bytes = 0
  for (const value of new Set(urls)) {
    const relativePath = mediaRelativePath(value)
    const file = await safeMediaFile(mediaRoot, relativePath)
    bytes += file.size
    if (bytes > limits.maxMediaBytes) throw new Error('RENDER_RESOURCE_LIMIT: staged media exceeds 4 GiB.')
  }
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
      if (url.pathname === '/request.json') return send(response, 200, 'application/json; charset=utf-8', requestBody)
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
  if (!address || typeof address === 'string') throw new Error('SANDBOX_START_FAILED: loopback server did not bind.')
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
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  const stream = createReadStream(file.path, range ? { start: range.start, end: range.end } : undefined)
  const stop = () => stream.destroy()
  request.once('aborted', stop)
  response.once('close', stop)
  stream.once('error', () => response.destroy())
  stream.pipe(response)
}

async function safeMediaFile(root, relativePath) {
  const resolvedRoot = await realpath(root).catch(() => null)
  if (!resolvedRoot) throw new Error('RENDER_INPUT_INVALID: staged media directory is missing.')
  const candidate = await realpath(path.join(resolvedRoot, relativePath)).catch(() => null)
  if (!candidate || !(candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`))) {
    throw new Error('RENDER_INPUT_INVALID: media path escapes the staged directory or does not exist.')
  }
  const file = await stat(candidate)
  if (!file.isFile()) throw new Error('RENDER_INPUT_INVALID: media reference is not a regular file.')
  return { path: candidate, size: file.size }
}

function mediaRelativePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/media/')) throw new Error('RENDER_INPUT_INVALID: media URLs must use /media/<file>.')
  const decoded = decodeURIComponent(value.slice('/media/'.length))
  if (!decoded || decoded.includes('\0') || decoded.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')) {
    throw new Error('RENDER_INPUT_INVALID: media path is invalid.')
  }
  return decoded
}

async function validateVideo(outputPath, format) {
  return format === 'webm' ? validateWebM(outputPath) : validateMp4(outputPath)
}

async function validateMp4(outputPath) {
  const file = await stat(outputPath)
  if (!file.isFile() || file.size < 32) throw new Error('RENDER_OUTPUT_INVALID: MP4 output is empty.')
  const handle = await open(outputPath, 'r')
  try {
    const head = Buffer.alloc(Math.min(file.size, 1024 * 1024))
    await handle.read(head, 0, head.length, 0)
    if (!head.includes(Buffer.from('ftyp'))) throw new Error('RENDER_OUTPUT_INVALID: MP4 ftyp box is missing.')
    const tailLength = Math.min(file.size, 4 * 1024 * 1024)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, file.size - tailLength)
    const hasMovieBox = head.includes(Buffer.from('moov')) || tail.includes(Buffer.from('moov'))
    if (!hasMovieBox) throw new Error('RENDER_OUTPUT_INVALID: MP4 moov box is missing.')
    return { size: file.size, hasMovieBox }
  } finally {
    await handle.close()
  }
}

async function validateWebM(outputPath) {
  const file = await stat(outputPath)
  if (!file.isFile() || file.size < 32) throw new Error('RENDER_OUTPUT_INVALID: WebM output is empty.')
  const handle = await open(outputPath, 'r')
  try {
    const head = Buffer.alloc(Math.min(file.size, 4096))
    await handle.read(head, 0, head.length, 0)
    if (!head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      throw new Error('RENDER_OUTPUT_INVALID: WebM EBML header is missing.')
    }
    if (!head.includes(Buffer.from('webm'))) throw new Error('RENDER_OUTPUT_INVALID: WebM document type is missing.')
    return { size: file.size }
  } finally {
    await handle.close()
  }
}

function parseExportSettings(value) {
  const settings = value == null ? {} : value
  if (!isObject(settings)) throw new Error('RENDER_INPUT_INVALID: exportSettings must be an object.')
  const format = settings.format ?? 'mp4'
  const quality = settings.quality ?? 'high'
  const includeAudio = settings.includeAudio ?? true
  if (!['mp4', 'webm'].includes(format)) throw new Error('RENDER_INPUT_INVALID: export format must be mp4 or webm.')
  if (!['low', 'medium', 'high', 'very_high'].includes(quality)) throw new Error('RENDER_INPUT_INVALID: export quality is invalid.')
  if (typeof includeAudio !== 'boolean') throw new Error('RENDER_INPUT_INVALID: includeAudio must be boolean.')
  return { format, quality, includeAudio }
}

function videoExportProfile(settings) {
  return settings.format === 'webm'
    ? { format: 'webm', extension: 'webm', mimeType: 'video/webm' }
    : { format: 'mp4', extension: 'mp4', mimeType: 'video/mp4' }
}

function parseRange(value, size) {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match) throw new Error('RENDER_INPUT_INVALID: media byte range is invalid.')
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new Error('RENDER_INPUT_INVALID: media suffix byte range is invalid.')
    }
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    throw new Error('RENDER_INPUT_INVALID: media byte range is outside the file.')
  }
  return { start, end: Math.min(end, size - 1) }
}

function send(response, status, type, body) {
  response.statusCode = status
  response.setHeader('Content-Type', type)
  response.setHeader('Content-Length', String(body.length))
  response.end(body)
}
function mimeType(value) {
  const extension = path.extname(value).toLowerCase()
  return ({ '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[extension] ?? 'application/octet-stream'
}
function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`RENDER_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}
function integerWithin(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`RENDER_INPUT_INVALID: ${name} must be an integer from ${min} to ${max}.`)
}
function finiteWithin(value, min, max, name) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`RENDER_INPUT_INVALID: ${name} must be from ${min} to ${max}.`)
}
function classify(message) {
  const normalized = message.toUpperCase()
  if (normalized.includes('CUT_MEDIA_') || normalized.includes('MEDIA_ERR_')) return 'EXPORT_MEDIA_FAILED'
  if (normalized.includes('RENDER_OUTPUT_INVALID') || normalized.includes('RENDER_FAILED')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('RENDER_INPUT_INVALID') || normalized.includes('RENDER_RESOURCE_LIMIT')) return 'EXPORT_INPUT_INVALID'
  if (normalized.includes('BROWSER') || normalized.includes('CHROMIUM') || normalized.includes('PLAYWRIGHT')) return 'BROWSER_LAUNCH_FAILED'
  if (normalized.includes('TIMEOUT') || normalized.includes('TIMED OUT')) return 'EXPORT_TIMEOUT'
  if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM')) return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}
function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }
