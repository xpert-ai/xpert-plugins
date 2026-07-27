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
      ...(shot.dialogueSpeakerId
        ? { dialogueSpeakerId: shot.dialogueSpeakerId }
        : {}),
      ...(shot.dialogueType ? { dialogueType: shot.dialogueType } : {}),
      ...(shot.soundEffects ? { soundEffects: shot.soundEffects } : {}),
      durationSeconds: shot.durationSeconds,
      ...(shot.candidates
        ? { candidates: shot.candidates.map(sanitizeCandidate) }
        : {})
    }))
  }))
}

/**
 * Remote Workbench clients never receive workspace file capabilities. Preserve
 * those server-owned fields when a human saves an edited production document,
 * while still accepting the explicitly editable candidate fields.
 */
export function mergeWorkbenchProductionMedia(
  incoming: StoryProductionDocument,
  current: StoryProductionDocument
): StoryProductionDocument {
  const currentAssets = new Map(
    (current.assets ?? []).map((asset) => [asset.id, asset])
  )
  const currentShots = new Map(
    current.scenes.flatMap((scene) =>
      scene.shots.map((shot) => [shot.id, shot] as const)
    )
  )

  return {
    ...incoming,
    assets: (incoming.assets ?? []).map((asset) => {
      const previous = currentAssets.get(asset.id)
      return {
        ...asset,
        candidates: mergeCandidates(
          asset.candidates,
          previous?.candidates
        )
      }
    }),
    scenes: incoming.scenes.map((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => {
        const previous = currentShots.get(shot.id)
        return {
          ...shot,
          candidates: mergeCandidates(
            shot.candidates,
            previous?.candidates
          )
        }
      })
    }))
  }
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

function mergeCandidates(
  incoming: StoryMediaCandidate[] | undefined,
  current: StoryMediaCandidate[] | undefined
) {
  if (!incoming) return current
  const currentById = new Map(
    (current ?? []).map((candidate) => [candidate.id, candidate])
  )
  return incoming.map((candidate) => {
    const previous = currentById.get(candidate.id)
    if (!previous) return editableCandidate(candidate)
    return {
      ...editableCandidate(candidate),
      kind: previous.kind,
      ...copyDefinedMediaFields(previous)
    }
  })
}

function editableCandidate(candidate: StoryMediaCandidate) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    ...(candidate.selected === undefined
      ? {}
      : { selected: candidate.selected }),
    ...(candidate.prompt ? { prompt: candidate.prompt } : {})
  }
}

function copyDefinedMediaFields(candidate: StoryMediaCandidate) {
  return {
    ...(candidate.fileUrl ? { fileUrl: candidate.fileUrl } : {}),
    ...(candidate.workspacePath
      ? { workspacePath: candidate.workspacePath }
      : {}),
    ...(candidate.providerReceipt
      ? { providerReceipt: candidate.providerReceipt }
      : {}),
    ...(candidate.originalName
      ? { originalName: candidate.originalName }
      : {}),
    ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
    ...(candidate.size ? { size: candidate.size } : {}),
    ...(candidate.sha256 ? { sha256: candidate.sha256 } : {}),
    ...(candidate.fileReference
      ? { fileReference: candidate.fileReference }
      : {})
  }
}
