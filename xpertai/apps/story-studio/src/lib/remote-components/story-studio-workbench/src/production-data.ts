import {
  isRemoteObject,
  type RemoteObject,
  type RemoteValue
} from './runtime'

export type Candidate = {
  id: string
  kind: 'image' | 'video' | 'audio'
  label: string
  selected: boolean
  fileUrl: string | null
  workspacePath: string | null
  originalName: string | null
  mimeType?: string | null
  size: number | null
  sha256: string | null
  prompt: string | null
  providerReceipt: {
    provider: string
    taskId: string
    model: string | null
    status: string
  } | null
  assetReference?: AssetReference | null
}

export type AssetReference =
  | {
      type: 'continuity_view'
      key:
        | 'front'
        | 'three_quarter'
        | 'profile'
        | 'back'
        | 'wide'
        | 'reverse'
        | 'detail'
        | 'alternate'
    }
  | {
      type: 'expression'
      key: 'neutral' | 'happy' | 'sad' | 'angry'
    }
  | {
      type: 'general'
    }

export type SourceMaterial = {
  id: string
  title: string
  type: 'text' | 'file' | 'url'
  excerpt: string
  status: 'imported' | 'reviewed'
}

export type Beat = {
  id: string
  title: string
  summary: string
  purpose: string
}

export type StoryPlan = {
  logline: string
  theme: string
  tone: string
  beats: Beat[]
  adaptationSuggestions: AdaptationSuggestion[]
}

export type AdaptationSuggestion = {
  id: string
  episodeId: string
  sceneId: string | null
  shotId: string | null
  originalText: string
  suggestedText: string
  reason: string
  status: 'pending' | 'accepted' | 'dismissed'
  createdBy: 'assistant' | 'user'
  createdAt: string
}

export type Episode = {
  id: string
  order: number
  title: string
  summary: string
  script: string
  targetDurationSeconds: number | null
}

export type Asset = {
  id: string
  kind: 'character' | 'location' | 'prop' | 'style'
  name: string
  description: string
  prompt: string
  negativePrompt: string | null
  continuityNotes: string | null
  categoryDetails: AssetCategoryDetails
  candidates: Candidate[]
}

export type AssetCategoryDetails = {
  identity: string | null
  appearance: string | null
  wardrobe: string | null
  voice: string | null
  environment: string | null
  lighting: string | null
  material: string | null
  condition: string | null
  storyFunction: string | null
  palette: string | null
  lens: string | null
  continuity: string | null
}

export type VoiceReference = {
  url: string
  label: string
  license: string | null
  sourceUrl: string | null
  workspacePath?: string | null
  originalName?: string | null
  mimeType?: string | null
  size?: number | null
}

export type Character = {
  id: string
  name: string
  role: string | null
  visualDescription: string | null
  voiceReference: VoiceReference | null
}

export type Shot = {
  id: string
  title: string
  composition: string
  action: string
  camera: string
  dialogue: string | null
  dialogueSpeakerId: string | null
  dialogueType: 'dialogue' | 'voice_over' | 'off_screen' | null
  soundEffects: string[]
  generationPrompt: string | null
  emotion: string | null
  lens: string | null
  lighting: string | null
  colorTone: string | null
  weather: string | null
  continuity?: ShotContinuity | null
  videoSettings?: ShotVideoSettings | null
  durationSeconds: number
  candidates: Candidate[]
}

export type ShotTransition = 'auto' | 'continuous_action' | 'match_action' | 'hard_cut' | 'time_jump' | 'location_jump' | 'none'
export type ShotContinuitySubjectState = {
  assetId: string
  visible: boolean | null
  location: string | null
  pose: string | null
  actionPhase: string | null
  facing: string | null
  screenPosition: string | null
  heldPropAssetIds: string[]
  wardrobe: string | null
  emotion: string | null
}
export type ShotContinuityState = {
  summary: string | null
  environment: string | null
  subjects: ShotContinuitySubjectState[]
}
export type ShotContinuity = {
  transition: ShotTransition
  fromShotId: string | null
  startState: ShotContinuityState | null
  endState: ShotContinuityState | null
}

