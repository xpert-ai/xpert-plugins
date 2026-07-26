import { BadRequestException } from '@nestjs/common'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type {
  StoryAsset,
  StoryMediaCandidate,
  StoryProductionDocument,
  StoryScene
} from './production-types.js'

export function sanitizeAssets(assets: StoryAsset[]): StoryAsset[] {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    description: asset.description,
    prompt: asset.prompt,
    ...(asset.candidates
      ? { candidates: asset.candidates.map(sanitizeCandidate) }
      : {})
  }))
}

export function sanitizeScenes(scenes: StoryScene[]): StoryScene[] {
  return scenes.map((scene) => ({
    id: scene.id,
    order: scene.order,
    title: scene.title,
    summary: scene.summary,
    ...(scene.location ? { location: scene.location } : {}),
    ...(scene.timeOfDay ? { timeOfDay: scene.timeOfDay } : {}),
    shots: scene.shots.map((shot) => ({
      id: shot.id,
      title: shot.title,
      composition: shot.composition,
      action: shot.action,
      camera: shot.camera,
      ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
      durationSeconds: shot.durationSeconds,
      ...(shot.candidates
        ? { candidates: shot.candidates.map(sanitizeCandidate) }
        : {})
    }))
  }))
}

export type StoryRenderMedia = {
  candidateId: string
  targetPath: string
  browserPath: string
  reference: WorkspacePortableFileReference
  size: number
  sha256: string
}

export function prepareRenderMedia(
  production: StoryProductionDocument,
  tenantId: string
): StoryRenderMedia[] {
  const selected = production.scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) =>
      (shot.candidates ?? []).filter(
        (candidate) =>
          candidate.selected === true &&
          (candidate.kind === 'image' || candidate.kind === 'video')
      )
    )
  )
  const seen = new Set<string>()
  const result: StoryRenderMedia[] = []
  for (const candidate of selected) {
    if (
      seen.has(candidate.id) ||
      !candidate.fileReference ||
      !candidate.size ||
      !candidate.sha256
    ) {
      continue
    }
    const reference = candidate.fileReference
    if (
      reference.source !== 'platform.workspace.files' ||
      (reference.tenantId && reference.tenantId !== tenantId)
    ) {
      throw new BadRequestException('Selected storyboard media is outside the render scope.')
    }
    const fileName = safeMediaName(
      candidate.originalName ?? reference.originalName ?? `${candidate.id}.bin`
    )
    const targetPath = `media/${candidate.id}/${fileName}`
    seen.add(candidate.id)
    result.push({
      candidateId: candidate.id,
      targetPath,
      browserPath: targetPath,
      reference,
      size: candidate.size,
      sha256: candidate.sha256
    })
  }
  return result
}

function sanitizeCandidate(candidate: StoryMediaCandidate): StoryMediaCandidate {
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    ...(candidate.selected === undefined ? {} : { selected: candidate.selected }),
    ...(candidate.fileUrl ? { fileUrl: candidate.fileUrl } : {}),
    ...(candidate.workspacePath ? { workspacePath: candidate.workspacePath } : {}),
    ...(candidate.prompt ? { prompt: candidate.prompt } : {}),
    ...(candidate.providerReceipt
      ? { providerReceipt: candidate.providerReceipt }
      : {}),
    ...(candidate.originalName ? { originalName: candidate.originalName } : {}),
    ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
    ...(candidate.size ? { size: candidate.size } : {}),
    ...(candidate.sha256 ? { sha256: candidate.sha256 } : {})
  }
}

function safeMediaName(value: string) {
  const safe = value
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '-')
    .replace(/^\.+/, '')
    .trim()
  return safe || 'media.bin'
}
