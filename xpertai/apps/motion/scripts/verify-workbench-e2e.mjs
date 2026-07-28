import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createProductIntroHyperframesComposition,
  XPERT_AI_PRODUCT_INTRO
} from '../dist/lib/hyperframes-product-intro.js'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const playwrightRequire = createRequire(new URL('../../cut/package.json', import.meta.url))
const { chromium } = playwrightRequire('playwright')
const reactRoot = dirname(require.resolve('react/package.json'))
const reactDomRoot = dirname(require.resolve('react-dom/package.json'))
const initialComposition = createProductIntroHyperframesComposition(XPERT_AI_PRODUCT_INTRO)
const files = {
  '/react.js': join(reactRoot, 'umd/react.production.min.js'),
  '/react-dom.js': join(reactDomRoot, 'umd/react-dom.production.min.js'),
  '/app.js': join(packageRoot, 'src/lib/remote-components/motion-workbench/app.js'),
  '/app.css': join(packageRoot, 'src/lib/remote-components/motion-workbench/app.css')
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(hostHtml(initialComposition))
    return
  }
  if (url.pathname === '/favicon.ico') {
    response.statusCode = 204
    response.end()
    return
  }
  const filePath = files[url.pathname]
  if (!filePath) {
    response.statusCode = 404
    response.end('not found')
    return
  }
  response.setHeader('content-type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript')
  response.end(await readFile(filePath))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Motion E2E server did not bind a TCP port.')
