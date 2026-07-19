#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bundleRoot = path.dirname(fileURLToPath(import.meta.url))

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  const requestPath = argument('--request')
  const outputDir = argument('--output')
  const request = parseRequest(JSON.parse(await readFile(requestPath, 'utf8')))
  const snapshotPath = path.join(path.dirname(requestPath), 'canvas', 'snapshot.json')
  const snapshotBuffer = await readFile(snapshotPath)
  if (!snapshotBuffer.length || snapshotBuffer.length > 64 * 1024 * 1024) {
    throw new Error('EXPORT_INPUT_INVALID: Canvas snapshot is empty or exceeds 64 MiB.')
  }
  const snapshot = parseSnapshot(JSON.parse(snapshotBuffer.toString('utf8')))
  if (!snapshot.store[request.payload.pageId] || snapshot.store[request.payload.pageId].typeName !== 'page') {
    throw new Error(`EXPORT_INPUT_INVALID: Canvas page was not found: ${request.payload.pageId}`)
  }
  const svg = pageHasShapes(snapshot.store, request.payload.pageId)
    ? await renderWithBrowser(snapshot, request.payload.pageId)
    : emptyPageSvg(request.payload.emptyLabel)
  validateSvg(svg)
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'canvas.svg'), svg, 'utf8')
}

async function renderWithBrowser(snapshot, pageId) {
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.route('**/*', (route) => route.abort('blockedbyclient'))
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="canvas-render-root"></div></body></html>')
    await page.addStyleTag({ path: path.join(bundleRoot, 'renderer.css') })
    await page.addScriptTag({ path: path.join(bundleRoot, 'renderer.js') })
    const result = await page.evaluate(async (input) => {
      if (!window.__xpertCanvasRender) throw new Error('EXPORT_OUTPUT_INVALID: Canvas browser renderer did not initialize.')
      return window.__xpertCanvasRender(input)
    }, { snapshot, pageId })
    await context.close()
    return result.svg
  } finally {
    await browser.close()
  }
}

function parseRequest(value) {
  if (!isObject(value) || value.contractVersion !== '1' || value.action !== 'canvas.export' || value.actionVersion !== '1.0.0') {
    throw new Error('EXPORT_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  if (!isObject(value.payload)) throw new Error('EXPORT_INPUT_INVALID: payload is required.')
  for (const key of ['title', 'pageId', 'pageName', 'emptyLabel']) {
    if (typeof value.payload[key] !== 'string' || !value.payload[key].trim()) {
      throw new Error(`EXPORT_INPUT_INVALID: payload.${key} is required.`)
    }
  }
  if (!Number.isSafeInteger(value.payload.revision) || value.payload.revision < 0) {
    throw new Error('EXPORT_INPUT_INVALID: payload.revision must be a non-negative integer.')
  }
  return value
}

function parseSnapshot(value) {
  if (!isObject(value) || !isObject(value.store) || !('schema' in value)) {
    throw new Error('EXPORT_INPUT_INVALID: Canvas snapshot must contain schema and store.')
  }
  return value
}

function pageHasShapes(store, pageId) {
  const reachesPage = (record, visited = new Set()) => {
    const parentId = typeof record?.parentId === 'string' ? record.parentId : ''
    if (!parentId || visited.has(parentId)) return false
    if (parentId === pageId) return true
    visited.add(parentId)
    return reachesPage(store[parentId], visited)
  }
  return Object.values(store).some((record) => isObject(record) && record.typeName === 'shape' && reachesPage(record))
}

function emptyPageSvg(label) {
  const text = escapeXml(label.slice(0, 300))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f8fafc"/><text x="480" y="270" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24">${text}</text></svg>`
}

function validateSvg(svg) {
  if (Buffer.byteLength(svg, 'utf8') > 36 * 1024 * 1024 || !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new Error('EXPORT_OUTPUT_INVALID: Canvas SVG is invalid or exceeds 36 MiB.')
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`EXPORT_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}

function classify(message) {
  const normalized = message.toUpperCase()
  if (normalized.includes('EXPORT_OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('EXPORT_INPUT_INVALID')) return 'EXPORT_INPUT_INVALID'
  if (normalized.includes('EXPORT_TIMEOUT') || normalized.includes('TIMEOUT')) return 'EXPORT_TIMEOUT'
  if (normalized.includes('BROWSER') || normalized.includes('CHROMIUM') || normalized.includes('PLAYWRIGHT')) return 'BROWSER_LAUNCH_FAILED'
  if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM')) return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character)
}

function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }
