#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const actionRoot = path.dirname(fileURLToPath(import.meta.url))
const runtimeModulesRoot = path.join(actionRoot, 'runtime-modules')

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  const requestPath = requiredPath('--request')
  const outputDir = requiredPath('--output')
  const request = parseRequest(JSON.parse(await readFile(requestPath, 'utf8')))
  await mkdir(outputDir, { recursive: true })
  const workRoot = await mkdtemp(path.join(outputDir, '.motion-hyperframes-'))
  try {
    const projectDir = path.join(workRoot, 'project')
    const nodeModules = path.join(workRoot, 'node_modules')
    await mkdir(projectDir, { recursive: true })
    await cp(runtimeModulesRoot, nodeModules, { recursive: true, force: true })
    await writeFile(path.join(projectDir, 'index.html'), prepareCompositionHtml(request.payload.compositionHtml))
    process.env.PRODUCER_HEADLESS_SHELL_PATH =
      process.env.PRODUCER_HEADLESS_SHELL_PATH || (await findHeadlessShell(playwrightBrowsersRoot()))
    process.env.XDG_CACHE_HOME = path.join(workRoot, '.cache')
    process.env.PUPPETEER_SKIP_DOWNLOAD = 'true'
    const producerPath = path.join(nodeModules, '@hyperframes', 'producer', 'dist', 'index.js')
    const producer = await import(pathToFileURL(producerPath).href)
    const outputPath = path.join(outputDir, `motion.${request.payload.kind}`)
    const job = producer.createRenderJob({
      fps: request.payload.fps,
      quality: request.payload.quality,
      format: request.payload.kind,
      strictness: 'strict',
      workers: renderWorkers(request.payload.quality),
      hdrMode: 'force-sdr'
    })
    await producer.executeRenderJob(job, projectDir, outputPath, async (current, message) => {
      const progress = Number.isFinite(current.progress) ? Math.max(0, Math.min(100, current.progress)) : 0
      await writeFile(
        path.join(workRoot, 'progress.json'),
        `${JSON.stringify({
          status: current.status,
          stage: current.currentStage,
          progress,
          message: String(message || '').slice(0, 500)
        })}\n`
      )
    })
    await validateOutput(outputPath, request.payload.kind)
    const ffmpeg = await execFileAsync('ffmpeg', ['-version'], { maxBuffer: 1024 * 1024 })
    const producerPackage = JSON.parse(
      await readFile(path.join(nodeModules, '@hyperframes', 'producer', 'package.json'), 'utf8')
    )
    await writeFile(
      path.join(outputDir, 'report.json'),
      `${JSON.stringify(
        {
          renderer: '@hyperframes/producer',
          producerVersion: producerPackage.version,
          nodeVersion: process.versions.node,
          ffmpegVersion: ffmpeg.stdout.split(/\r?\n/)[0] || 'unknown',
          kind: request.payload.kind,
          quality: request.payload.quality,
          fps: request.payload.fps,
          outcome: job.outcome ?? 'completed',
          totalFrames: job.totalFrames ?? null,
          duration: job.duration ?? null,
          warnings: job.warnings ?? [],
          perfSummary: job.perfSummary ?? null
        },
        null,
        2
      )}\n`
    )
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

function parseRequest(value) {
  if (
    !isObject(value) ||
    value.contractVersion !== '1' ||
    value.action !== 'motion.hyperframes-render' ||
    value.actionVersion !== '1.0.0'
  ) {
    throw new Error('EXPORT_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  const payload = value.payload
  if (!isObject(payload) || (payload.kind !== 'mp4' && payload.kind !== 'gif')) {
    throw new Error('EXPORT_INPUT_INVALID: payload kind must be mp4 or gif.')
  }
  if (payload.quality !== 'draft' && payload.quality !== 'standard' && payload.quality !== 'high') {
    throw new Error('EXPORT_INPUT_INVALID: payload quality is invalid.')
  }
  if (payload.fps !== 24 && payload.fps !== 30 && payload.fps !== 60) {
    throw new Error('EXPORT_INPUT_INVALID: payload fps must be 24, 30, or 60.')
  }
  if (typeof payload.compositionHtml !== 'string' || !payload.compositionHtml.includes('data-composition-id')) {
    throw new Error('EXPORT_INPUT_INVALID: native HyperFrames composition HTML is required.')
  }
  if (Buffer.byteLength(payload.compositionHtml, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('EXPORT_INPUT_INVALID: composition HTML exceeds 2 MB.')
  }
  if (hasExternalAssets(payload.compositionHtml)) {
    throw new Error('EXPORT_INPUT_INVALID: composition assets must be embedded as data URIs.')
  }
  return { payload }
}

function hasExternalAssets(html) {
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1]?.trim() || ''
    if (value && !value.startsWith('#') && !value.startsWith('data:')) return true
  }
  for (const match of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const value = match[1]?.trim() || ''
    if (value && !value.startsWith('data:')) return true
  }
  return false
}

function renderWorkers(quality) {
  if (quality === 'high') return 4
  if (quality === 'standard') return 2
  return 1
}

function prepareCompositionHtml(html) {
  if (/\bdata-no-timeline\b/i.test(html) || /<script\b/i.test(html)) return html
  return html.replace(/<[^>]+\bdata-composition-id\s*=\s*["'][^"']+["'][^>]*>/i, (root) =>
    root.replace(/>$/, ' data-no-timeline>')
  )
}

async function validateOutput(outputPath, kind) {
  const content = await readFile(outputPath)
  if (content.length < 16) throw new Error('EXPORT_OUTPUT_INVALID: rendered output is empty.')
  if (kind === 'gif') {
    const header = content.subarray(0, 6).toString('ascii')
    if (header !== 'GIF87a' && header !== 'GIF89a') throw new Error('EXPORT_OUTPUT_INVALID: GIF header is invalid.')
    return
  }
  if (content.subarray(4, 8).toString('ascii') !== 'ftyp')
    throw new Error('EXPORT_OUTPUT_INVALID: MP4 ftyp box is missing.')
}

async function findHeadlessShell(root) {
  const queue = [root]
  while (queue.length) {
    const directory = queue.shift()
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name)
      if (entry.isFile() && entry.name === 'chrome-headless-shell') return candidate
      if (entry.isDirectory()) queue.push(candidate)
    }
  }
  throw new Error('BROWSER_LAUNCH_FAILED: Runtime Chromium headless shell was not found.')
}

function playwrightBrowsersRoot() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH)
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ms-playwright')
}

function requiredPath(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`EXPORT_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}
function classify(message) {
  const normalized = message.toUpperCase()
  if (normalized.includes('EXPORT_OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('EXPORT_INPUT_INVALID')) return 'EXPORT_INPUT_INVALID'
  if (normalized.includes('BROWSER') || normalized.includes('CHROME') || normalized.includes('PUPPETEER'))
    return 'BROWSER_LAUNCH_FAILED'
  if (normalized.includes('FFMPEG') || normalized.includes('ENCOD')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM'))
    return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
