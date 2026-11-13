const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const entries = require('../scripts/content/library-catalog.json')
const provenance = require('../assets/library/catalog/provenance.json')

test('authored catalog ships complete local previews and localized copy, with no runnable content', () => {
  assert.equal(new Set(entries.map(entry => entry.id)).size, 86)
  assert.deepEqual(['analysis-template','visual-theme','component'].map(kind => entries.filter(entry => entry.kind === kind).length), [6,43,37])
  for (const entry of entries) {
    assert.equal(entry.status, 'planned')
    assert.equal(entry.content, null)
    assert.equal(entry.releaseId, undefined)
    assert.equal(entry.preview, path.basename(entry.preview))
    const bytes = readFileSync(path.join(__dirname,'../assets/library/catalog',entry.preview))
    assert.match(bytes.toString(), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
    assert.doesNotMatch(bytes.toString(), /<script|<image|<foreignObject|\bon\w+=|\bhref=/i)
    assert.ok(provenance.entries.some(item => item.id === entry.id && item.file === entry.preview
      && item.origin === 'original-code-authored' && item.sha256 === createHash('sha256').update(bytes).digest('hex')))
    for (const locale of ['en','zh-Hans','zh-Hant']) {
      const strings = require(`../src/remote/locales/${locale}.json`)
      for (const key of [entry.titleKey,entry.descriptionKey,...entry.featureKeys]) assert.ok(strings[key]?.trim(), `${locale}:${key}`)
    }
  }
})
