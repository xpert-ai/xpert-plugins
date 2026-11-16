import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAnalysisEvidence } from '@xpert-ai/plugin-sdk/analytics'
import { evidenceComposition } from './composition.js'
const fixture = () => parseAnalysisEvidence(JSON.parse(readFileSync(join(__dirname, '../../../../../test-fixtures/analysis-evidence.json'), 'utf8')))
it('uses the same precise cells for visible tables and timed narration, with no scripts from data', () => {
  const evidence = fixture(), result = evidenceComposition(evidence)
  expect(result.html).toContain('9007199254740993.12')
  expect(result.html).toContain('east &lt;/script&gt;')
  expect(result.html).not.toContain('east </script>')
  expect(result.captions[0].text).toContain('9007199254740993.12 CNY')
  expect(result.captions[0].citations).toContainEqual({ datasetId: 'sales', row: 0, field: 'amount' })
  expect(result.html).toContain(evidence.sha256)
  const metadata = result.html.match(/<script type="application\/json" id="evidence-narration">([\s\S]*?)<\/script>/)?.[1]
  expect(JSON.parse(metadata!).audio).toBe('not_generated')
  expect(JSON.parse(metadata!).captions).toEqual(result.captions)
})
it('refuses data changed after capture', () => {
  const evidence = fixture(); evidence.datasets[0].rows[0].amount = '100'
  expect(() => evidenceComposition(evidence)).toThrow('INTEGRITY_FAILED')
})
