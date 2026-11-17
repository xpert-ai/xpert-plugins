const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const ts = require('typescript')
const { dashboardSchema, dashboardChangesSchema } = require('../dist/lib/dashboard.schema')
const { setup } = require('./service-fixture.cjs')
const example = require('../examples/postgres-sales.json')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')

test('theme selection is optional for old manifests and rejects unknown values', () => {
  assert.deepEqual(dashboardSchema.parse(example), example)
  for (const visualTheme of ['system', 'slate', 'contrast']) {
    assert.equal(dashboardSchema.parse({ ...example, visualTheme }).visualTheme, visualTheme)
    assert.deepEqual(dashboardChangesSchema.parse({ visualTheme }), { visualTheme })
  }
  assert.throws(() => dashboardSchema.parse({ ...example, visualTheme: 'custom' }))
  assert.throws(() => dashboardChangesSchema.parse({ visualTheme: 'custom' }))
})

test('saving a theme preserves the dataset bindings and original manifest', async () => {
  const f = setup()
  const original = structuredClone(example)
  const saved = await f.service.save(f.context, { ...example, visualTheme: 'contrast' }, null, 0)
  const opened = await f.service.open(f.context, saved.artifactId)
  assert.equal(opened.manifest.visualTheme, 'contrast')
  assert.deepEqual(opened.manifest.bindings, original.bindings)
  assert.deepEqual(example, original)
})

test('standard theme uses current host tokens and leaves absent values to the renderer', () => {
  const values = { '--background': '#ffffff', '--card': '#f8fafc', '--muted': '#e2e8f0', '--foreground': '#0f172a', '--border': '#cbd5e1', '--font-sans': 'system-ui' }
  const api = {}
  vm.runInNewContext(ts.transpileModule(readFileSync(require.resolve('../src/remote/dashboard-theme.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports: api, document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: key => values[key] ?? '' }) })
  assert.match(api.standardThemeStyle(undefined), /data-dashboard-theme="system"/)
  assert.match(api.standardThemeStyle('system'), /--color-background-secondary:#f8fafc/)
  assert.match(api.standardThemeStyle('slate'), /--color-background-secondary:#e2e8f0/)
  assert.match(api.standardThemeStyle('contrast'), /--color-border-primary:#0f172a/)
  assert.ok(!api.standardThemeStyle('system').includes('--color-ring:'))
  assert.match(api.standardThemeStyle('contrast'), /--ds-table-row-text:#0f172a/)
  values['--background'] = '#09090b'
  assert.match(api.standardThemeStyle('system'), /--color-background-primary:#09090b/)
  values['--font-sans'] = '</style><script>alert(1)</script>'
  assert.equal((api.standardThemeStyle('system').match(/<\/style>/g) ?? []).length, 1)
  assert.ok(!api.standardThemeStyle('system').includes('<script>'))
})

test('theme injection preserves inline scripts containing head tag text and inserts after renderer styles', () => {
  const dom = new JSDOM(''), api = {}
  try {
    vm.runInNewContext(ts.transpileModule(readFileSync(require.resolve('../src/remote/dashboard-theme.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports: api, document: dom.window.document, DOMParser: dom.window.DOMParser,
      getComputedStyle: () => ({ getPropertyValue: () => '' }) })
    const script = 'window.example = "</head>";'
    const input = `<!doctype html><html><head><script>${script}</script><style>:root{color:red}</style></head><body><p>Data</p></body></html>`
    const output = api.standardDashboardDocument(input, '<script data-inspector>window.inspector = true;</script>', 'system')
    const parsed = new dom.window.DOMParser().parseFromString(output, 'text/html')
    assert.equal(parsed.head.firstElementChild.getAttribute('data-inspector'), '')
    assert.equal(parsed.head.querySelector('script:not([data-inspector])').textContent, script)
    assert.equal(parsed.head.lastElementChild.getAttribute('data-dashboard-theme'), 'system')
    assert.equal(parsed.documentElement.dataset.theme, 'light')
    assert.equal(parsed.querySelectorAll('[data-dashboard-theme]').length, 1)
    assert.equal(parsed.body.textContent, 'Data')
    assert.ok(output.startsWith('<!doctype html>'))
    dom.window.document.documentElement.classList.add('dark')
    const dark = new dom.window.DOMParser().parseFromString(api.standardDashboardDocument(input, '', 'system'), 'text/html')
    assert.equal(dark.documentElement.dataset.theme, 'dark')
  } finally { dom.window.close() }
})
