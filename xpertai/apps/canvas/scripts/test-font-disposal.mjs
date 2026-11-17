import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { FontManager } = createRequire(require.resolve('tldraw'))('@tldraw/editor')

// Regression for the pinned tldraw 5.1.1 patch: a load can settle after the editor is destroyed.
for (const outcome of ['loaded', 'failed']) test(`font ${outcome} after disposal never updates a removed state`, async () => {
  let resolve, reject
  const pending = new Promise((yes, no) => { resolve = yes; reject = no })
  const original = globalThis.FontFace
  globalThis.FontFace = class {
    constructor(family) { this.family = family }
    load() { return pending }
  }
  try {
    const fonts = new Set(), editor = { isDisposed: false, getContainerDocument: () => ({ fonts }),
      store: { createComputedCache: () => ({}), createCache: () => ({}) } }
    const manager = new FontManager(editor)
    const loading = manager.ensureFontIsLoaded({ family: 'AcceptanceFont', src: { url: 'data:font/woff2;base64,' } })
    editor.isDisposed = true
    manager.dispose()
    fonts.clear()
    if (outcome === 'loaded') resolve({}); else reject(new Error('Synthetic font load failure'))
    await assert.doesNotReject(loading)
    assert.equal(fonts.size, 0)
  } finally { globalThis.FontFace = original }
})
