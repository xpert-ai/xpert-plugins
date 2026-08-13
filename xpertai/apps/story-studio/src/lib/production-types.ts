export type StoryJsonPrimitive = string | number | boolean | null
export type StoryJsonValue =
  | StoryJsonPrimitive
  | StoryJsonObject
  | StoryJsonValue[]
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

export interface StoryVoiceReference extends StoryJsonObject {
  url: string
  label: string
  license?: string
  sourceUrl?: string
  workspacePath?: string
  originalName?: string
  mimeType?: string
  size?: number
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
  assetReference?: StoryAssetReference
}

export type StoryAssetReference =
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

export type StoryAdaptationSuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'dismissed'

export interface StoryAdaptationSuggestion extends StoryJsonObject {
  id: string
  episodeId: string
  sceneId?: string
  shotId?: string
  originalText: string
  suggestedText: string
  reason: string
  status: StoryAdaptationSuggestionStatus
  createdBy: 'assistant' | 'user'
  createdAt: string
}

export interface StoryPlan extends StoryJsonObject {
  logline: string
  theme: string
  tone: string
  beats: StoryBeat[]
  adaptationSuggestions?: StoryAdaptationSuggestion[]
}

export interface StoryEpisode extends StoryJsonObject {
  id: string
  order: number
  title: string
  summary: string
  script: string
  targetDurationSeconds?: number
}

export interface StoryAssetBase extends StoryJsonObject {
  id: string
  name: string
  description: string
  prompt: string
  negativePrompt?: string
  continuityNotes?: string
  categoryDetails?: StoryAssetCategoryDetails
  candidates?: StoryMediaCandidate[]
}

export interface StoryCharacterAsset extends StoryAssetBase {
  kind: 'character'
  role?: string
  visualDescription?: string
  voiceReference?: StoryVoiceReference
}

export interface StoryProductionAsset extends StoryAssetBase {
  kind: 'location' | 'prop' | 'style'
}

export type StoryAsset = StoryCharacterAsset | StoryProductionAsset

export interface StoryAssetCategoryDetails extends StoryJsonObject {
  identity?: string
  appearance?: string
  wardrobe?: string
  voice?: string
  environment?: string
  lighting?: string
  material?: string
  condition?: string
  storyFunction?: string
  palette?: string
  lens?: string
  continuity?: string
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
  generationPrompt?: string
  emotion?: string
  lens?: string
  lighting?: string
  colorTone?: string
  weather?: string
  continuity?: StoryShotContinuity
  videoSettings?: StoryShotVideoSettings
  durationSeconds: number
  candidates?: StoryMediaCandidate[]
}

export const STORY_SHOT_TRANSITIONS = [
  'auto',
  'continuous_action',
  'match_action',
  'hard_cut',
  'time_jump',
  'location_jump',
  'none'
] as const

export type StoryShotTransition = (typeof STORY_SHOT_TRANSITIONS)[number]

export interface StoryShotContinuitySubjectState extends StoryJsonObject {
  assetId: string
  visible?: boolean
  location?: string
  pose?: string
  actionPhase?: string
  facing?: string
  screenPosition?: string
  heldPropAssetIds?: string[]
  wardrobe?: string
  emotion?: string
}

export interface StoryShotContinuityState extends StoryJsonObject {
  summary?: string
  environment?: string
  subjects?: StoryShotContinuitySubjectState[]
}

export interface StoryShotContinuity extends StoryJsonObject {
  transition: StoryShotTransition
  fromShotId?: string
  startState?: StoryShotContinuityState
  endState?: StoryShotContinuityState
}

export interface StoryShotVideoSettings extends StoryJsonObject {
  generatorId?: string
  model?: string
  resolution?: string
  aspectRatio?: string
  fps?: number
  takeCount?: number
  referenceAssetIds?: string[]
  referenceImageCandidateIds?: string[]
}

export interface StoryScene extends StoryJsonObject {
  id: string
  episodeId?: string
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
  scenes: StoryScene[]
}

export interface SaveStoryProductionInput {
  projectId: string
  operationId: string
  baseRevision: number
  production: StoryProductionDocument
  changeSummary: string
  operationFingerprint?: string
}

export interface GetStoryProductionInput {
  projectId: string
}

export interface GetStoryProductionContextInput {
  projectId: string
  expectedRevision?: number
}

export interface InitializeStoryProductionInput {
  projectId: string
  operationId: string
  baseRevision: number
  sourceSynopsis: string
  adaptationGoal: string
  visualStyle: string
  audience?: string
  changeSummary: string
}

export interface UpdateStoryProductionBriefInput {
  projectId: string
  operationId: string
  baseRevision: number
  sourceSynopsis?: string
  adaptationGoal?: string
  visualStyle?: string
  audience?: string | null
  changeSummary: string
}

