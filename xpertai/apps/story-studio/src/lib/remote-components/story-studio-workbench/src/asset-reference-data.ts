import type { Asset, AssetReference, Candidate } from './production-data'

export type AssetReferenceSet = 'continuity_views' | 'expressions'
export type ContinuityReference = Extract<
  AssetReference,
  { type: 'continuity_view' }
>
export type ExpressionReference = Extract<
  AssetReference,
  { type: 'expression' }
>

export const CHARACTER_VIEW_REFERENCES: ContinuityReference[] = [
  { type: 'continuity_view', key: 'front' },
  { type: 'continuity_view', key: 'three_quarter' },
  { type: 'continuity_view', key: 'profile' },
  { type: 'continuity_view', key: 'back' }
]

export const EXPRESSION_REFERENCES: ExpressionReference[] = [
  { type: 'expression', key: 'neutral' },
  { type: 'expression', key: 'happy' },
  { type: 'expression', key: 'sad' },
  { type: 'expression', key: 'angry' }
]

export function continuityReferencesForAsset(
  kind: Asset['kind']
): ContinuityReference[] {
  if (kind === 'character' || kind === 'prop') {
    return CHARACTER_VIEW_REFERENCES
  }
  return [
    { type: 'continuity_view', key: 'wide' },
    { type: 'continuity_view', key: 'reverse' },
    { type: 'continuity_view', key: 'detail' },
    { type: 'continuity_view', key: 'alternate' }
  ]
}

export function isContinuityCandidate(candidate: Candidate) {
  return candidate.kind === 'image' && candidate.assetReference?.type !== 'expression'
}

export function isExpressionCandidate(candidate: Candidate) {
  return candidate.kind === 'image' && candidate.assetReference?.type === 'expression'
}
