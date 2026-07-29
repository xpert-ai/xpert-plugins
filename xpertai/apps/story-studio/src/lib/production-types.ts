export type StoryJsonPrimitive = string | number | boolean | null
export type StoryJsonValue = StoryJsonPrimitive | StoryJsonObject | StoryJsonValue[]
export interface StoryJsonObject {
  [key: string]: StoryJsonValue | undefined
}

export type StoryMediaKind = 'image' | 'video' | 'audio'

export interface StoryPortableFileReference extends StoryJsonObject {
  source: 'platform.workspace.files'
  filePath: string
  workspacePath: string
  catalog?: 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts' | null
  scopeId?: string | null
  tenantId?: string | null
  userId?: string | null
  projectId?: string | null
  xpertId?: string | null
  isolateByUser?: boolean | null
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  size?: number | null
}

export interface StoryCharacter extends StoryJsonObject {
  id: string
  name: string
  role?: string
  visualDescription?: string
  voiceReference?: StoryVoiceReference
}

export interface StoryVoiceReference extends StoryJsonObject {
  url: string
  label: string
  license?: string
  sourceUrl?: string
}

export interface StoryMediaCandidate extends StoryJsonObject {
  id: string
  kind: StoryMediaKind
  label: string
  selected?: boolean
  fileUrl?: string
  workspacePath?: string
  prompt?: string
  providerReceipt?: StoryJsonObject
  originalName?: string
  mimeType?: string
  size?: number
  sha256?: string
  fileReference?: StoryPortableFileReference
}

export interface StorySourceMaterial extends StoryJsonObject {
  id: string
  title: string
  type: 'text' | 'file' | 'url'
  excerpt: string
  status: 'imported' | 'reviewed'
}

export interface StoryBeat extends StoryJsonObject {
  id: string
  title: string
  summary: string
  purpose: string
}

export interface StoryPlan extends StoryJsonObject {
  logline: string
  theme: string
  tone: string
  beats: StoryBeat[]
}

export interface StoryEpisode extends StoryJsonObject {
  id: string
  order: number
  title: string
  summary: string
  script: string
  targetDurationSeconds?: number
}

export interface StoryAsset extends StoryJsonObject {
  id: string
  kind: 'character' | 'location' | 'prop' | 'style'
  name: string
  description: string
  prompt: string
  candidates?: StoryMediaCandidate[]
}

export interface StoryShot extends StoryJsonObject {
  id: string
  title: string
  composition: string
  action: string
  camera: string
  dialogue?: string
  dialogueSpeakerId?: string
  dialogueType?: 'dialogue' | 'voice_over' | 'off_screen'
  soundEffects?: string[]
  durationSeconds: number
  candidates?: StoryMediaCandidate[]
}

export interface StoryScene extends StoryJsonObject {
  id: string
  order: number
  title: string
  summary: string
  location?: string
  timeOfDay?: string
  shots: StoryShot[]
}

export interface StoryProductionDocument extends StoryJsonObject {
  sourceSynopsis: string
  adaptationGoal: string
  visualStyle: string
  audience?: string
  sourceMaterials?: StorySourceMaterial[]
  storyPlan?: StoryPlan
  episodes?: StoryEpisode[]
  assets?: StoryAsset[]
  characters: StoryCharacter[]
  scenes: StoryScene[]
}

export interface SaveStoryProductionInput {
  projectId: string
  operationId: string
  baseRevision: number
  production: StoryProductionDocument
  changeSummary: string
}

export interface GetStoryProductionInput {
  projectId: string
}

export interface AttachGeneratedVideoInput {
  projectId: string
  operationId: string
  baseRevision: number
  sceneId: string
  shotId: string
  candidateId: string
  label: string
  file: string | StoryJsonObject
  prompt?: string
  providerReceipt: {
    provider: 'seedream_aigc'
    taskId: string
    model?: string
    status: string
  }
  select?: boolean
  changeSummary: string
}

export interface AttachAssetImageInput {
  projectId: string
  operationId: string
  baseRevision: number
  assetId: string
  candidateId: string
  label: string
  prompt?: string
  providerReceipt: {
    provider: 'seedream_aigc' | 'manual_upload'
    taskId: string
    model?: string
    status: string
  }
  select?: boolean
  changeSummary: string
}

export interface AttachGeneratedAssetImageInput
  extends AttachAssetImageInput {
  file: string | StoryJsonObject
}

export interface StoryProductionSummary {
  id: string
  projectId: string
  projectRevision: number
  documentRevision: number
  sourceSynopsis: string
  adaptationGoal: string
  visualStyle: string
  audience: string | null
  sourceMaterials: StorySourceMaterial[]
  storyPlan: StoryPlan | null
  episodes: StoryEpisode[]
  assets: StoryAsset[]
  characters: StoryCharacter[]
  scenes: StoryScene[]
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
  totalDurationSeconds: number
  updatedAt: string | null
}