export interface UpsertStoryProductionCharacterInput {
  projectId: string
  operationId: string
  baseRevision?: number
  character: {
    id: string
    name: string
    description: string
    prompt: string
    role?: string
    visualDescription?: string
    negativePrompt?: string
    continuityNotes?: string
    categoryDetails?: StoryAssetCategoryDetails
  }
  changeSummary: string
}

export interface UpsertStoryProductionEpisodeInput {
  projectId: string
  operationId: string
  baseRevision?: number
  episode: StoryEpisode
  changeSummary: string
}

export interface UpsertStoryProductionAssetInput {
  projectId: string
  operationId: string
  baseRevision?: number
  asset: {
    id: string
    kind: 'location' | 'prop' | 'style'
    name: string
    description: string
    prompt: string
    negativePrompt?: string
    continuityNotes?: string
    categoryDetails?: StoryAssetCategoryDetails
  }
  changeSummary: string
}

export interface UpsertStoryProductionSceneMetadataInput {
  projectId: string
  operationId: string
  baseRevision?: number
  scene: {
    id: string
    episodeId?: string | null
    order: number
    title: string
    summary: string
    location?: string | null
    timeOfDay?: string | null
  }
  changeSummary: string
}

export interface ValidateStoryProductionInput {
  projectId: string
  expectedRevision?: number
}

export interface StoryShotDialogueInput extends StoryJsonObject {
  text: string
  speakerId?: string
  type?: 'dialogue' | 'voice_over' | 'off_screen'
}

export interface UpsertStoryProductionShotFields extends StoryJsonObject {
  id: string
  title?: string
  composition?: string
  action?: string
  camera?: string
  dialogue?: StoryShotDialogueInput | null
  soundEffects?: string[]
  generationPrompt?: string
  emotion?: string
  lens?: string
  lighting?: string
  colorTone?: string
  weather?: string
  durationSeconds?: number
}

export interface UpsertStoryProductionSceneInput {
  projectId: string
  operationId: string
  baseRevision: number
  scene: {
    id: string
    episodeId?: string
    order: number
    title: string
    summary: string
    location?: string
    timeOfDay?: string
    shots: Array<
      UpsertStoryProductionShotFields & {
        title: string
        composition: string
        action: string
        camera: string
        durationSeconds: number
      }
    >
  }
  changeSummary: string
}

export interface StartStoryProductionInput {
  projectId: string
  operationId: string
  baseRevision: number
  sourceSynopsis: string
  adaptationGoal: string
  visualStyle: string
  audience?: string
  sourceMaterials?: StorySourceMaterial[]
  storyPlan?: StoryPlan
  episodes?: StoryEpisode[]
  assets?: StoryAsset[]
  firstScene: UpsertStoryProductionSceneInput['scene']
  changeSummary: string
}

export interface UpsertStoryProductionShotInput {
  projectId: string
  operationId: string
  baseRevision?: number
  sceneId: string
  insertAfterShotId?: string
  shot: UpsertStoryProductionShotFields
  changeSummary: string
}

export interface ListStoryAdaptationSuggestionsInput {
  projectId: string
  expectedRevision?: number
  status?: StoryAdaptationSuggestionStatus
  page?: number
  pageSize?: number
}

export interface CreateStoryAdaptationSuggestionInput {
  projectId: string
  operationId: string
  baseRevision: number
  suggestionId: string
  episodeId: string
  sceneId?: string
  shotId?: string
  originalText: string
  suggestedText: string
  reason: string
  changeSummary: string
}

export interface UpdateStoryAdaptationSuggestionInput {
  projectId: string
  operationId: string
  baseRevision: number
  suggestionId: string
  suggestedText?: string
  reason?: string
  status?: StoryAdaptationSuggestionStatus
  changeSummary: string
}

export interface DeleteStoryAdaptationSuggestionInput {
  projectId: string
  operationId: string
  baseRevision: number
  suggestionId: string
  changeSummary: string
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
  assetReference?: StoryAssetReference
  prompt?: string
  providerReceipt: {
    provider: 'seedream_aigc' | 'manual_upload'
    taskId: string
    model?: string
    status: string
  }
  select?: boolean
  replaceReference?: boolean
  changeSummary: string
}

export interface AttachGeneratedAssetImageInput
  extends Omit<AttachAssetImageInput, 'assetReference'> {
  assetReference: StoryAssetReference
  file: string | StoryJsonObject
}

export interface AttachShotReferenceImageInput {
  projectId: string
  operationId: string
  baseRevision: number
  sceneId: string
  shotId: string
  candidateId: string
  label: string
  prompt?: string
  providerReceipt: {
    provider: 'manual_upload'
    taskId: string
    status: string
  }
  changeSummary: string
}

export interface UploadStoryVoiceReferenceInput {
  projectId: string
  assetId: string
  referenceId: string
  label: string
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