export type ShotVideoSettings = {
  generatorId: string | null
  model: string | null
  resolution: string | null
  aspectRatio: string | null
  fps: number | null
  takeCount: number | null
  referenceAssetIds: string[]
  referenceImageCandidateIds?: string[]
}

export type Scene = {
  id: string
  episodeId: string | null
  order: number
  title: string
  summary: string
  location: string | null
  timeOfDay: string | null
  shots: Shot[]
}

export type ProductionView = {
  sourceSynopsis: string
  visualStyle: string
  adaptationGoal: string
  audience?: string | null
  totalDurationSeconds: number
  sourceMaterials: SourceMaterial[]
  storyPlan: StoryPlan | null
  episodes: Episode[]
  assets: Asset[]
  characters: Character[]
  scenes: Scene[]
  counts: {
    sources: number
    beats: number
    episodes: number
    assets: number
    characters: number
    scenes: number
    shots: number
    candidates: number
    selectedCandidates: number
  }
}

export type HandoffView = {
  id: string
  projectId: string
  sourceRevision: number
  handoffRevision: number
  mode: 'create' | 'proposal'
  status: 'ready' | 'delivered' | 'proposal_ready' | 'failed'
  checksum: string
  cutProjectId: string | null
  cutProjectRevision: number | null
  cutProposalId: string | null
  shotCount: number
  durationSeconds: number
  width: number
  height: number
  fps: number
  failureMessage: string | null
}

export function parseProductionView(value: RemoteValue): ProductionView | null {
  if (!isRemoteObject(value)) return null
  const sourceSynopsis = stringField(value, 'sourceSynopsis')
  const visualStyle = stringField(value, 'visualStyle')
  const adaptationGoal = stringField(value, 'adaptationGoal')
  const counts = isRemoteObject(value.counts) ? value.counts : null
  if (
    !sourceSynopsis ||
    !visualStyle ||
    !adaptationGoal ||
    !counts ||
    !Array.isArray(value.scenes)
  ) {
    return null
  }
  return {
    sourceSynopsis,
    visualStyle,
    adaptationGoal,
    audience: nullableString(value, 'audience'),
    totalDurationSeconds: numberField(value, 'totalDurationSeconds') ?? 0,
    counts: {
      sources: numberField(counts, 'sources') ?? 0,
      beats: numberField(counts, 'beats') ?? 0,
      episodes: numberField(counts, 'episodes') ?? 0,
      assets: numberField(counts, 'assets') ?? 0,
      characters: numberField(counts, 'characters') ?? 0,
      scenes: numberField(counts, 'scenes') ?? 0,
      shots: numberField(counts, 'shots') ?? 0,
      candidates: numberField(counts, 'candidates') ?? 0,
      selectedCandidates: numberField(counts, 'selectedCandidates') ?? 0
    },
    sourceMaterials: arrayField(value, 'sourceMaterials')
      .map(parseSource)
      .filter(isPresent),
    storyPlan: parseStoryPlan(value.storyPlan),
    episodes: arrayField(value, 'episodes').map(parseEpisode).filter(isPresent),
    assets: arrayField(value, 'assets').map(parseAsset).filter(isPresent),
    characters: arrayField(value, 'characters')
      .map(parseCharacter)
      .filter(isPresent),
    scenes: value.scenes.map(parseScene).filter(isPresent)
  }
}

export function parseHandoffView(value: RemoteValue): HandoffView | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const projectId = stringField(value, 'projectId')
  const mode =
    value.mode === 'create' || value.mode === 'proposal' ? value.mode : null
  const status =
    value.status === 'ready' ||
    value.status === 'delivered' ||
    value.status === 'proposal_ready' ||
    value.status === 'failed'
      ? value.status
      : null
  const checksum = stringField(value, 'checksum')
  if (!id || !projectId || !mode || !status || !checksum) return null
  return {
    id,
    projectId,
    mode,
    status,
    checksum,
    sourceRevision: numberField(value, 'sourceRevision') ?? 0,
    handoffRevision: numberField(value, 'handoffRevision') ?? 0,
    cutProjectId: nullableString(value, 'cutProjectId'),
    cutProjectRevision: numberField(value, 'cutProjectRevision'),
    cutProposalId: nullableString(value, 'cutProposalId'),
    shotCount: numberField(value, 'shotCount') ?? 0,
    durationSeconds: numberField(value, 'durationSeconds') ?? 0,
    width: numberField(value, 'width') ?? 0,
    height: numberField(value, 'height') ?? 0,
    fps: numberField(value, 'fps') ?? 0,
    failureMessage: nullableString(value, 'failureMessage')
  }
}

