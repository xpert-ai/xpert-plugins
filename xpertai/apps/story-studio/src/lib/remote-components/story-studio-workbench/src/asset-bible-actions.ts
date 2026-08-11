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
export const VOICE_REFERENCE_ACCEPT =
  'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.flac'
export const MAX_VOICE_REFERENCE_BYTES = 20 * 1024 * 1024

export function validateAssetImageFile(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'type' as const
  }
  if (!file.size || file.size > MAX_ASSET_IMAGE_BYTES) {
    return 'size' as const
  }
  return null
}

export function validateVoiceReferenceFile(file: File) {
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
  const supportedType = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'application/ogg',
    'audio/flac'
  ].includes(file.type.toLowerCase())
  const supportedExtension = [
    '.mp3',
    '.wav',
    '.m4a',
    '.mp4',
    '.aac',
    '.ogg',
    '.flac'
  ].includes(extension ?? '')
  if ((!supportedType && file.type) || !supportedExtension) {
    return 'type' as const
  }
  if (!file.size || file.size > MAX_VOICE_REFERENCE_BYTES) {
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
  const generationKind = referenceSet === 'expressions'
    ? 'expression references'
    : 'viewing angles'
  const slotPlan = references.map((reference, index) => {
    const select = referenceSet === 'continuity_views' && index === 0
    return [
      `Slot ${index + 1}/4 — ${referenceSlotName(reference)}`,
      `visual requirement: ${referenceInstruction(reference)}`,
      `attach options: ${JSON.stringify({
        assetReference: reference,
        select,
        replaceReference: true
      })}`
    ].join('; ')
  })
  const prompt = [
    production.visualStyle,
    asset.description,
    asset.prompt,
    'Create a clean, reusable continuity reference. No captions, watermarks, logos, split-screen, contact sheet, or UI.'
  ]
    .filter(Boolean)
    .join('\n')
  return [
    `Generate EXACTLY 4 separate image files for one ${referenceSet === 'expressions' ? 'character expression reference set' : 'continuity view set'} in Story Studio project ${projectId}. Each image must fill one and only one named slot below. A contact sheet, split-screen image, or one file containing multiple ${generationKind} does not count.`,
    `Initialize currentBaseRevision=${revision} from the Workbench request. This is the baseRevision for the first attachment. Do not call story_get_project_summary only to refresh revision.`,
    `Target assetId: ${asset.id}; asset name: ${asset.name}; kind: ${asset.kind}.`,
    `Required four-slot plan. Preserve this order and mapping exactly:\n${slotPlan.join('\n')}`,
    `For EACH slot, finish this complete cycle before starting the next slot:\n1. Call seedream_text_to_image exactly once for that slot with size ${assetImageGenerationSize(asset.kind)} and the slot's visual requirement.\n2. Use only the workspacePath returned for that slot; never reuse an image or workspacePath for another slot.\n3. Call story_attach_generated_asset_image once with baseRevision=currentBaseRevision, the exact assetId, a unique task-derived operationId and candidateId, a concise label/changeSummary, provider=seedream_aigc with the returned task id/model/status receipt, and the exact attach options shown for that slot.\n4. After success, read revision from that attachment receipt and assign currentBaseRevision=receipt.revision before continuing. Do not call story_get_project_summary between attachments and do not parallelize attachment calls.`,
    `Continuity contract: keep identity anchors, proportions, colors, clothing, materials, image style, and lighting fixed across all four files. ${referenceSet === 'expressions' ? 'Keep camera angle and crop fixed; change only the requested facial expression.' : 'Change only the requested viewing angle or coverage.'}\nUse this shared prompt base for every generation:\n${prompt}`,
    'Tool-argument contract: assetReference must be the nested object shown in the slot plan, never a quoted or JSON-encoded string. replaceReference must be true so the result fills that exact UI slot. Never pass base64 or a provider URL. Do not change any other asset or production field.',
    `Before replying, verify from the four attachment receipts that all 4 slot keys were attached successfully to this asset. If an attachment reports story_revision_conflict, use error.currentRevision as currentBaseRevision; only if that field is unavailable, call story_get_project_revision once. Retry only that failed slot with the same generated workspacePath and a new operationId; never regenerate it or substitute another slot's image.`
  ].join('\n\n')
}

function referenceSlotName(
  reference: ContinuityReference | ExpressionReference
) {
  return `${reference.type}:${reference.key}`
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
