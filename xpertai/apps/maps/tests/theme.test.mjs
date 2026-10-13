import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

// Exercise the maintained bridge and the real shared theme installer without
// adding a DOM package. Computed colors/layout are covered by browser smoke.
const bundle = await build({
  entryPoints: [new URL('../ui/theme.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'MapsThemeModule',
  platform: 'browser',
  target: 'es2022'
})
const transportBundle = await build({
  entryPoints: [new URL('../ui/transports/mcp.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'MapsMcpModule',
  platform: 'browser',
  target: 'es2022'
})

function themeFixture(initialProperties = {}) {
  const properties = new Map(Object.entries(initialProperties))
  const classes = new Set()
  const children = []
  const root = {
    dataset: {},
    style: {
      setProperty(name, value) { properties.set(name, value) },
      getPropertyValue(name) { return properties.get(name) ?? '' },
      removeProperty(name) { const previous = properties.get(name) ?? ''; properties.delete(name); return previous }
    },
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name) },
      contains(name) { return classes.has(name) }
    },
    setAttribute(name, value) { if (name === 'data-theme') this.dataset.theme = value },
    removeAttribute(name) { if (name === 'data-xui-density') delete this.dataset.xuiDensity }
  }
  const document = {
    documentElement: root,
    head: { appendChild(node) { children.push(node); return node } },
    getElementById(id) { return children.find(node => node.id === id) ?? null },
    createElement(tagName) {
      assert.equal(tagName, 'style')
      const node = { id: '', textContent: '', remove() { const index = children.indexOf(node); if (index >= 0) children.splice(index, 1) } }
      return node
    }
  }
  const context = { document, getComputedStyle: element => element.style }
  context.window = context
  runInNewContext(bundle.outputFiles[0].text, context)
  return { bridge: context.MapsThemeModule, root, properties, children, document }
}

test('Workbench accepts public token names and CSS token names, including zero radius and custom typography', () => {
  const { bridge, root } = themeFixture()
  const theme = {
    scheme: 'light',
    tokens: {
      colorBorder: ' #123456 ', colorInput: '#234567', colorRing: '#345678',
      colorPrimary: '#456789', colorPrimaryForeground: '#ffffff',
      fontFamily: '"Host Sans", sans-serif', densityRootFontSize: '18px',
      fontSizeSm: '0.8rem', fontSizeControl: '15px', radiusSm: '0px', radiusMd: '0px', radiusLg: '0px',
      '--xui-color-background': '#fdf5e6', '--xui-color-foreground': '#1f2937',
      unrelated: 'ignored', '--not-a-host-token': 'ignored', colorMuted: '  '
    }
  }
  const normalized = bridge.normalizeWorkbenchTheme(theme.tokens)
  assert.equal(normalized['--xui-color-border'], '#123456')
  assert.equal(normalized['--xui-color-background'], '#fdf5e6')
  assert.equal(normalized['--xui-radius-md'], '0px')
  assert.equal(normalized['--xui-font-family'], '"Host Sans", sans-serif')
  assert.equal(normalized['--xui-density-root-font-size'], '18px')
  assert.equal(normalized['--xui-font-size-control'], '15px')
  assert.equal(normalized['--xui-color-muted'], undefined)
  assert.equal(normalized.unrelated, undefined)
  assert.equal(normalized['--not-a-host-token'], undefined)
  bridge.installMapsTheme(theme)
  assert.equal(root.style.getPropertyValue('--xui-radius-md'), '0px')
  assert.equal(root.style.getPropertyValue('--xui-color-input'), '#234567')
  assert.equal(root.style.getPropertyValue('--xui-color-ring'), '#345678')
})

test('standard MCP variables reach the shared semantic bridge ahead of legacy fallback values', () => {
  const { bridge, root } = themeFixture({ '--mcp-app-color-border': '#eeeeee', '--mcp-app-color-input': '#eeeeee', '--mcp-app-radius': '8px' })
  const variables = {
    '--color-background-primary': '#102030', '--color-text-primary': '#fafafa',
    '--color-background-secondary': '#203040', '--color-background-tertiary': '#304050',
    '--color-background-inverse': '#bada55', '--color-text-inverse': '#102030',
    '--color-border-primary': '#607080', '--color-ring-primary': '#c0ffee',
    '--font-sans': '"MCP Host", serif', '--font-text-md-size': '18px',
    '--font-text-sm-size': '15px', '--border-radius-md': '20px',
    '--color-text-secondary': '   ', '--color-text-warning': undefined
  }
  const normalized = bridge.normalizeMcpTheme(variables)
  assert.equal(normalized['--xui-color-border'], '#607080')
  assert.equal(normalized['--xui-color-primary'], '#bada55')
  assert.equal(normalized['--xui-color-muted'], '#304050')
  assert.equal(normalized['--xui-color-muted-foreground'], undefined)
  assert.equal(normalized['--xui-color-warning'], undefined)
  bridge.installMapsTheme({ source: 'mcp', scheme: 'dark', styles: { variables } })
  assert.equal(root.dataset.mapsThemeSource, 'mcp')
  assert.equal(root.style.getPropertyValue('--color-border-primary'), '#607080')
  assert.equal(root.style.getPropertyValue('--xui-color-border'), '#607080')
  assert.equal(root.style.getPropertyValue('--xui-color-input'), '#607080')
  assert.equal(root.style.getPropertyValue('--xui-color-card-foreground'), '#fafafa')
  assert.equal(root.style.getPropertyValue('--xui-color-popover'), '#203040')
  assert.equal(root.style.getPropertyValue('--xui-color-secondary'), '#304050')
  assert.equal(root.style.getPropertyValue('--xui-color-accent-foreground'), '#fafafa')
  assert.equal(root.style.getPropertyValue('--xui-color-ring'), '#c0ffee')
  assert.equal(root.style.getPropertyValue('--xui-font-family'), '"MCP Host", serif')
  assert.equal(root.style.getPropertyValue('--xui-density-root-font-size'), '18px')
  assert.equal(root.style.getPropertyValue('--xui-radius-md'), '20px')
  // Public host fallbacks remain host-owned and are available when omitted by
  // a standards-only host; the adapter must not erase their injected styles.
  assert.equal(root.style.getPropertyValue('--mcp-app-color-border'), '#eeeeee')
  bridge.installMapsTheme({ source: 'mcp', scheme: 'light', styles: { variables: { '--color-border-primary': '#abcdef', '--color-text-primary': '#123456' } } })
  assert.equal(root.style.getPropertyValue('--xui-color-input'), '#abcdef')
  assert.equal(root.style.getPropertyValue('--xui-color-card-foreground'), '#123456')
  assert.equal(root.style.getPropertyValue('--xui-color-secondary'), '')
  assert.equal(root.style.getPropertyValue('--mcp-app-color-input'), '#eeeeee')
})

test('theme installation responds to light/dark and density changes without duplicating shared styles', () => {
  const { bridge, root, children, document } = themeFixture()
  bridge.installMapsTheme({ scheme: 'dark', density: 'compact', tokens: { '--xui-color-border': '#456789' } })
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(root.classList.contains('dark'), true)
  assert.equal(root.style.colorScheme, 'dark')
  assert.equal(root.dataset.xuiDensity, 'compact')
  assert.equal(root.style.getPropertyValue('--xui-color-border'), '#456789')
  const semanticStyle = document.getElementById('xpert-shadcn-ui-theme-vars')
  assert.ok(semanticStyle)
  assert.match(semanticStyle.textContent, /--border:\s*var\(--xui-color-border/)
  assert.match(semanticStyle.textContent, /--input:\s*var\(--xui-color-input/)
  assert.match(semanticStyle.textContent, /--ring:\s*var\(--xui-color-ring/)
  bridge.installMapsTheme({ scheme: 'light', density: 'default', tokens: { '--xui-color-border': '#e1e4e8' } })
  assert.equal(root.dataset.theme, 'light')
  assert.equal(root.classList.contains('dark'), false)
  assert.equal(root.style.colorScheme, 'light')
  assert.notEqual(root.dataset.xuiDensity, 'compact')
  assert.equal(root.style.getPropertyValue('--xui-color-border'), '#e1e4e8')
  assert.equal(document.getElementById('xpert-shadcn-ui-theme-vars'), semanticStyle)
  assert.equal(children.filter(node => node.id === 'xpert-shadcn-ui-theme-vars').length, 1)
})

test('replacing a theme removes withdrawn token overrides and preserves unrelated document properties', () => {
  const { bridge, root } = themeFixture({ '--maps-scene-camera': 'preserved' })
  bridge.installMapsTheme({ scheme: 'dark', tokens: { '--xui-color-muted': '#203040', '--xui-color-border': '#456789', '--xui-font-family': 'Host Sans', '--xui-radius-md': '18px' } })
  bridge.installMapsTheme({ scheme: 'light', tokens: { '--xui-color-border': '#dce1e7' } })
  assert.equal(root.style.getPropertyValue('--xui-color-border'), '#dce1e7')
  assert.equal(root.style.getPropertyValue('--xui-color-muted'), '')
  assert.equal(root.style.getPropertyValue('--xui-font-family'), '')
  assert.equal(root.style.getPropertyValue('--xui-radius-md'), '')
  assert.equal(root.style.getPropertyValue('--maps-scene-camera'), 'preserved')
})

test('MCP variable snapshots withdraw stale colors and fonts across runtime changes', () => {
  const { bridge, root, document, children } = themeFixture()
  const firstFonts = '@font-face { font-family: "First Host"; src: local("Arial"); }'
  const secondFonts = '@font-face { font-family: "Second Host"; src: local("Georgia"); }'
  bridge.installMapsTheme({ source: 'mcp', scheme: 'dark', styles: { variables: { '--font-sans': 'First Host', '--color-border-primary': '#111111', '--color-text-secondary': '#aaaaaa' }, css: { fonts: firstFonts } } })
  const fonts = document.getElementById('maps-host-fonts')
  assert.ok(fonts)
  assert.equal(fonts.textContent, firstFonts)
  bridge.installMapsTheme({ source: 'mcp', scheme: 'light', styles: { variables: { '--font-sans': 'Second Host', '--color-border-primary': '#eeeeee' }, css: { fonts: secondFonts } } })
  assert.equal(document.getElementById('maps-host-fonts'), fonts)
  assert.equal(fonts.textContent, secondFonts)
  assert.equal(children.filter(node => node.id === 'maps-host-fonts').length, 1)
  assert.equal(root.style.getPropertyValue('--font-sans'), 'Second Host')
  assert.equal(root.style.getPropertyValue('--xui-font-family'), 'Second Host')
  assert.equal(root.style.getPropertyValue('--color-text-secondary'), '')
  assert.equal(root.style.getPropertyValue('--xui-color-muted-foreground'), '')
  bridge.installMapsTheme({ source: 'mcp', scheme: 'light', styles: {} })
  assert.equal(document.getElementById('maps-host-fonts'), null)
  assert.equal(root.style.getPropertyValue('--font-sans'), '')
  assert.equal(root.style.getPropertyValue('--xui-font-family'), '')
  assert.equal(root.style.getPropertyValue('--xui-color-border'), '')
})

test('real MCP SDK preserves theme on partial size notifications and replaces a changed styles snapshot', { timeout: 3000 }, async () => {
  const { bridge, root, document } = themeFixture()
  const listeners = new Set(), sent = [], contexts = []
  let onContext
  const hostContext = {
    theme: 'dark', locale: 'zh-CN',
    styles: { variables: { '--color-border-primary': '#123456', '--font-sans': 'Host Sans' }, css: { fonts: '@font-face { font-family: "Host Sans"; src: local("Arial"); }' } },
    containerDimensions: { width: 800, height: 720 }
  }
  const deliver = data => { for (const listener of listeners) listener({ source: parent, data }) }
  const parent = {
    postMessage(message) {
      sent.push(message)
      if (message.method === 'ui/initialize') queueMicrotask(() => deliver({
        jsonrpc: '2.0', id: message.id,
        result: { protocolVersion: message.params.protocolVersion, hostInfo: { name: 'Maps theme test host', version: '1.0.0' }, hostCapabilities: { serverTools: {} }, hostContext }
      }))
    }
  }
  const window = {
    parent,
    addEventListener(type, listener) { assert.equal(type, 'message'); listeners.add(listener) },
    removeEventListener(type, listener) { assert.equal(type, 'message'); listeners.delete(listener) }
  }
  const context = { window, console: { debug() {}, warn() {}, error() {} }, setTimeout, clearTimeout, queueMicrotask, Event, EventTarget, CustomEvent, AbortController, AbortSignal, DOMException, URL }
  runInNewContext(transportBundle.outputFiles[0].text, context)
  const transport = context.MapsMcpModule.createMcpTransport()
  const notifyContext = async params => {
    const updated = new Promise(resolve => { onContext = resolve })
    deliver({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params })
    return updated
  }
  try {
    await transport.connect({
      onContext(value) { contexts.push(value); bridge.installMapsTheme(value.theme); onContext?.(value); onContext = undefined },
      onResult() { assert.fail('A theme notification must not deliver a map result') },
      onService() { assert.fail('A theme notification must not change the service') },
      onError() { assert.fail('Theme notification was rejected') },
      onReset() { assert.fail('A theme notification must not reset map state') }
    })
    assert.equal(root.style.getPropertyValue('--xui-color-border'), '#123456')
    const fonts = document.getElementById('maps-host-fonts')
    const resized = await notifyContext({ containerDimensions: { width: 600, height: 480 } })
    assert.equal(resized.locale, 'zh-CN')
    assert.equal(resized.theme.scheme, 'dark')
    assert.equal(resized.theme.styles.variables['--color-border-primary'], '#123456')
    assert.equal(root.style.getPropertyValue('--xui-font-family'), 'Host Sans')
    assert.equal(document.getElementById('maps-host-fonts'), fonts)
    await notifyContext({ theme: 'light', styles: { variables: { '--color-border-primary': '#abcdef' } } })
    assert.equal(root.dataset.theme, 'light')
    assert.equal(root.style.getPropertyValue('--xui-color-border'), '#abcdef')
    assert.equal(root.style.getPropertyValue('--font-sans'), '')
    assert.equal(root.style.getPropertyValue('--xui-font-family'), '')
    assert.equal(document.getElementById('maps-host-fonts'), null)
    assert.equal(contexts.length, 3)
    assert.equal(sent.filter(message => message.method === 'tools/call').length, 0)
  } finally { transport.dispose() }
})
