import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'

export const VIDEO_GENERATION_PERMISSION_SERVICE_TOKEN =
  'XPERT_PLUGIN_VIDEO_GENERATION_PERMISSION_SERVICE'

export const STORY_VIDEO_GENERATOR_FAMILIES = [
  'seedance',
  'veo',
  'kling'
] as const

export type StoryVideoGeneratorFamily =
  (typeof STORY_VIDEO_GENERATOR_FAMILIES)[number]

export type StoryVideoGenerationMode =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'

export interface StoryVideoGenerationReference {
  kind: 'image' | 'video' | 'audio'
  purpose?: 'reference' | 'first_frame' | 'last_frame'
  file: WorkspacePortableFileReference
}

export interface StoryVideoModelInputCapabilities {
  referenceImages?: { maxItems: number }
  referenceVideos?: { maxItems: number }
  referenceAudios?: { maxItems: number }
  initialFrame?: boolean
  lastFrame?: boolean
}

export interface StoryVideoGeneratorSummary {
  id: string
  family: StoryVideoGeneratorFamily
  name: string
  displayName: string
  linkedToXpert: boolean
  modes: StoryVideoGenerationMode[]
  models: Array<{
    id: string
    label: string
    modes?: StoryVideoGenerationMode[]
    inputs?: StoryVideoModelInputCapabilities
  }>
  defaultModel: string
  resolutions: string[]
  aspectRatios: string[]
  durationSeconds: { min: number; max: number; default: number }
  supportsAudio: boolean
  supportsCancel: boolean
}

export interface StoryVideoGenerationPlatformService {
  listGenerators(input: {
    xpertId: string
  }): Promise<{ generators: StoryVideoGeneratorSummary[] }>
  submit(input: {
    xpertId: string
    toolsetId: string
    projectId?: string | null
    prompt: string
    references?: StoryVideoGenerationReference[] | null
    /** Compatibility with protocol v1 providers. */
    inputImage?: WorkspacePortableFileReference | null
    model?: string | null
    resolution?: string | null
    aspectRatio?: string | null
    durationSeconds?: number | null
    generateAudio?: boolean | null
  }): Promise<{
    providerTaskId: string
    status: string
    model?: string
    mode?: StoryVideoGenerationMode
    acceptedReferenceCount?: number
  }>
  query(input: {
    xpertId: string
    toolsetId: string
    projectId?: string | null
    providerTaskId: string
  }): Promise<{
    providerTaskId: string
    status: string
    completed: boolean
    failed: boolean
    model?: string
    errorCode?: string
    errorMessage?: string
    outputFile?: WorkspacePortableFileReference
  }>
  cancel(input: {
    xpertId: string
    toolsetId: string
    providerTaskId: string
  }): Promise<{
    providerTaskId: string
    supported: boolean
    cancelled: boolean
    status: string
  }>
}
