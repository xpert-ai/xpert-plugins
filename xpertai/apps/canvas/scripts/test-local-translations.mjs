import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { LANGUAGES } from 'tldraw'
import { fileURLToPath } from 'node:url'
import { loadTranslationCatalogs, localTranslationsPlugin } from './local-translations.mjs'

// Exercise the same bundled module and URL loader that the remote component uses.
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/remote-components/canvas-workbench/src/tldraw-translations.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', plugins: [localTranslationsPlugin()]
})
const { canvasTranslationAssetUrls: urls } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const catalogs = await loadTranslationCatalogs()

test('every editor language has a plugin-bundled catalog', () => {
  assert.deepEqual(Object.keys(urls).sort(), LANGUAGES.map(language => language.locale).sort())
  assert.ok(Object.isFrozen(urls))
})

test('all translation URLs load through fetch without an HTTP server', async () => {
  for (const [locale, url] of Object.entries(urls)) {
    assert.match(url, /^data:application\/json;charset=utf-8,/)
    const response = await fetch(url)
    assert.equal(response.ok, true, locale)
    assert.deepEqual(await response.json(), catalogs[locale], locale)
  }
})

test('Chinese and RTL catalogs survive bundling without text corruption', () => {
  assert.match(catalogs['zh-cn']['tool.select'], /选择/)
  assert.match(catalogs['zh-tw']['tool.select'], /選/)
  assert.match(catalogs.ar['tool.select'], /[\u0600-\u06ff]/)
  // Since 5.6, English is supplied by tldraw's inline default messages.
  assert.deepEqual(catalogs.en, {})
})
