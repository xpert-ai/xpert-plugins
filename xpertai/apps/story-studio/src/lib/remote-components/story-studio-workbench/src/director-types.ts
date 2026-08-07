import type { MessageKey } from './i18n'
import type { ProjectSummary } from './project-data'
import type {
  Asset,
  HandoffView,
  ProductionView
} from './production-data'
import type {
  VideoGenerationTask,
  VideoGeneratorCatalog
} from './video-generation-data'
import type { AssetReferenceSet } from './asset-reference-data'

export type DirectorTranslator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export type DirectorWorkbenchProps = {
  projects: ProjectSummary[]
  selected: ProjectSummary | null
  production: ProductionView | null
  productionPersisted: boolean
  handoff: HandoffView | null
  activeStage: number
  busy: boolean
  generating: boolean
  videoGenerators: VideoGeneratorCatalog | null
  videoTasks: VideoGenerationTask[]
  handingOff: boolean
  t: DirectorTranslator
  onNavigate: (stage: 4 | 5 | 6 | 8) => void
  onRefresh: () => void
  onLoadDemo: () => void
  onNewProject: () => void
  onSelectProject: (projectId: string) => void
  onCommitProduction: (
    stage: 4 | 5 | 6,
    draft: ProductionView,
    changeSummary: string,
    options?: { silent?: boolean }
  ) => Promise<boolean>
  onRequestScriptSuggestion: (input: {
    episodeId: string
    sceneId?: string
    shotId?: string
    focusText: string
  }) => void
  onGenerateAsset: (asset: Asset, referenceSet: AssetReferenceSet) => void
  onUploadAsset: (asset: Asset, file: File) => void
  onUploadShotReference: (
    sceneId: string,
    shotId: string,
    prompt: string,
    file: File
  ) => void
  onLockAsset: (assetId: string, candidateId: string) => void
  onGenerateTakes: (input: {
    sceneId: string
    shotId: string
    prompt: string
    toolsetId: string
    model: string
    resolution: string
    aspectRatio: string
    fps: number
    takeCount: number
    referenceAssetIds: string[]
    redoScope?: string
  }) => void
  onSetVideoGenerator: (toolsetId: string) => void
  onCancelVideoTask: (taskId: string) => void
  onRetryVideoTask: (taskId: string) => void
  onSelectTake: (
    sceneId: string,
    shotId: string,
    candidateId: string
  ) => void
  onHandoff: () => void
}

export const DIRECTOR_STAGE = {
  script: 4,
  assets: 5,
  storyboard: 6,
  assembly: 8
} as const

export type DirectorStage =
  (typeof DIRECTOR_STAGE)[keyof typeof DIRECTOR_STAGE]
