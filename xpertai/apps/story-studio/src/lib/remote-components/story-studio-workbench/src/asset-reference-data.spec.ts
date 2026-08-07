import {
  continuityReferencesForAsset,
  EXPRESSION_REFERENCES,
  isContinuityCandidate,
  isExpressionCandidate
} from './asset-reference-data'
import type { Candidate } from './production-data'

const candidate = (assetReference: Candidate['assetReference']): Candidate => ({
  id: 'candidate-1',
  kind: 'image',
  label: 'Reference',
  selected: false,
  fileUrl: null,
  workspacePath: null,
  originalName: null,
  size: null,
  sha256: null,
  prompt: null,
  providerReceipt: null,
  assetReference
})

describe('asset reference data', () => {
  it('uses four explicit character viewpoints', () => {
    expect(continuityReferencesForAsset('character')).toEqual([
      { type: 'continuity_view', key: 'front' },
      { type: 'continuity_view', key: 'three_quarter' },
      { type: 'continuity_view', key: 'profile' },
      { type: 'continuity_view', key: 'back' }
    ])
  })

  it('defines a separate four-expression reference group', () => {
    expect(EXPRESSION_REFERENCES.map((item) => item.key)).toEqual([
      'neutral',
      'happy',
      'sad',
      'angry'
    ])
  })

  it('treats legacy untyped asset images as continuity references', () => {
    expect(isContinuityCandidate(candidate(null))).toBe(true)
    expect(isExpressionCandidate(candidate(null))).toBe(false)
    expect(isExpressionCandidate(candidate({ type: 'expression', key: 'happy' }))).toBe(true)
  })
})
