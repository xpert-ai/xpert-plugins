import type { RemotePayloadObject, RemotePayloadValue } from './runtime'
import type { MotionVideoComposition } from './video-renderer'

export const TABS = ['library', 'html', 'video'] as const
export const MOTION_TRIGGERS = ['load', 'scroll', 'hover', 'click'] as const
export const MOTION_VERBS = [
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom',
  'rotate',
  'blur',
  'pop',
  'pulse',
  'shake',
  'wobble',
  'sink'
] as const
export const KEYFRAME_PROPS = ['opacity', 'x', 'y', 'scale', 'rotate', 'blur'] as const

export const DEVICE_OPTIONS = [
  { value: 'desktop', labelKey: 'deviceDesktop' },
  { value: 'tablet', labelKey: 'deviceTablet' },
  { value: 'mobile', labelKey: 'deviceMobile' }
] as const
export const RECIPE_SURFACE_OPTIONS = [
  { value: 'all', labelKey: 'filterAllSurfaces' },
  { value: 'web', labelKey: 'filterWeb' },
  { value: 'video', labelKey: 'filterVideo' }
] as const
export const RECIPE_TARGET_OPTIONS = [
  { value: 'all', labelKey: 'filterAllTargets' },
  { value: 'text', labelKey: 'filterText' },
  { value: 'button', labelKey: 'filterButton' },
  { value: 'card', labelKey: 'filterCard' },
  { value: 'image', labelKey: 'filterImage' },
  { value: 'video', labelKey: 'filterVideoLayer' },
  { value: 'background', labelKey: 'filterBackground' }
] as const
export const RECIPE_STATUS_OPTIONS = [
  { value: 'all', labelKey: 'filterAllStatuses' },
  { value: 'ready', labelKey: 'filterReady' }
] as const
export const KINETIC_OPTIONS = [
  { value: 'none', labelKey: 'kineticNone' },
  { value: 'word-rise', labelKey: 'kineticWordRise' },
  { value: 'char-rise', labelKey: 'kineticCharRise' },
  { value: 'char-pop', labelKey: 'kineticCharPop' },
  { value: 'typewriter', labelKey: 'kineticTypewriter' }
] as const
export const TRANSITION_OPTIONS = [
  { value: 'cut', labelKey: 'transitionCut' },
  { value: 'dissolve', labelKey: 'transitionDissolve' },
  { value: 'push', labelKey: 'transitionPush' },
  { value: 'fade', labelKey: 'transitionFade' }
] as const

export type TabKey = (typeof TABS)[number]
export type MotionSurface = 'web' | 'video'

export type ProjectSummary = {
  id: string
  title: string
  brief?: string | null
  surface?: MotionSurface
  status?: string
  selectedRecipeIds?: string[]
  currentVersionNumber?: number
  workingCopyRevision?: number
  lastExportPath?: string | null
  lastExportKind?: string | null
  artifactChecksum?: string | null
  updatedAt?: string | null
  createdAt?: string | null
}

export type RecipeSummary = {
  id: string
  name: string
  category?: string
  cat?: string
  surfaces?: string[]
  target?: string[]
  runtime?: string[]
  export?: string[]
  tags?: string[]
  desc?: string
  description?: string
  status?: string
  preview?: string | null
}

export type VersionSummary = {
  id: string
  versionNumber?: number
  sourceType?: string
  surface?: MotionSurface
  selectedRecipeIds?: string[]
  artifactChecksum?: string | null
  changeSummary?: string | null
  createdAt?: string | null
}

export type ExportSummary = {
  id: string
  versionId?: string | null
  kind?: string
  filePath?: string | null
  fileUrl?: string | null
  mimeType?: string | null
  size?: number | null
  checksum?: string | null
  changeSummary?: string | null
  createdAt?: string | null
}

export type LogSummary = {
  id: string
  action?: string
  actorType?: string
  message?: string | null
  errorMessage?: string | null
  createdAt?: string | null
}

export type ProjectDetail = {
  item: ProjectSummary
  workingCopy?: {
    html?: string | null
    videoComposition?: MotionVideoComposition | null
    componentSelection?: RemotePayloadObject | null
    layerSelection?: RemotePayloadObject | null
    workingCopyRevision?: number
    artifactChecksum?: string | null
  }
  currentVersion?: VersionSummary | null
  versions?: VersionSummary[]
  exports?: ExportSummary[]
  logs?: LogSummary[]
}

export type PagedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type MotionViewData = {
  projects: PagedResult<ProjectSummary>
  recipes: PagedResult<RecipeSummary>
  styles: RemotePayloadValue[]
  detail: ProjectDetail | null
  libraryStats?: {
    recipes?: number
    designSystems?: number
    htmlTemplates?: number
    videoTemplates?: number
    icons?: number
  }
}

export type HtmlControls = {
  selector: string
  trigger: (typeof MOTION_TRIGGERS)[number]
  verb: (typeof MOTION_VERBS)[number]
  duration: number
  delay: number
  distance: number
  tracksJson: string
}

export type RecipeFilters = {
  surface: string
  target: string
  status: string
}

export type HeaderContext = {
  title: string
  dirty: boolean
  statusLabel: string
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onOpenProjects: () => void
  onOpenVersions: () => void
  onOpenExports: () => void
}
