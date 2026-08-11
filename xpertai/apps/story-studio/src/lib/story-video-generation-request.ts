import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { compactVoiceReference } from './voice-reference.js'
import type {
  StoryAsset,
  StoryCharacter,
  StoryMediaCandidate,
  StoryScene,
  StoryShot,
  StoryShotContinuityState,
  StoryShotTransition
} from './production-types.js'
import type {
  GenerateStoryShotTakesInput,
  StoryVideoGenerationContinuitySnapshot,
  StoryVideoGenerationRequestSnapshot
} from './story-video-generation.types.js'

const MAX_VIDEO_PROMPT_LENGTH = 500
const MAX_REFERENCE_ASSETS = 9

interface StoryGenerationProductionContext {
  assets?: StoryAsset[] | null
  characters?: StoryCharacter[] | null
  scenes?: StoryScene[] | null
}

interface ReferenceImage {
  candidateId: string
  reference: WorkspacePortableFileReference
  promptName: string
}

export function buildStoryVideoGenerationRequest(
  input: GenerateStoryShotTakesInput,
  production: StoryGenerationProductionContext,
  scene: StoryScene,
  shot: StoryShot
): StoryVideoGenerationRequestSnapshot {
  const referenceAssets = resolveReferenceAssets(
    production.assets,
    input.referenceAssetIds ?? shot.videoSettings?.referenceAssetIds ?? []
  )
  const referenceImageCandidateIds = uniqueStrings(
    input.referenceImageCandidateIds ??
      shot.videoSettings?.referenceImageCandidateIds ??
      []
  )
  const shotReference = preferredImageCandidate(shot.candidates, '当前镜头画面')
  const assetReferences = referenceAssets.flatMap((asset) => {
    return selectedAssetImageCandidates(
      asset,
      referenceImageCandidateIds
    )
  })
  const referenceImages = uniqueReferenceImages([
    ...(shotReference ? [shotReference] : []),
    ...assetReferences
  ])
  const userPrompt = compactText(input.prompt)
  const continuity = buildContinuitySnapshot(production.scenes ?? [scene], scene, shot)

  return {
    prompt: buildGenerationPrompt(
      userPrompt,
      production,
      scene,
      shot,
      referenceAssets,
      referenceImages,
      continuity
    ),
    ...(userPrompt ? { userPrompt } : {}),
    model: input.model.trim(),
    resolution: input.resolution.trim(),
    aspectRatio: input.aspectRatio.trim(),
    fps: input.fps,
    durationSeconds: input.durationSeconds,
    generateAudio: input.generateAudio !== false,
    ...(input.redoScope ? { redoScope: input.redoScope } : {}),
    ...(referenceAssets.length
      ? { referenceAssetIds: referenceAssets.map((asset) => asset.id) }
      : {}),
    ...(referenceImages.length
      ? {
          referenceImageCandidateIds: referenceImages.map((item) => item.candidateId),
          referenceImages: referenceImages.map((item) => item.reference),
          references: referenceImages.map((item) => ({
            kind: 'image' as const,
            purpose: 'reference' as const,
            file: item.reference
          }))
        }
      : {}),
    ...(continuity ? { continuity } : {})
  }
}

