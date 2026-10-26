import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentCoverage, coveredByContent } from '../src/content-coverage.js'
test('native bundle coverage suppresses only its own internal files and respects directory boundaries', () => {
  const coverage = contentCoverage([{ source: { kind: 'bundle', rootPath: 'native/deck', entryPath: 'source.json' },
    containedPaths: [{ path: 'media/assets', recursive: true }, { path: 'definition.json', recursive: false }] }] as never)
  for (const path of ['native/deck', 'native/deck/image.png', 'media/assets/image.png', 'definition.json'])
    assert(coveredByContent(path, coverage), path)
  for (const path of ['native/deck-other/source.json', 'media/assets-other/image.png', 'definition.json/child', 'exports/deck.pdf', 'user.md'])
    assert(!coveredByContent(path, coverage), path)
})
