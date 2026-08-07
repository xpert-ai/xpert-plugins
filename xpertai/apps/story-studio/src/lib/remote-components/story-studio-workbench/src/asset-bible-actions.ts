import type { Asset, ProductionView } from './production-data'
import {
  continuityReferencesForAsset,
  EXPRESSION_REFERENCES,
  type ContinuityReference,
  type ExpressionReference,
  type AssetReferenceSet
} from './asset-reference-data'

export const ASSET_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
export const MAX_ASSET_IMAGE_BYTES = 20 * 1024 * 1024

export function validateAssetImageFile(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'type' as const
  }
  if (!file.size || file.size > MAX_ASSET_IMAGE_BYTES) {
    return 'size' as const
  }
  return null
}

export function assetImageGenerationSize(kind: Asset['kind']) {
  if (kind === 'character') return '1728x2304'
  if (kind === 'location') return '2560x1440'
  return '2048x2048'
}

export function buildAssetImageAssistantMessage(input: {
  projectId: string
  revision: number
  asset: Asset
  production: ProductionView
  referenceSet?: AssetReferenceSet
}) {
  const { projectId, revision, asset, production } = input
  const referenceSet = input.referenceSet ?? 'continuity_views'
  if (referenceSet === 'expressions' && asset.kind !== 'character') {
    throw new Error('Expression references require a character asset.')
  }
  const references = referenceSet === 'expressions'
    ? EXPRESSION_REFERENCES
    : continuityReferencesForAsset(asset.kind)
  const prompt = [
    production.visualStyle,
    asset.description,
    asset.prompt,
    'Create a clean, reusable continuity reference. No captions, watermarks, logos, split-screen, contact sheet, or UI.'
  ]
    .filter(Boolean)
    .join('\n')
  return [
    `Generate one ${referenceSet === 'expressions' ? 'character expression reference set' : 'continuity view set'} containing four separate images for Story Studio project ${projectId}.`,
    `The currently observed project revision is ${revision}. Call story_get_project_summary immediately before attaching and use its exact current revision.`,
    `Target assetId: ${asset.id}; asset name: ${asset.name}; kind: ${asset.kind}.`,
    `Call seedream_text_to_image four times with size ${assetImageGenerationSize(asset.kind)}. Keep identity anchors, proportions, colors, clothing, and materials fixed. Generate these exact references in order:\n${references.map((reference, index) => `${index + 1}. ${referenceInstruction(reference)}; attach with assetReference=${JSON.stringify(reference)}`).join('\n')}\nUse this prompt as the shared base:\n${prompt}`,
    `After each completed Workspace image, call story_get_project_summary to refresh the revision, then call story_attach_generated_asset_image with the exact assetId, returned workspacePath, provider=seedream_aigc, its task id/model/status receipt, a unique task-derived candidateId, and the exact assetReference shown above. ${referenceSet === 'continuity_views' ? 'Use select=true only for the first view and select=false for the other three.' : 'Use select=false for every expression image.'}`,
    'Never pass base64 or a provider URL. Do not change any other asset or production field.'
  ].join('\n\n')
}

function referenceInstruction(
  reference: ContinuityReference | ExpressionReference
) {
  if (reference.type === 'expression') {
    const expressions = {
      neutral: 'neutral relaxed expression, face clearly visible',
      happy: 'happy expression with an open, readable face',
      sad: 'sad expression with restrained emotional detail',
      angry: 'angry or determined expression without changing identity'
    } as const
    return expressions[reference.key]
  }
  const views = {
    front: 'front-facing full-body view',
    three_quarter: 'three-quarter full-body view',
    profile: 'clean side profile view',
    back: 'rear three-quarter view showing silhouette and wardrobe',
    wide: 'wide establishing continuity view',
    reverse: 'reverse-angle continuity view',
    detail: 'detail continuity view of defining features',
    alternate: 'alternate angle preserving the same spatial or visual identity'
  } as const
  return views[reference.key]
}