export function buildContinuitySnapshot(
  scenes: StoryScene[],
  scene: StoryScene,
  shot: StoryShot
): StoryVideoGenerationContinuitySnapshot | null {
  const transition = shot.continuity?.transition ?? 'auto'
  const previous = resolvePreviousShot(scenes, scene, shot)
  if (!previous) return null
  const sourceCandidate = effectiveVideoCandidate(previous.shot.candidates)
  const carriesFrame = transitionUsesSourceFrame(transition)
  const risks = continuityRisks(previous.shot.continuity?.endState, shot.continuity?.startState)
  return {
    transition,
    fromSceneId: previous.scene.id,
    fromShotId: previous.shot.id,
    fromShotTitle: previous.shot.title,
    ...(sourceCandidate ? {
      sourceCandidateId: sourceCandidate.id,
      ...(sourceCandidate.fileReference && isPortableReference(sourceCandidate.fileReference)
        ? { sourceVideo: sourceCandidate.fileReference }
        : {}),
      ...(typeof sourceCandidate.size === 'number' ? { sourceVideoSize: sourceCandidate.size } : {}),
      ...(sourceCandidate.sha256 ? { sourceVideoSha256: sourceCandidate.sha256 } : {})
    } : {}),
    ...(previous.shot.continuity?.endState
      ? { sourceState: previous.shot.continuity.endState }
      : {}),
    ...(shot.continuity?.startState ? { targetState: shot.continuity.startState } : {}),
    strength: carriesFrame && sourceCandidate ? 'prompt_only' : 'none',
    status: !carriesFrame
      ? 'not_required'
      : sourceCandidate
        ? 'prompt_only'
        : 'waiting_source',
    ...(risks.length ? { risks } : {})
  }
}

export function continuityRisks(
  source: StoryShotContinuityState | undefined,
  target: StoryShotContinuityState | undefined
) {
  if (!source?.subjects?.length || !target?.subjects?.length) return []
  const targetByAsset = new Map(target.subjects.map((subject) => [subject.assetId, subject]))
  const risks: string[] = []
  for (const subject of source.subjects) {
    const next = targetByAsset.get(subject.assetId)
    if (!next) continue
    compareState(risks, subject.assetId, '位置', subject.location, next.location)
    compareState(risks, subject.assetId, '姿态', subject.pose, next.pose)
    compareState(risks, subject.assetId, '动作阶段', subject.actionPhase, next.actionPhase)
    compareState(risks, subject.assetId, '手持道具', normalizeList(subject.heldPropAssetIds), normalizeList(next.heldPropAssetIds))
    if (subject.visible != null && next.visible != null && subject.visible !== next.visible) {
      risks.push(`${subject.assetId}的入画状态前后不一致`)
    }
  }
  return risks.slice(0, 8)
}

function buildGenerationPrompt(
  userPrompt: string,
  production: StoryGenerationProductionContext,
  scene: StoryScene,
  shot: StoryShot,
  referenceAssets: StoryAsset[],
  referenceImages: ReferenceImage[],
  continuity: StoryVideoGenerationContinuitySnapshot | null
) {
  const speaker = production.characters?.find(
    (character) => character.id === shot.dialogueSpeakerId
  )
  const dialogue = dialogueInstruction(shot, speaker)
  const sections = [
    promptSection('镜头衔接', continuityInstruction(continuity), 130),
    promptSection('动作表演', shot.action, 72),
    promptSection(dialogue.label, dialogue.value, 92),
    promptSection('声线锚点', speakerVoiceInstruction(speaker), 54),
    promptSection('参考素材', referenceMaterialInstruction(referenceImages), 82),
    promptSection('参考一致性', referenceAssets.map(assetReferenceDescription).join('；'), 48),
    promptSection('构图运镜', compactList([shot.composition, shot.camera, shot.lens]), 42),
    promptSection('场景', compactList([scene.title, scene.summary, scene.location, scene.timeOfDay]), 28),
    promptSection('补充要求', userPrompt, 34),
    promptSection('氛围声音', compactList([
      shot.emotion,
      shot.lighting,
      shot.colorTone,
      shot.weather,
      ...(shot.soundEffects ?? [])
    ]), 18)
  ].filter(Boolean)

  const prompt = sections.join('；')
  return truncateText(prompt || shot.title || scene.title, MAX_VIDEO_PROMPT_LENGTH)
}

