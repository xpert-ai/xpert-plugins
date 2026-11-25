const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const { installArtifactDocumentFramePolicy } = require('@xpert-ai/plugin-sdk/artifact-document')
const { DASHBOARD_DOWNLOAD_POLICY } = require('../dist/lib/dashboard-download-policy.js')
const { mountDashboardDocument } = require('../dist/lib/document-host.js')

test('both dashboard frames and the mounted HTML document use the declared download policy', (t) => {
  const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://dashboard.test' })
  global.window = dom.window
  global.document = dom.window.document
  t.after(() => { dom.window.close(); delete global.window; delete global.document })
  const loader = require('ts-node').register({
    skipProject: true, transpileOnly: true,
    compilerOptions: { module: 'CommonJS', target: 'ES2022', jsx: 'react', esModuleInterop: true }
  })
  t.after(() => loader.enabled(false))
  const { HtmlDashboard } = require('../src/remote/html-dashboard.tsx')
  const { StandardDashboard } = require('../src/remote/standard-dashboard.tsx')
  const expected = DASHBOARD_DOWNLOAD_POLICY.allowDownloads ? 'allow-scripts allow-downloads' : 'allow-scripts'
  const doc = dom.window.document
  for (const component of [HtmlDashboard, StandardDashboard]) {
    doc.body.innerHTML = renderToStaticMarkup(React.createElement(component, { manifest: { title: 'Report' } }))
    assert.equal(doc.querySelector('iframe').getAttribute('sandbox'), expected)
  }
  installArtifactDocumentFramePolicy(doc)
  const frame = doc.createElement('iframe')
  doc.body.append(frame)
  const host = mountDashboardDocument(frame, {
    html: '<html><body>Report</body></html>',
    context: { bindingIds: [], defaults: {}, theme: 'light', locale: 'en' },
    query: async () => null
  })
  try { assert.equal(frame.getAttribute('sandbox'), expected) }
  finally { host.dispose() }
})
