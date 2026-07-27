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
  candidates: Candidate[]
}

export type VoiceReference = {
  url: string
  label: string
  license: string | null
  sourceUrl: string | null
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
  durationSeconds: number
  candidates: Candidate[]
}

export type Scene = {
  id: string
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
    beats: value.beats.map(parseBeat).filter(isPresent)
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
    candidates: arrayField(value, 'candidates')
      .map(parseCandidate)
      .filter(isPresent)
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
    sourceUrl: nullableString(value, 'sourceUrl')
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
    candidates: arrayField(value, 'candidates')
      .map(parseCandidate)
      .filter(isPresent)
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
    providerReceipt: parseProviderReceipt(value.providerReceipt)
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
        candidates: asset.candidates.map(serializeCandidate)
      })),
      characters: production.characters.map((character) => ({
        id: character.id,
        name: character.name,
        ...(character.role ? { role: character.role } : {}),
        ...(character.visualDescription
          ? { visualDescription: character.visualDescription }
          : {}),
        ...(character.voiceReference
          ? {
              voiceReference: {
                url: character.voiceReference.url,
                label: character.voiceReference.label,
                ...(character.voiceReference.license
                  ? { license: character.voiceReference.license }
                  : {}),
                ...(character.voiceReference.sourceUrl
                  ? { sourceUrl: character.voiceReference.sourceUrl }
                  : {})
              }
            }
          : {})
      })),
      scenes: production.scenes.map((scene) => ({
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
          ...(shot.dialogueType
            ? { dialogueType: shot.dialogueType }
            : {}),
          ...(shot.soundEffects.length
            ? { soundEffects: shot.soundEffects }
            : {}),
          durationSeconds: shot.durationSeconds,
          candidates: shot.candidates.map(serializeCandidate)
        }))
      }))
    })
  ) as RemoteObject
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
    ...(candidate.sha256 ? { sha256: candidate.sha256 } : {})
  }
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
