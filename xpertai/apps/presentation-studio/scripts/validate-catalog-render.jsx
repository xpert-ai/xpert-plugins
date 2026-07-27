#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const APP_ROOT = path.resolve(import.meta.dirname, '..')
const UPSTREAM_PROJECT = path.join(APP_ROOT, 'assets/upstream/dashiai-ppt/project')
const shouldUseBrowser = process.argv.includes('--browser')

process.env.DASHI_PPT_THEME_RUNTIME = 'prebuilt'

const { composeDeck } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/deckComposer.jsx')).href)
const { THEME_PAGES } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/components/themes/index.jsx')).href)
const { normalizeSlidePropsForLayout } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/propContracts.jsx')).href)
const { renderDeck } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/renderDeck.jsx')).href)

const pagesByTheme = THEME_PAGES.reduce((groups, page) => {
  const pages = groups.get(page.themeKey) ?? []
  pages.push(page)
  groups.set(page.themeKey, pages)
  return groups
}, new Map())
assert.equal(pagesByTheme.size, 14, 'catalog must contain exactly 14 themes')
assert.equal(THEME_PAGES.length, 1188, 'catalog must contain exactly 1188 layouts')

const contractErrors = THEME_PAGES.flatMap((page) => {
  try {
    normalizeSlidePropsForLayout(page.key, {})
    return []
  } catch (error) {
    return [`${page.key}: ${error instanceof Error ? error.message : String(error)}`]
  }
})
assert.deepEqual(contractErrors, [], `catalog default contract errors:\n${contractErrors.join('\n')}`)

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'presentation-catalog-'))
let browser
let server

try {
  for (const [themePack, pages] of pagesByTheme) {
    const outFile = path.join(outputRoot, themePack, 'index.html')
    const deck = composeDeck({
      title: `Presentation Studio catalog · ${themePack}`,
      themePack,
      slides: pages.map((page, index) => ({
        id: `${themePack}-${String(index + 1).padStart(3, '0')}`,
        layout: page.key,
        props: {},
      })),
    })

    renderDeck(deck, { outFile })
    const html = fs.readFileSync(outFile, 'utf8')
    const renderedSlideCount = html.match(/<section\b[^>]*class="[^"]*\bslide\b/g)?.length ?? 0
    assert.equal(renderedSlideCount, pages.length, `${themePack} rendered slide count`)
    assert.ok(
      fs.existsSync(path.join(outputRoot, themePack, 'assets/imported-theme-runtime.js')),
      `${themePack} runtime bundle is missing`,
    )
    for (const page of pages) {
      assert.ok(html.includes(`data-page-key="${page.key}"`), `${page.key} did not render`)
    }
  }

  if (shouldUseBrowser) {
    const executablePath = resolveChromiumExecutable()
    assert.ok(executablePath, 'Chromium was requested but no executable was found')
    const listening = await startStaticServer(outputRoot)
    server = listening.server
    browser = await chromium.launch({ executablePath, headless: true })

    for (const [themePack, pages] of pagesByTheme) {
      const pageErrors = []
      const failedLocalRequests = []
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('requestfailed', (request) => {
        if (request.url().startsWith(listening.origin)) {
          failedLocalRequests.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
        }
      })
      await page.goto(`${listening.origin}/${themePack}/index.html`, { waitUntil: 'load' })
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      const renderedSlideCount = await page.locator('#deck > section.slide[data-vm-slide-id]').count()
      assert.equal(renderedSlideCount, pages.length, `${themePack} browser slide count`)
      assert.deepEqual(pageErrors, [], `${themePack} browser runtime errors:\n${pageErrors.join('\n')}`)
      assert.deepEqual(
        failedLocalRequests,
        [],
        `${themePack} missing local resources:\n${failedLocalRequests.join('\n')}`,
      )
      await page.close()
    }
  }

  console.log(
    `Catalog render verified: ${pagesByTheme.size} themes, ${THEME_PAGES.length} layouts${shouldUseBrowser ? ', browser runtime clean' : ''}.`,
  )
} finally {
  await browser?.close()
  await closeServer(server)
  fs.rmSync(outputRoot, { recursive: true, force: true })
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const staticServer = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
      const requested = path.resolve(root, `.${pathname}`)
      if (!requested.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
        response.writeHead(404).end()
        return
      }
      response.setHeader('content-type', contentType(requested))
      fs.createReadStream(requested).pipe(response)
    })
    staticServer.once('error', reject)
    staticServer.listen(0, '127.0.0.1', () => {
      const address = staticServer.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Could not resolve catalog test server address'))
        return
      }
      resolve({ server: staticServer, origin: `http://127.0.0.1:${address.port}` })
    })
  })
}

function closeServer(staticServer) {
  if (!staticServer) return Promise.resolve()
  return new Promise((resolve, reject) => {
    staticServer.close((error) => (error ? reject(error) : resolve()))
  })
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase()
  return {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }[extension] ?? 'application/octet-stream'
}
