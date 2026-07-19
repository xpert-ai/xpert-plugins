#!/usr/bin/env node
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const actionRoot = path.dirname(fileURLToPath(import.meta.url))
const actionVersion = '1.0.0'
const progressLogIntervalMs = 2_000
const maxSourceBytes = 4 * 1024 * 1024 * 1024
const maxResultBytes = 10 * 1024 * 1024
const whisperModel = Object.freeze({
  key: 'xenova-whisper-tiny-q4',
  id: 'Xenova/whisper-tiny',
  revision: '5332fcc35e32a33b86612b9a57a89be7906102b1',
  dtype: 'q4'
})
const onnxRuntime = Object.freeze({
  key: 'onnxruntime-web-1.26.0-dev.20260416-b7804b056c',
  version: '1.26.0-dev.20260416-b7804b056c',
  files: new Set(['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'])
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
  const mediaRoot = path.join(path.dirname(requestPath), 'media')
  const source = await safeFile(mediaRoot, mediaRelativePath(request.payload.sourcePath), 'SANDBOX_WHISPER_INPUT_INVALID')
  if (source.size > maxSourceBytes) throw new Error('SANDBOX_WHISPER_RESOURCE_LIMIT: source media exceeds 4 GiB.')
  const runtimeResources = await resolveRuntimeResources()
  await mkdir(outputDir, { recursive: true })
  const server = await startServer(request, mediaRoot, runtimeResources)
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
    const page = await browser.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    progressMonitor = startProgressMonitor(page)
    await page.waitForFunction(() => {
      const state = window.__cutSandboxWhisperState?.state
      return state === 'complete' || state === 'failed'
    }, undefined, { timeout: 300_000 })
    const state = await page.evaluate(() => window.__cutSandboxWhisperState ?? null)
    if (state?.state === 'failed') throw new Error(`SANDBOX_WHISPER_MEDIA_FAILED: ${state.error ?? 'Sandbox Whisper failed.'}`)
    const result = validateResult(state?.result, request)
    const content = Buffer.from(`${JSON.stringify(result)}\n`)
    if (content.length > maxResultBytes) throw new Error('SANDBOX_WHISPER_OUTPUT_INVALID: transcript JSON exceeds 10 MiB.')
    await writeFile(path.join(outputDir, 'transcript.json'), content)
    if (browserErrors.length) process.stderr.write(`${browserErrors.slice(-10).join('\n')}\n`)
  } catch (error) {
    if (browserErrors.length) process.stderr.write(`CUT_SANDBOX_WHISPER_DIAGNOSTICS ${JSON.stringify(browserErrors.slice(-10))}\n`)
    throw error
  } finally {
    await progressMonitor?.stop()
    await browser?.close().catch(() => undefined)
    await server.close()
  }
}

function startProgressMonitor(page) {
  let stopped = false
  let lastKey = ''
  let pending = Promise.resolve()
  const report = async (force = false) => {
    if (stopped) return
    const state = await page.evaluate(() => window.__cutSandboxWhisperState ?? null).catch(() => null)
    const progress = Math.min(1, Math.max(0, Number.isFinite(state?.progress) ? state.progress : 0))
    const stage = typeof state?.state === 'string' ? state.state : 'starting'
    const current = Number.isFinite(state?.current) ? Math.max(0, Math.round(state.current)) : Math.round(progress * 100)
    const total = Number.isFinite(state?.total) ? Math.max(current, Math.round(state.total)) : 100
    const key = `${stage}:${Math.round(progress * 1000)}:${current}:${total}`
    if (!force && key === lastKey) return
    lastKey = key
    process.stdout.write(`XPERT_SANDBOX_PROGRESS ${JSON.stringify({
      progress,
      stage,
      ...(typeof state?.message === 'string' ? { message: state.message.slice(0, 240) } : {}),
      current,
      total
    })}\n`)
  }
  const schedule = (force = false) => {
    pending = pending.then(() => report(force), () => report(force))
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
  if (!isObject(value) || value.contractVersion !== '1' || value.action !== 'cut.transcribe-whisper' || value.actionVersion !== actionVersion) {
    throw new Error('SANDBOX_WHISPER_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  const payload = value.payload
  if (
    !isObject(payload) ||
    typeof payload.sourcePath !== 'string' ||
    typeof payload.sourceName !== 'string' ||
    typeof payload.sourceMimeType !== 'string' ||
    typeof payload.language !== 'string' ||
    payload.model !== whisperModel.id
  ) {
    throw new Error('SANDBOX_WHISPER_INPUT_INVALID: sourcePath, sourceName, sourceMimeType, language, and the pinned model are required.')
  }
  if (!payload.sourceName.trim() || payload.sourceName.length > 240 || !payload.sourceMimeType.trim() || payload.sourceMimeType.length > 120) {
    throw new Error('SANDBOX_WHISPER_INPUT_INVALID: source media metadata is invalid.')
  }
  if (!payload.language.trim() || payload.language.length > 35) {
    throw new Error('SANDBOX_WHISPER_INPUT_INVALID: language is invalid.')
  }
  mediaRelativePath(payload.sourcePath)
  return value
}

function validateResult(value, request) {
  if (
    !isObject(value) ||
    value.contractVersion !== '1' ||
    value.action !== 'cut.transcribe-whisper' ||
    value.actionVersion !== actionVersion ||
    value.model !== request.payload.model ||
    value.language !== request.payload.language ||
    value.device !== 'wasm' ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0 ||
    !Array.isArray(value.segments) ||
    !value.segments.length ||
    value.segments.length > 5_000
  ) {
    throw new Error('SANDBOX_WHISPER_OUTPUT_INVALID: transcript result is incomplete or invalid.')
  }
  let previousStart = -1
  for (const segment of value.segments) {
    if (
      !isObject(segment) ||
      typeof segment.start !== 'number' ||
      !Number.isFinite(segment.start) ||
      typeof segment.end !== 'number' ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end <= segment.start ||
      segment.end > value.duration + 0.5 ||
      segment.start < previousStart ||
      typeof segment.text !== 'string' ||
      !segment.text.trim() ||
      segment.text.length > 4_000
    ) {
      throw new Error('SANDBOX_WHISPER_OUTPUT_INVALID: transcript segment is invalid.')
    }
    previousStart = segment.start
  }
  return value
}

async function startServer(request, mediaRoot, runtimeResources) {
  const browserBundle = await readFile(path.join(actionRoot, 'browser-entry.js'))
  const requestBody = Buffer.from(JSON.stringify(request))
  const server = createServer(async (incoming, response) => {
    try {
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1')
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      if (url.pathname === '/') return send(response, 200, 'text/html; charset=utf-8', Buffer.from('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><script type="module" src="/browser-entry.js"></script></body></html>'))
      if (url.pathname === '/browser-entry.js') return send(response, 200, 'text/javascript; charset=utf-8', browserBundle)
      if (url.pathname === '/request.json') return send(response, 200, 'application/json', requestBody)
      if (url.pathname.startsWith('/media/')) return await sendFile(incoming, response, mediaRoot, mediaRelativePath(url.pathname), request.payload.sourceMimeType, 'SANDBOX_WHISPER_INPUT_INVALID')
      if (url.pathname.startsWith('/models/')) return await sendFile(incoming, response, runtimeResources.modelRoot, modelRelativePath(url.pathname), modelMimeType(url.pathname), 'SANDBOX_WHISPER_START_FAILED')
      if (url.pathname.startsWith('/runtime/onnx/')) return await sendFile(incoming, response, runtimeResources.onnxRoot, onnxRelativePath(url.pathname), runtimeMimeType(url.pathname), 'SANDBOX_WHISPER_START_FAILED')
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
  if (!address || typeof address === 'string') throw new Error('SANDBOX_WHISPER_START_FAILED: server did not bind.')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}

async function resolveRuntimeResources() {
  const configuredRoot = process.env.XPERT_SANDBOX_RUNTIME_ARTIFACT_ROOT?.trim()
  if (!configuredRoot || !path.isAbsolute(configuredRoot) || configuredRoot.includes('\0')) {
    throw new Error('SANDBOX_WHISPER_START_FAILED: trusted browser-ai Runtime Artifact root is unavailable.')
  }
  const root = await realpath(configuredRoot).catch(() => null)
  if (!root) throw new Error('SANDBOX_WHISPER_START_FAILED: browser-ai Runtime Artifact root does not exist.')
  const catalogFile = await safeFile(root, 'catalog.json', 'SANDBOX_WHISPER_START_FAILED')
  const catalog = JSON.parse(await readFile(catalogFile.path, 'utf8'))
  if (!isObject(catalog) || catalog.version !== 1 || !Array.isArray(catalog.resources)) {
    throw new Error('SANDBOX_WHISPER_START_FAILED: browser-ai Runtime resource catalog is invalid.')
  }
  const model = catalog.resources.find((resource) => isObject(resource) && resource.key === whisperModel.key)
  if (
    !isObject(model) ||
    model.type !== 'model' ||
    model.modelId !== whisperModel.id ||
    model.revision !== whisperModel.revision ||
    model.dtype !== whisperModel.dtype ||
    typeof model.path !== 'string'
  ) {
    throw new Error(`SANDBOX_WHISPER_START_FAILED: required Runtime model ${whisperModel.key} is unavailable or does not match its fixed revision.`)
  }
  const ort = catalog.resources.find((resource) => isObject(resource) && resource.key === onnxRuntime.key)
  if (!isObject(ort) || ort.type !== 'onnxruntime' || ort.version !== onnxRuntime.version || typeof ort.path !== 'string') {
    throw new Error(`SANDBOX_WHISPER_START_FAILED: required Runtime resource ${onnxRuntime.key} is unavailable.`)
  }
  const modelRoot = await safeDirectory(root, safeRelativePath(model.path, 'SANDBOX_WHISPER_START_FAILED'), 'SANDBOX_WHISPER_START_FAILED')
  const onnxRoot = await safeDirectory(root, safeRelativePath(ort.path, 'SANDBOX_WHISPER_START_FAILED'), 'SANDBOX_WHISPER_START_FAILED')
  return { modelRoot, onnxRoot }
}

async function sendFile(request, response, root, relativePath, contentType, errorCode) {
  const file = await safeFile(root, relativePath, errorCode)
  const range = parseRange(request.headers.range, file.size, errorCode)
  response.statusCode = range ? 206 : 200
  response.setHeader('Accept-Ranges', 'bytes')
  response.setHeader('Content-Type', contentType)
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

async function safeFile(root, relativePath, errorCode) {
  const resolvedRoot = await realpath(root).catch(() => null)
  if (!resolvedRoot) throw new Error(`${errorCode}: file root is missing.`)
  const candidate = await realpath(path.join(resolvedRoot, relativePath)).catch(() => null)
  if (!candidate || !(candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`))) {
    throw new Error(`${errorCode}: file path escapes its root or does not exist.`)
  }
  const file = await stat(candidate)
  if (!file.isFile()) throw new Error(`${errorCode}: file reference is not a regular file.`)
  return { path: candidate, size: file.size }
}

async function safeDirectory(root, relativePath, errorCode) {
  const resolvedRoot = await realpath(root).catch(() => null)
  if (!resolvedRoot) throw new Error(`${errorCode}: resource root is missing.`)
  const candidate = await realpath(path.join(resolvedRoot, relativePath)).catch(() => null)
  if (!candidate || !(candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`))) {
    throw new Error(`${errorCode}: resource directory escapes its root or does not exist.`)
  }
  const details = await stat(candidate)
  if (!details.isDirectory()) throw new Error(`${errorCode}: resource reference is not a directory.`)
  return candidate
}

function mediaRelativePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/media/')) throw new Error('SANDBOX_WHISPER_INPUT_INVALID: sourcePath must use /media/<file>.')
  return safeRelativePath(value.slice('/media/'.length), 'SANDBOX_WHISPER_INPUT_INVALID')
}

function modelRelativePath(value) {
  const prefix = `/models/${whisperModel.id}/`
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error('SANDBOX_WHISPER_START_FAILED: model path is invalid.')
  return safeRelativePath(value.slice(prefix.length), 'SANDBOX_WHISPER_START_FAILED')
}

function onnxRelativePath(value) {
  const prefix = '/runtime/onnx/'
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error('SANDBOX_WHISPER_START_FAILED: ONNX Runtime path is invalid.')
  const relativePath = safeRelativePath(value.slice(prefix.length), 'SANDBOX_WHISPER_START_FAILED')
  if (!onnxRuntime.files.has(relativePath)) throw new Error('SANDBOX_WHISPER_START_FAILED: ONNX Runtime file is not allowed.')
  return relativePath
}

function safeRelativePath(value, errorCode) {
  const decoded = decodeURIComponent(value)
  if (!decoded || decoded.includes('\0') || decoded.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${errorCode}: relative path is invalid.`)
  }
  return decoded
}

function parseRange(header, size, errorCode) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) throw new Error(`${errorCode}: invalid byte range.`)
  let start
  let end
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error(`${errorCode}: invalid suffix range.`)
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    throw new Error(`${errorCode}: unsatisfiable byte range.`)
  }
  return { start, end: Math.min(end, size - 1) }
}

function send(response, status, contentType, body) {
  response.statusCode = status
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Length', String(body.length))
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.end(body)
}

function modelMimeType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json'
  if (filePath.endsWith('.onnx')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function runtimeMimeType(filePath) {
  if (filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.wasm')) return 'application/wasm'
  return 'application/octet-stream'
}

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`SANDBOX_WHISPER_INPUT_INVALID: ${name} is required.`)
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