function parseSource(value: RemoteValue): SourceMaterial | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const title = stringField(value, 'title')
  const excerpt = stringField(value, 'excerpt')
  const type =
    value.type === 'text' || value.type === 'file' || value.type === 'url'
      ? value.type
      : null
  const status =
    value.status === 'imported' || value.status === 'reviewed'
      ? value.status
      : null
  return id && title && excerpt && type && status
    ? { id, title, excerpt, type, status }
    : null
}

function parseStoryPlan(value: RemoteValue): StoryPlan | null {
  if (!isRemoteObject(value)) return null
  const logline = stringField(value, 'logline')
  const theme = stringField(value, 'theme')
  const tone = stringField(value, 'tone')
  if (!logline || !theme || !tone || !Array.isArray(value.beats)) return null
  return {
    logline,
    theme,
    tone,
    beats: value.beats.map(parseBeat).filter(isPresent),
    adaptationSuggestions: arrayField(value, 'adaptationSuggestions')
      .map(parseAdaptationSuggestion)
      .filter(isPresent)
  }
}

function parseAdaptationSuggestion(
  value: RemoteValue
): AdaptationSuggestion | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const episodeId = stringField(value, 'episodeId')
  const originalText = stringField(value, 'originalText')
  const suggestedText = stringField(value, 'suggestedText')
  const reason = stringField(value, 'reason')
  const createdAt = stringField(value, 'createdAt')
  const status =
    value.status === 'pending' ||
    value.status === 'accepted' ||
    value.status === 'dismissed'
      ? value.status
      : null
  const createdBy =
    value.createdBy === 'assistant' || value.createdBy === 'user'
      ? value.createdBy
      : null
  if (
    !id ||
    !episodeId ||
    !originalText ||
    !suggestedText ||
    !reason ||
    !createdAt ||
    !status ||
    !createdBy
  ) {
    return null
  }
  return {
    id,
    episodeId,
    originalText,
    suggestedText,
    reason,
    status,
    createdBy,
    createdAt,
    sceneId: nullableString(value, 'sceneId'),
    shotId: nullableString(value, 'shotId')
  }
}

function parseBeat(value: RemoteValue): Beat | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const title = stringField(value, 'title')
  const summary = stringField(value, 'summary')
  const purpose = stringField(value, 'purpose')
  return id && title && summary && purpose
    ? { id, title, summary, purpose }
    : null
}

function parseEpisode(value: RemoteValue): Episode | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const title = stringField(value, 'title')
  const summary = stringField(value, 'summary')
  const script = stringField(value, 'script')
  const order = numberField(value, 'order')
  if (!id || !title || !summary || !script || order === null) return null
  return {
    id,
    title,
    summary,
    script,
    order,
    targetDurationSeconds: numberField(value, 'targetDurationSeconds')
  }
}

function parseAsset(value: RemoteValue): Asset | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const name = stringField(value, 'name')
  const description = stringField(value, 'description')
  const prompt = stringField(value, 'prompt')
  const kind =
    value.kind === 'character' ||
    value.kind === 'location' ||
    value.kind === 'prop' ||
    value.kind === 'style'
      ? value.kind
      : null
  if (!id || !name || !description || !prompt || !kind) return null
  return {
    id,
    name,
    description,
    prompt,
    kind,
    negativePrompt: nullableString(value, 'negativePrompt'),
    continuityNotes: nullableString(value, 'continuityNotes'),
    categoryDetails: parseAssetCategoryDetails(value.categoryDetails),
    candidates: arrayField(value, 'candidates')
      .map(parseCandidate)
      .filter(isPresent)
  }
}