function continuityInstruction(continuity: StoryVideoGenerationContinuitySnapshot | null) {
  if (!continuity) return ''
  if (continuity.transition === 'none') return '本镜头不要求承接上一镜头状态'
  if (continuity.transition === 'time_jump') return `从“${continuity.fromShotTitle}”时间跳转，允许状态变化，但保持角色身份一致`
  if (continuity.transition === 'location_jump') return `从“${continuity.fromShotTitle}”地点跳转，允许环境变化，但保持角色身份一致`
  if (continuity.transition === 'hard_cut') return `从“${continuity.fromShotTitle}”普通切换，保持角色、服装和道具一致`
  const source = compactList([
    continuity.sourceState?.summary,
    continuity.sourceState?.environment
  ])
  const target = compactList([
    continuity.targetState?.summary,
    continuity.targetState?.environment
  ])
  const transition = continuity.transition === 'match_action' ? '动作匹配' : '连续动作'
  return `${transition}承接“${continuity.fromShotTitle}”；开场必须从上一镜头结束状态继续，不得让角色、位置、姿态或道具无故复位${source ? `；上一镜头结束：${source}` : ''}${target ? `；本镜头开始：${target}` : ''}`
}

function dialogueInstruction(shot: StoryShot, speaker?: StoryCharacter) {
  if (!shot.dialogue) return { label: '对白', value: '' }
  const speakerName = compactText(speaker?.name ?? '') || '角色'
  if (shot.dialogueType === 'voice_over') return { label: '旁白', value: `${speakerName}：“${shot.dialogue}”；作为画外声音，画面角色不做口型` }
  if (shot.dialogueType === 'off_screen') return { label: '画外音', value: `${speakerName}：“${shot.dialogue}”；说话者不入镜，画面角色不做口型` }
  return { label: '对白', value: `${speakerName}：“${shot.dialogue}”；自然发音并保持口型同步，其他角色不张嘴` }
}

function speakerVoiceInstruction(speaker?: StoryCharacter) {
  const voiceReference = compactVoiceReference(speaker?.voiceReference)
  if (!voiceReference) return ''
  const speakerName = compactText(speaker?.name ?? '') || '角色'
  return `${speakerName}沿用音色参考“${voiceReference.label}”，不要擅自换声`
}

function resolvePreviousShot(scenes: StoryScene[], scene: StoryScene, shot: StoryShot) {
  const explicitId = shot.continuity?.fromShotId
  if (explicitId) {
    for (const item of scenes) {
      const found = item.shots.find((candidate) => candidate.id === explicitId)
      if (found && found.id !== shot.id) return { scene: item, shot: found }
    }
  }
  const sceneIndex = scenes.findIndex((item) => item.id === scene.id)
  const shotIndex = scene.shots.findIndex((item) => item.id === shot.id)
  if (shotIndex > 0) return { scene, shot: scene.shots[shotIndex - 1] }
  const previousScene = scenes[sceneIndex - 1]
  const previousShot = previousScene?.shots.at(-1)
  return previousScene && previousShot ? { scene: previousScene, shot: previousShot } : null
}

function effectiveVideoCandidate(candidates: StoryMediaCandidate[] | undefined) {
  const videos = (candidates ?? []).filter((candidate) => candidate.kind === 'video')
  return videos.find((candidate) => candidate.selected) ?? (videos.length === 1 ? videos[0] : null)
}

function transitionUsesSourceFrame(transition: StoryShotTransition) {
  return transition === 'auto' || transition === 'continuous_action' || transition === 'match_action'
}

function compareState(risks: string[], assetId: string, label: string, previous: string | undefined, next: string | undefined) {
  const left = compactText(previous)
  const right = compactText(next)
  if (left && right && left !== right) risks.push(`${assetId}的${label}从“${left}”变为“${right}”`)
}

function normalizeList(value: string[] | undefined) {
  return value?.slice().sort().join('、')
}

function resolveReferenceAssets(assets: StoryAsset[] | null | undefined, referenceAssetIds: string[]) {
  const assetsById = new Map((assets ?? []).map((asset) => [asset.id, asset]))
  return uniqueStrings(referenceAssetIds).slice(0, MAX_REFERENCE_ASSETS).flatMap((assetId) => {
    const asset = assetsById.get(assetId)
    return asset ? [asset] : []
  })
}

