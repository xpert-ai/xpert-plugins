import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const editorRequire = createRequire(require.resolve('tldraw'))
const editorRoot = dirname(dirname(editorRequire.resolve('@tldraw/editor')))
const managers = {
  cjs: editorRequire('@tldraw/editor').FontManager,
  esm: (await import(pathToFileURL(join(editorRoot, 'dist-esm/lib/editor/managers/FontManager/FontManager.mjs')).href)).FontManager
}

// Upstream regression: a load can settle after the editor is destroyed.
for (const [format, FontManager] of Object.entries(managers)) {
  for (const outcome of ['loaded', 'failed']) test(`${format}: font ${outcome} after disposal never updates a removed state`, async () => {
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
}