function parseAssetCategoryDetails(value: RemoteValue): AssetCategoryDetails {
  const object = isRemoteObject(value) ? value : {}
  return {
    identity: nullableString(object, 'identity'),
    appearance: nullableString(object, 'appearance'),
    wardrobe: nullableString(object, 'wardrobe'),
    voice: nullableString(object, 'voice'),
    environment: nullableString(object, 'environment'),
    lighting: nullableString(object, 'lighting'),
    material: nullableString(object, 'material'),
    condition: nullableString(object, 'condition'),
    storyFunction: nullableString(object, 'storyFunction'),
    palette: nullableString(object, 'palette'),
    lens: nullableString(object, 'lens'),
    continuity: nullableString(object, 'continuity')
  }
}

function parseCharacter(value: RemoteValue): Character | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const name = stringField(value, 'name')
  if (!id || !name) return null
  return {
    id,
    name,
    role: nullableString(value, 'role'),
    visualDescription: nullableString(value, 'visualDescription'),
    voiceReference: parseVoiceReference(value.voiceReference)
  }
}

function parseVoiceReference(value: RemoteValue): VoiceReference | null {
  if (!isRemoteObject(value)) return null
  const url = stringField(value, 'url')
  const label = stringField(value, 'label')
  if (!url || !label) return null
  return {
    url,
    label,
    license: nullableString(value, 'license'),
    sourceUrl: nullableString(value, 'sourceUrl'),
    workspacePath: nullableString(value, 'workspacePath'),
    originalName: nullableString(value, 'originalName'),
    mimeType: nullableString(value, 'mimeType'),
    size: numberField(value, 'size')
  }
}

function parseScene(value: RemoteValue): Scene | null {
  if (!isRemoteObject(value) || !Array.isArray(value.shots)) return null
  const id = stringField(value, 'id')
  const title = stringField(value, 'title')
  const summary = stringField(value, 'summary')
  const order = numberField(value, 'order')
  if (!id || !title || !summary || order === null) return null
  return {
    id,
    episodeId: nullableString(value, 'episodeId'),
    order,
    title,
    summary,
    location: nullableString(value, 'location'),
    timeOfDay: nullableString(value, 'timeOfDay'),
    shots: value.shots.map(parseShot).filter(isPresent)
  }
}

function parseShot(value: RemoteValue): Shot | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const title = stringField(value, 'title')
  const composition = stringField(value, 'composition')
  const action = stringField(value, 'action')
  const camera = stringField(value, 'camera')
  const durationSeconds = numberField(value, 'durationSeconds')
  if (
    !id ||
    !title ||
    !composition ||
    !action ||
    !camera ||
    durationSeconds === null
  ) {
    return null
  }
  return {
    id,
    title,
    composition,
    action,
    camera,
    durationSeconds,
    dialogue: nullableString(value, 'dialogue'),
    dialogueSpeakerId: nullableString(value, 'dialogueSpeakerId'),
    dialogueType:
      value.dialogueType === 'dialogue' ||
      value.dialogueType === 'voice_over' ||
      value.dialogueType === 'off_screen'
        ? value.dialogueType
        : null,
    soundEffects: arrayField(value, 'soundEffects').filter(
      (item): item is string => typeof item === 'string'
    ),
    generationPrompt: nullableString(value, 'generationPrompt'),
    emotion: nullableString(value, 'emotion'),
    lens: nullableString(value, 'lens'),
    lighting: nullableString(value, 'lighting'),
    colorTone: nullableString(value, 'colorTone'),
    weather: nullableString(value, 'weather'),
    continuity: parseShotContinuity(value.continuity),
    videoSettings: parseShotVideoSettings(value.videoSettings),
    candidates: arrayField(value, 'candidates')
      .map(parseCandidate)
      .filter(isPresent)
  }
}

