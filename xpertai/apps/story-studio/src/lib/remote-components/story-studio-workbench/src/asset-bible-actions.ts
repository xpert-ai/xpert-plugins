import type { Asset, ProductionView } from './production-data'

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
}) {
  const { projectId, revision, asset, production } = input
  const prompt = [
    production.visualStyle,
    asset.description,
    asset.prompt,
    'Create a clean, reusable continuity reference. No captions, watermarks, logos, split-screen, contact sheet, or UI.'
  ]
    .filter(Boolean)
    .join('\n')
  return [
    `Generate one asset-bible reference image for Story Studio project ${projectId}.`,
    `The currently observed project revision is ${revision}. Call story_get_project_summary immediately before attaching and use its exact current revision.`,
    `Target assetId: ${asset.id}; asset name: ${asset.name}; kind: ${asset.kind}.`,
    `Call seedream_text_to_image once with size ${assetImageGenerationSize(asset.kind)} and this prompt:\n${prompt}`,
    'After Seedream returns a completed Workspace image, call story_attach_generated_asset_image with the exact assetId, the returned workspacePath, provider=seedream_aigc, its task id/model/status receipt, select=true, and a unique task-derived candidateId.',
    'Never pass base64 or a provider URL. Do not change any other asset or production field.'
  ].join('\n\n')
}