function preferredImageCandidate(candidates: StoryMediaCandidate[] | undefined, promptName: string): ReferenceImage | null {
  const images = (candidates ?? []).filter((candidate) => candidate.kind === 'image' && isPortableReference(candidate.fileReference))
  const candidate = images.find((item) => item.selected) ?? images[0]
  return candidate?.fileReference ? { candidateId: candidate.id, reference: candidate.fileReference, promptName } : null
}

function selectedAssetImageCandidates(
  asset: StoryAsset,
  requestedCandidateIds: string[]
): ReferenceImage[] {
  const requested = new Set(requestedCandidateIds)
  const images = (asset.candidates ?? []).filter(
    (candidate) =>
      candidate.kind === 'image' &&
      requested.has(candidate.id) &&
      isPortableReference(candidate.fileReference)
  )
  if (!images.length) {
    const fallback = preferredImageCandidate(
      asset.candidates,
      `${assetKindLabel(asset.kind)}“${asset.name}”`
    )
    return fallback ? [fallback] : []
  }
  return images.map((candidate) => ({
    candidateId: candidate.id,
    reference: candidate.fileReference!,
    promptName: `${assetKindLabel(asset.kind)}“${asset.name}”${assetReferencePromptSuffix(candidate)}`
  }))
}

function assetReferencePromptSuffix(candidate: StoryMediaCandidate) {
  const reference = candidate.assetReference
  if (!reference || reference.type === 'general') return ''
  const labels = {
    front: '的正面参考',
    three_quarter: '的四分之三视角参考',
    profile: '的侧面参考',
    back: '的背面参考',
    wide: '的全景参考',
    reverse: '的反向参考',
    detail: '的细节参考',
    alternate: '的补充参考',
    neutral: '的平静表情',
    happy: '的开心表情',
    sad: '的难过表情',
    angry: '的生气表情'
  } as const
  return labels[reference.key]
}

function referenceMaterialInstruction(images: ReferenceImage[]) {
  if (!images.length) return ''
  const mapping = images.map((image, index) => `图片${index + 1}为${image.promptName}`).join('；')
  return `${mapping}；按图片编号保持主体、造型与环境一致`
}

function assetKindLabel(kind: StoryAsset['kind']) {
  if (kind === 'character') return '角色'
  if (kind === 'location') return '场景'
  if (kind === 'prop') return '道具'
  return '风格'
}

function uniqueReferenceImages(images: ReferenceImage[]) {
  const seen = new Set<string>()
  return images.filter((image) => {
    const key = `${image.reference.source}:${image.reference.filePath}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function assetReferenceDescription(asset: StoryAsset) {
  const details = asset.categoryDetails
  const anchors = asset.kind === 'character'
    ? compactList([details?.identity, details?.appearance, details?.wardrobe, asset.description])
    : asset.kind === 'location'
      ? compactList([details?.environment, details?.lighting, asset.description])
      : compactList([details?.material, details?.condition, details?.palette, asset.description])
  return anchors ? `${asset.name}（${anchors}）` : asset.name
}

function promptSection(label: string, value: string | null | undefined, maxLength: number) {
  const normalized = compactText(value)
  return normalized ? truncateText(`${label}：${normalized}`, maxLength) : ''
}

function compactList(values: Array<string | null | undefined>) {
  return uniqueStrings(values.map((value) => compactText(value))).join('，')
}

function compactText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function truncateText(value: string, maxLength: number) {
  const characters = Array.from(value)
  if (characters.length <= maxLength) return value
  if (maxLength <= 1) return characters.slice(0, maxLength).join('')
  return `${characters.slice(0, maxLength - 1).join('')}…`
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function isPortableReference(value: unknown): value is WorkspacePortableFileReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Reflect.get(value, 'source') === 'platform.workspace.files'
    && typeof Reflect.get(value, 'filePath') === 'string'
    && typeof Reflect.get(value, 'workspacePath') === 'string'
}