function parseShotContinuity(value: RemoteValue): ShotContinuity | null {
  if (!isRemoteObject(value)) return null
  const transition = ['auto', 'continuous_action', 'match_action', 'hard_cut', 'time_jump', 'location_jump', 'none'].includes(String(value.transition))
    ? value.transition as ShotTransition
    : null
  if (!transition) return null
  return {
    transition,
    fromShotId: nullableString(value, 'fromShotId'),
    startState: parseShotContinuityState(value.startState),
    endState: parseShotContinuityState(value.endState)
  }
}

function parseShotContinuityState(value: RemoteValue): ShotContinuityState | null {
  if (!isRemoteObject(value)) return null
  return {
    summary: nullableString(value, 'summary'),
    environment: nullableString(value, 'environment'),
    subjects: arrayField(value, 'subjects').flatMap((item) => {
      if (!isRemoteObject(item)) return []
      const assetId = stringField(item, 'assetId')
      if (!assetId) return []
      return [{
        assetId,
        visible: typeof item.visible === 'boolean' ? item.visible : null,
        location: nullableString(item, 'location'),
        pose: nullableString(item, 'pose'),
        actionPhase: nullableString(item, 'actionPhase'),
        facing: nullableString(item, 'facing'),
        screenPosition: nullableString(item, 'screenPosition'),
        heldPropAssetIds: arrayField(item, 'heldPropAssetIds').filter((id): id is string => typeof id === 'string'),
        wardrobe: nullableString(item, 'wardrobe'),
        emotion: nullableString(item, 'emotion')
      }]
    })
  }
}

function parseShotVideoSettings(value: RemoteValue): ShotVideoSettings | null {
  if (!isRemoteObject(value)) return null
  return {
    generatorId: nullableString(value, 'generatorId'),
    model: nullableString(value, 'model'),
    resolution: nullableString(value, 'resolution'),
    aspectRatio: nullableString(value, 'aspectRatio'),
    fps: numberField(value, 'fps'),
    takeCount: numberField(value, 'takeCount'),
    referenceAssetIds: arrayField(value, 'referenceAssetIds').filter(
      (item): item is string => typeof item === 'string'
    ),
    referenceImageCandidateIds: arrayField(
      value,
      'referenceImageCandidateIds'
    ).filter(
      (item): item is string => typeof item === 'string'
    )
  }
}

function parseCandidate(value: RemoteValue): Candidate | null {
  if (!isRemoteObject(value)) return null
  const id = stringField(value, 'id')
  const label = stringField(value, 'label')
  const kind =
    value.kind === 'image' ||
    value.kind === 'video' ||
    value.kind === 'audio'
      ? value.kind
      : null
  if (!id || !label || !kind) return null
  return {
    id,
    label,
    kind,
    selected: value.selected === true,
    fileUrl: nullableString(value, 'fileUrl'),
    workspacePath: nullableString(value, 'workspacePath'),
    originalName: nullableString(value, 'originalName'),
    mimeType: nullableString(value, 'mimeType'),
    size: numberField(value, 'size'),
    sha256: nullableString(value, 'sha256'),
    prompt: nullableString(value, 'prompt'),
    providerReceipt: parseProviderReceipt(value.providerReceipt),
    assetReference: parseAssetReference(value.assetReference)
  }
}

