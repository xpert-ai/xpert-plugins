import assert from 'node:assert/strict'
import { test } from 'node:test'
import { siteSearchProjection, siteSourceRevision } from '../.artifacts/sites-spec/lib/sites-search.js'
test('search extracts static page text and excludes scripts, hidden form values and styles', () => {
  const source = { files: [{ path: 'index.html', encoding: 'utf8', sha256: 'a', content: '<h1>Visible &amp; safe</h1><script>secret()</script><style>.hidden{}</style><input value="credential"><div hidden>hidden text</div><div aria-hidden="true">private</div><p style="display:none">hidden-css</p>' },
    { path: 'code.js', encoding: 'utf8', sha256: 'b', content: 'secret-code' }] }
  const projection = siteSearchProjection(source)
  assert.deepEqual(projection.sections, [{ anchor: { kind: 'page', id: 'index.html' }, text: 'Visible & safe' }])
  assert.equal(siteSourceRevision(source), siteSourceRevision({ files: [...source.files].reverse() }))
  assert.notEqual(projection.revision, siteSourceRevision({ files: [{ ...source.files[0], sha256: 'changed' }] }))
})