const url = `http://127.0.0.1:${address.port}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => errors.push(`page: ${error.message}`))

try {
  await page.goto(url, { waitUntil: 'load' })
  const frame = page.frameLocator('#motion-frame')
  await frame.locator('.motion-shell').waitFor({ timeout: 20_000 })

  await frame.locator('.motion-header-view-select').click()
  await frame.getByRole('option', { name: 'Video Composer' }).click()
  await frame.getByText('SDK document valid', { exact: true }).waitFor({ timeout: 20_000 })
  await frame.locator('.hyperframes-scene-list button').first().waitFor({ timeout: 20_000 })
  const sceneCount = await frame.locator('.hyperframes-scene-list button').count()
  if (sceneCount !== 6) throw new Error(`Hyperframes storyboard exposed ${sceneCount} scenes instead of six.`)

  const playerLocator = frame.locator('hyperframes-player')
  await page.waitForTimeout(1_500)
  const playerDiagnostics = await playerLocator.evaluate((player) => ({
    ready: player.ready,
    runtimeScriptBytes: player.iframeElement?.contentDocument?.querySelector('[data-motion-hyperframes-runtime]')?.textContent?.length ?? 0,
    runtimeBootstrapped: player.iframeElement?.contentWindow?.__hyperframeRuntimeBootstrapped === true,
    hasRuntime: Boolean(player.iframeElement?.contentWindow?.__hf),
    hasPlayer: Boolean(player.iframeElement?.contentWindow?.__player),
    timelineCount: Object.keys(player.iframeElement?.contentWindow?.__timelines || {}).length
  }))
  if (!playerDiagnostics.runtimeScriptBytes || !playerDiagnostics.runtimeBootstrapped) {
    throw new Error(`Bundled Hyperframes runtime did not bootstrap: ${JSON.stringify(playerDiagnostics)}\n${errors.join('\n')}`)
  }
  const playerState = await playerLocator.evaluate(async (player) => {
    if (!player.ready) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Hyperframes Player ready event timed out.')), 15_000)
        player.addEventListener('ready', () => {
          clearTimeout(timeout)
          resolve()
        }, { once: true })
        player.addEventListener('error', (event) => {
          clearTimeout(timeout)
          reject(new Error(event.detail?.message || 'Hyperframes Player failed.'))
        }, { once: true })
      })
    }
    player.seek(2.7)
    return {
      ready: player.ready,
      duration: player.duration,
      currentTime: player.currentTime,
      audioLocked: player.audioLocked,
      iframeHasComposition: Boolean(player.iframeElement?.contentDocument?.querySelector('[data-composition-id="main"]'))
    }
  })
  if (
    !playerState.ready
    || Math.abs(playerState.duration - 36) > 0.01
    || Math.abs(playerState.currentTime - 2.7) > 0.01
    || !playerState.audioLocked
    || !playerState.iframeHasComposition
  ) {
    throw new Error(`Hyperframes Player state is invalid: ${JSON.stringify(playerState)}`)
  }

  const elementList = frame.locator('.hyperframes-element-list')
  await elementList.getByRole('button', { name: /Xpert AI/ }).click()
  const inspector = frame.locator('.hyperframes-inspector')
  await inspector.getByLabel('Element text').fill('Xpert AI — Agentic systems at work')
  await inspector.getByLabel('Start (seconds)').fill('0.75')
  await inspector.getByLabel('Duration (seconds)').fill('4.2')
  await inspector.getByLabel('X position').fill('24')
  await inspector.getByLabel('Opacity').fill('0.95')
  await inspector.getByRole('button', { name: 'Apply element changes' }).click()
  await inspector.locator('strong').filter({ hasText: 'Agentic systems at work' }).waitFor()
  await frame.getByText('Unsaved', { exact: true }).waitFor()

  await frame.getByRole('button', { name: 'Save', exact: true }).click()
  await frame.getByText('Unsaved', { exact: true }).waitFor({ state: 'detached' })
  await page.waitForFunction(() => window.__motionHost.saveRequests === 1)
  const savedState = await page.evaluate(() => ({
    saveRequests: window.__motionHost.saveRequests,
    savedHtml: window.__motionHost.html,
    workingCopyRevision: window.__motionHost.item.workingCopyRevision
  }))
  if (!savedState.savedHtml.includes('Xpert AI — Agentic systems at work') || savedState.workingCopyRevision !== 2) {
    throw new Error(`Structured Hyperframes save did not persist: ${JSON.stringify(savedState)}`)
  }
  if (process.env.MOTION_E2E_SCREENSHOT) {
    await page.screenshot({ path: process.env.MOTION_E2E_SCREENSHOT, fullPage: true })
  }

  await frame.getByRole('button', { name: 'Queue MP4 render' }).click()
  await page.waitForFunction(() => window.__motionHost.renderRequests.length === 1)
  await frame.getByRole('heading', { name: 'Export history' }).waitFor()
  await frame.getByText(/queued · hyperframes · 0%/).waitFor()
  const renderRequest = await page.evaluate(() => window.__motionHost.renderRequests[0])
  if (renderRequest.quality !== 'standard' || renderRequest.fps !== 30 || renderRequest.expectedChecksum !== 'e2e-checksum-2') {
    throw new Error(`Production render request was not checksum-bound: ${JSON.stringify(renderRequest)}`)
  }
  await frame.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click()

  await frame.getByRole('button', { name: 'Version history', exact: true }).click()
  await frame.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.waitForFunction(() => window.__motionHost.restoreRequests === 1)
  await inspector.getByLabel('Element text').evaluate(async (input) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (input.value === 'Xpert AI') return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`Restored element text did not reload: ${input.value}`)
  })

  if (errors.length) throw new Error(`Motion Workbench browser errors:\n${errors.join('\n')}`)

  console.log(JSON.stringify({
    workbenchReady: true,
    storyboardScenes: sceneCount,
    player: playerState,
    structuredSave: true,
    productionRenderQueued: true,
    versionRestore: true
  }))
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

function hostHtml(compositionHtml) {
  const serializedHtml = JSON.stringify(compositionHtml).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Motion Workbench E2E Host</title>
  <style>html,body,#motion-frame{width:100%;height:100%;margin:0;border:0;background:#070b16}</style>
</head>
<body>
  <iframe id="motion-frame"></iframe>
  <script>
    const channel = 'xpertai.remote_component'
    const instanceId = 'motion-e2e'
    const initialHtml = ${serializedHtml}
    const state = {
      html: initialHtml,
      saveRequests: 0,
      restoreRequests: 0,
      renderRequests: [],
      item: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Xpert AI Product Introduction',
        brief: 'A complete Xpert AI product overview.',
        surface: 'video',
        videoEngine: 'hyperframes',
        status: 'draft',
        selectedRecipeIds: [],
        currentVersionNumber: 1,
        workingCopyRevision: 1,
        artifactChecksum: 'e2e-checksum-1'
      },
      versions: [{
        id: '22222222-2222-4222-8222-222222222222',
        versionNumber: 1,
        sourceType: 'manual',
        surface: 'video',
        videoEngine: 'hyperframes',
        artifactChecksum: 'e2e-checksum-1',
        changeSummary: 'Original Xpert AI product film'
      }],
      exports: []
    }
    window.__motionHost = state
    const frame = document.getElementById('motion-frame')
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/react.js"><\\/script><script src="/react-dom.js"><\\/script><script src="/app.js"><\\/script></body></html>'

    function detail() {
      return {
        item: { ...state.item },
        workingCopy: {
          videoEngine: 'hyperframes',
          hyperframesHtml: state.html,
          workingCopyRevision: state.item.workingCopyRevision,
          artifactChecksum: state.item.artifactChecksum
        },
        currentVersion: state.versions[0],
        versions: structuredClone(state.versions),
        exports: structuredClone(state.exports),
        logs: []
      }
    }
    function viewData() {
      return {
        projects: { items: [{ ...state.item }], total: 1, page: 1, pageSize: 20 },
        recipes: { items: [], total: 0, page: 1, pageSize: 36 },
        styles: [],
        detail: detail(),
        libraryStats: {},
        renderCapability: {
          available: true,
          backend: 'sandbox-job',
          action: 'motion.hyperframes-render',
          actionVersion: '1.0.0',
          runtimeProfile: 'browser/video-playwright-1.61/v1',
          workerCount: 1
        }
      }
    }
    function reply(message, payload) {
      frame.contentWindow.postMessage({
        channel,
        protocolVersion: 1,
        instanceId,
        type: 'response',
        requestId: message.requestId,
        payload
      }, '*')
    }
    window.addEventListener('message', (event) => {
      const message = event.data
      if (!message || message.channel !== channel) return
      if (message.type === 'ready') {
        frame.contentWindow.postMessage({
          channel,
          protocolVersion: 1,
          instanceId,
          type: 'init',
          locale: 'en_US',
          initialQuery: { selectionId: state.item.id }
        }, '*')
        return
      }
      if (message.type === 'requestData') {
        reply(message, viewData())
        return
      }
      if (message.type === 'notify') return
      if (message.type !== 'executeAction') return

      if (message.actionKey === 'save_hyperframes_composition') {
        state.saveRequests += 1
        state.html = message.input.html
        state.item.workingCopyRevision += 1
        state.item.artifactChecksum = 'e2e-checksum-' + state.item.workingCopyRevision
        reply(message, { project: { ...state.item } })
        return
      }
      if (message.actionKey === 'render_production') {
        state.renderRequests.push(structuredClone(message.input))
        state.exports = [{
          id: '33333333-3333-4333-8333-333333333333',
          kind: 'mp4',
          status: 'queued',
          backend: 'hyperframes',
          progress: 0,
          stage: 'queued',
          inputChecksum: message.input.expectedChecksum,
          jobId: '44444444-4444-4444-8444-444444444444'
        }]
        reply(message, { success: true, export: state.exports[0] })
        return
      }
      if (message.actionKey === 'restore_version') {
        state.restoreRequests += 1
        state.html = initialHtml
        state.item.workingCopyRevision += 1
        state.item.artifactChecksum = 'e2e-checksum-' + state.item.workingCopyRevision
        reply(message, detail())
        return
      }
      if (message.actionKey === 'finalize_version') {
        reply(message, detail())
        return
      }
      reply(message, detail())
    })
  <\/script>
</body>
</html>`
}