export function productionActionDocument(
  production: ProductionView
): RemoteObject {
  return JSON.parse(
    JSON.stringify({
      sourceSynopsis: production.sourceSynopsis,
      adaptationGoal: production.adaptationGoal,
      visualStyle: production.visualStyle,
      ...(production.audience ? { audience: production.audience } : {}),
      sourceMaterials: production.sourceMaterials,
      ...(production.storyPlan ? { storyPlan: production.storyPlan } : {}),
      episodes: production.episodes.map((episode) => ({
        id: episode.id,
        order: episode.order,
        title: episode.title,
        summary: episode.summary,
        script: episode.script,
        ...(episode.targetDurationSeconds
          ? { targetDurationSeconds: episode.targetDurationSeconds }
          : {})
      })),
      assets: production.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        description: asset.description,
        prompt: asset.prompt,
        ...(asset.negativePrompt
          ? { negativePrompt: asset.negativePrompt }
          : {}),
        ...(asset.continuityNotes
          ? { continuityNotes: asset.continuityNotes }
          : {}),
        ...(hasAssetCategoryDetails(asset.categoryDetails)
          ? { categoryDetails: compactAssetCategoryDetails(asset.categoryDetails) }
          : {}),
        candidates: asset.candidates.map(serializeCandidate)
      })),
      characters: production.characters.map((character) => {
        return {
          id: character.id,
          name: character.name,
          ...(character.role ? { role: character.role } : {}),
          ...(character.visualDescription
            ? { visualDescription: character.visualDescription }
            : {}),
          ...(character.voiceReference?.url?.trim() &&
          character.voiceReference?.label?.trim()
            ? {
                voiceReference: {
                  url: character.voiceReference.url.trim(),
                  label: character.voiceReference.label.trim(),
                  ...(character.voiceReference.license?.trim()
                    ? { license: character.voiceReference.license.trim() }
                    : {}),
                  ...(character.voiceReference.sourceUrl?.trim()
                    ? { sourceUrl: character.voiceReference.sourceUrl.trim() }
                    : {}),
                  ...(character.voiceReference.workspacePath?.trim()
                    ? { workspacePath: character.voiceReference.workspacePath.trim() }
                    : {}),
                  ...(character.voiceReference.originalName?.trim()
                    ? { originalName: character.voiceReference.originalName.trim() }
                    : {}),
                  ...(character.voiceReference.mimeType?.trim()
                    ? { mimeType: character.voiceReference.mimeType.trim() }
                    : {}),
                  ...(character.voiceReference.size
                    ? { size: character.voiceReference.size }
                    : {})
                }
              }
            : {})
        }
      }),
      scenes: production.scenes.map((scene) => ({
        id: scene.id,
        ...(scene.episodeId ? { episodeId: scene.episodeId } : {}),
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
          ...(shot.dialogueType
            ? { dialogueType: shot.dialogueType }
            : {}),
          ...(shot.soundEffects.length
            ? { soundEffects: shot.soundEffects }
            : {}),
          ...(shot.generationPrompt
            ? { generationPrompt: shot.generationPrompt }
            : {}),
          ...(shot.emotion ? { emotion: shot.emotion } : {}),
          ...(shot.lens ? { lens: shot.lens } : {}),
          ...(shot.lighting ? { lighting: shot.lighting } : {}),
          ...(shot.colorTone ? { colorTone: shot.colorTone } : {}),
          ...(shot.weather ? { weather: shot.weather } : {}),
          ...(shot.continuity ? { continuity: compactShotContinuity(shot.continuity) } : {}),
          ...(shot.videoSettings
            ? {
                videoSettings: {
                  ...(shot.videoSettings.generatorId
                    ? { generatorId: shot.videoSettings.generatorId }
                    : {}),
                  ...(shot.videoSettings.model
                    ? { model: shot.videoSettings.model }
                    : {}),
                  ...(shot.videoSettings.resolution
                    ? { resolution: shot.videoSettings.resolution }
                    : {}),
                  ...(shot.videoSettings.aspectRatio
                    ? { aspectRatio: shot.videoSettings.aspectRatio }
                    : {}),
                  ...(shot.videoSettings.fps
                    ? { fps: shot.videoSettings.fps }
                    : {}),
                  ...(shot.videoSettings.takeCount
                    ? { takeCount: shot.videoSettings.takeCount }
                    : {}),
                  ...(shot.videoSettings.referenceAssetIds.length
                    ? {
                        referenceAssetIds:
                          shot.videoSettings.referenceAssetIds
                      }
                    : {}),
                  ...(shot.videoSettings.referenceImageCandidateIds?.length
                    ? {
                        referenceImageCandidateIds:
                          shot.videoSettings.referenceImageCandidateIds
                      }
                    : {})
                }
              }
            : {}),
          durationSeconds: shot.durationSeconds,
          candidates: shot.candidates.map(serializeCandidate)
        }))
      }))
    })
  ) as RemoteObject
}

function compactShotContinuity(continuity: ShotContinuity) {
  const state = (value: ShotContinuityState | null) => value ? {
    ...(value.summary ? { summary: value.summary } : {}),
    ...(value.environment ? { environment: value.environment } : {}),
    ...(value.subjects.length ? { subjects: value.subjects.map((subject) => ({
      assetId: subject.assetId,
      ...(subject.visible != null ? { visible: subject.visible } : {}),
      ...(subject.location ? { location: subject.location } : {}),
      ...(subject.pose ? { pose: subject.pose } : {}),
      ...(subject.actionPhase ? { actionPhase: subject.actionPhase } : {}),
      ...(subject.facing ? { facing: subject.facing } : {}),
      ...(subject.screenPosition ? { screenPosition: subject.screenPosition } : {}),
      ...(subject.heldPropAssetIds.length ? { heldPropAssetIds: subject.heldPropAssetIds } : {}),
      ...(subject.wardrobe ? { wardrobe: subject.wardrobe } : {}),
      ...(subject.emotion ? { emotion: subject.emotion } : {})
    })) } : {})
  } : undefined
  return {
    transition: continuity.transition,
    ...(continuity.fromShotId ? { fromShotId: continuity.fromShotId } : {}),
    ...(continuity.startState ? { startState: state(continuity.startState) } : {}),
    ...(continuity.endState ? { endState: state(continuity.endState) } : {})
  }
}

function hasAssetCategoryDetails(details: AssetCategoryDetails) {
  return Object.values(details).some((value) => Boolean(value))
}

function compactAssetCategoryDetails(details: AssetCategoryDetails) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => Boolean(value))
  )
}

function serializeCandidate(candidate: Candidate) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    selected: candidate.selected,
    ...(candidate.fileUrl ? { fileUrl: candidate.fileUrl } : {}),
    ...(candidate.workspacePath
      ? { workspacePath: candidate.workspacePath }
      : {}),
    ...(candidate.prompt ? { prompt: candidate.prompt } : {}),
    ...(candidate.providerReceipt
      ? { providerReceipt: candidate.providerReceipt }
      : {}),
    ...(candidate.originalName
      ? { originalName: candidate.originalName }
      : {}),
    ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
    ...(candidate.size ? { size: candidate.size } : {}),
    ...(candidate.sha256 ? { sha256: candidate.sha256 } : {}),
    ...(candidate.assetReference
      ? { assetReference: candidate.assetReference }
      : {})
  }
}

function parseAssetReference(value: RemoteValue): AssetReference | null {
  if (!isRemoteObject(value)) return null
  if (value.type === 'general') return { type: 'general' }
  if (
    value.type === 'continuity_view' &&
    (
      value.key === 'front' ||
      value.key === 'three_quarter' ||
      value.key === 'profile' ||
      value.key === 'back' ||
      value.key === 'wide' ||
      value.key === 'reverse' ||
      value.key === 'detail' ||
      value.key === 'alternate'
    )
  ) {
    return { type: value.type, key: value.key }
  }
  if (
    value.type === 'expression' &&
    (
      value.key === 'neutral' ||
      value.key === 'happy' ||
      value.key === 'sad' ||
      value.key === 'angry'
    )
  ) {
    return { type: value.type, key: value.key }
  }
  return null
}

function parseProviderReceipt(
  value: RemoteValue
): Candidate['providerReceipt'] {
  if (!isRemoteObject(value)) return null
  const provider = stringField(value, 'provider')
  const taskId = stringField(value, 'taskId')
  const status = stringField(value, 'status')
  if (!provider || !taskId || !status) return null
  return {
    provider,
    taskId,
    status,
    model: nullableString(value, 'model')
  }
}

function stringField(value: RemoteObject, key: string) {
  const field = value[key]
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function nullableString(value: RemoteObject, key: string) {
  const field = value[key]
  return typeof field === 'string' ? field : null
}

function numberField(value: RemoteObject, key: string) {
  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

function arrayField(value: RemoteObject, key: string): RemoteValue[] {
  const field = value[key]
  return Array.isArray(field) ? field : []
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}
