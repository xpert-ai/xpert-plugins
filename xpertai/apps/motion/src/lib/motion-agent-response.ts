import type { MotionJsonObject, MotionJsonValue, MotionRecipeDetail, MotionRecipeSummary, MotionVideoComposition, MotionVideoLayer } from './types.js'

export function stringifyAgentToolResult(value: MotionJsonValue | object) {
  return JSON.stringify(value)
}

type ProjectPointer = {
  id?: string
  title?: string
  surface?: string
  videoEngine?: string | null
  status?: string
  currentVersionId?: string | null
  currentVersionNumber?: number | null
  workingCopyRevision?: number | null
  artifactChecksum?: string | null
  lastExportPath?: string | null
  lastExportKind?: string | null
}

type VersionPointer = {
  id?: string
  versionNumber?: number | null
  sourceType?: string | null
  surface?: string | null
  videoEngine?: string | null
  changeSummary?: string | null
  createdAt?: string | Date | null
}

type ExportPointer = {
  id?: string
  versionId?: string | null
  kind?: string | null
  status?: string | null
  backend?: string | null
  progress?: number | null
  stage?: string | null
  filePath?: string | null
  fileUrl?: string | null
  mimeType?: string | null
  size?: number | null
}

type LogPointer = {
  id?: string
  action?: string
  message?: string | null
  errorMessage?: string | null
  createdAt?: string | Date | null
}

type WorkingCopyPointer = {
  html?: string | null
  videoEngine?: string | null
  hyperframesHtml?: string | null
  videoComposition?: MotionVideoComposition | null
  componentSelection?: MotionJsonObject | null
  layerSelection?: MotionJsonObject | null
  workingCopyRevision?: number | null
  artifactChecksum?: string | null
}

type ProjectResult = {
  item?: ProjectPointer
  workingCopy?: WorkingCopyPointer
  currentVersion?: VersionPointer | null
  versions?: VersionPointer[]
  exports?: ExportPointer[]
  logs?: LogPointer[]
}

type MutationResult = {
  success?: boolean
  message?: string
  project?: ProjectPointer | null
  version?: VersionPointer | null
  export?: ExportPointer | null
  exportKind?: string | null
  requiresBrowserExport?: boolean
  recoverable?: boolean
  deletedProjectId?: string | null
  content?: string
}

export function compactSearchRecipesResult(result: { items?: MotionRecipeSummary[]; total?: number; page?: number; pageSize?: number }) {
  const page = positiveNumber(result.page, 1)
  const pageSize = positiveNumber(result.pageSize, result.items?.length ?? 0)
  const total = positiveNumber(result.total, result.items?.length ?? 0)
  return compactObject({
    items: (result.items ?? []).map(compactRecipeSummary),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total
  })
}

export function compactRecipeDetailResult(result: MotionRecipeDetail) {
  return compactObject({
    recipe: compactRecipeSummary(result.summary),
    implementationFiles: result.implementationFiles,
    hasManifest: Boolean(result.manifestText),
    manifestBytes: result.manifestText?.length ?? 0,
    hasSkill: Boolean(result.skillText),
    skillBytes: result.skillText?.length ?? 0
  })
}

export function compactGetProjectResult(result: ProjectResult) {
  const project = compactProjectPointer(result.item)
  return compactObject({
    message: 'Motion project loaded.',
    projectId: project?.id ?? null,
    project,
    workingCopy: compactWorkingCopyPointer(result.workingCopy),
    currentVersion: compactVersionPointer(result.currentVersion),
    versions: (result.versions ?? []).map(compactVersionPointer).filter(Boolean),
    exports: (result.exports ?? []).map(compactExportPointer).filter(Boolean),
    logCount: result.logs?.length ?? 0,
    lastLog: compactLogPointer(result.logs?.[0])
  })
}

export function summarizeMutationResult(result: MutationResult) {
  const project = compactProjectPointer(result.project)
  const version = compactVersionPointer(result.version)
  const exported = compactExportPointer(result.export)
  return compactObject({
    success: result.success ?? true,
    message: result.message ?? 'Motion project was updated.',
    projectId: project?.id ?? result.deletedProjectId ?? null,
    status: project?.status ?? null,
    surface: project?.surface ?? null,
    videoEngine: project?.videoEngine ?? null,
    workingCopyRevision: project?.workingCopyRevision ?? null,
    artifactChecksum: project?.artifactChecksum ?? null,
    currentVersionId: project?.currentVersionId ?? null,
    currentVersionNumber: project?.currentVersionNumber ?? null,
    versionId: version?.id ?? null,
    versionNumber: version?.versionNumber ?? null,
    exportId: exported?.id ?? null,
    exportKind: exported?.kind ?? result.exportKind ?? project?.lastExportKind ?? null,
    exportStatus: exported?.status ?? null,
    exportBackend: exported?.backend ?? null,
    exportPath: exported?.filePath ?? project?.lastExportPath ?? null,
    exportUrl: exported?.fileUrl ?? null,
    requiresBrowserExport: result.requiresBrowserExport,
    recoverable: result.recoverable,
    contentBytes: typeof result.content === 'string' ? result.content.length : undefined,
    contentOmitted: typeof result.content === 'string' ? true : undefined
  })
}

function compactRecipeSummary(recipe: MotionRecipeSummary) {
  return compactObject({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category ?? recipe.cat,
    surfaces: recipe.surfaces ?? recipe.canvas,
    target: recipe.target,
    runtime: recipe.runtime,
    export: recipe.export,
    status: recipe.status,
    description: recipe.desc ?? recipe.description,
    tags: recipe.tags?.slice(0, 8)
  })
}

function compactProjectPointer(project: ProjectPointer | null | undefined) {
  if (!project) {
    return null
  }
  return compactObject({
    id: project.id,
    title: project.title,
    surface: project.surface,
    videoEngine: project.videoEngine,
    status: project.status,
    currentVersionId: project.currentVersionId,
    currentVersionNumber: project.currentVersionNumber,
    workingCopyRevision: project.workingCopyRevision,
    artifactChecksum: project.artifactChecksum,
    lastExportPath: project.lastExportPath,
    lastExportKind: project.lastExportKind
  })
}

function compactVersionPointer(version: VersionPointer | null | undefined) {
  if (!version) {
    return null
  }
  return compactObject({
    id: version.id,
    versionNumber: version.versionNumber,
    sourceType: version.sourceType,
    surface: version.surface,
    videoEngine: version.videoEngine,
    changeSummary: version.changeSummary,
    createdAt: dateString(version.createdAt)
  })
}

function compactExportPointer(record: ExportPointer | null | undefined) {
  if (!record) {
    return null
  }
  return compactObject({
    id: record.id,
    versionId: record.versionId,
    kind: record.kind,
    status: record.status,
    backend: record.backend,
    progress: record.progress,
    stage: record.stage,
    filePath: record.filePath,
    fileUrl: record.fileUrl,
    mimeType: record.mimeType,
    size: record.size
  })
}

function compactWorkingCopyPointer(workingCopy: WorkingCopyPointer | null | undefined) {
  if (!workingCopy) {
    return null
  }
  const html = typeof workingCopy.html === 'string' ? workingCopy.html : ''
  const hyperframesHtml = typeof workingCopy.hyperframesHtml === 'string' ? workingCopy.hyperframesHtml : ''
  const videoSummary = compactVideoCompositionSummary(workingCopy.videoComposition)
  return compactObject({
    hasHtml: Boolean(html),
    htmlBytes: html ? html.length : 0,
    videoEngine: workingCopy.videoEngine,
    hasHyperframesComposition: Boolean(hyperframesHtml),
    hyperframesBytes: hyperframesHtml ? hyperframesHtml.length : 0,
    hasVideoComposition: Boolean(videoSummary),
    video: videoSummary,
    componentSelection: workingCopy.componentSelection,
    layerSelection: workingCopy.layerSelection,
    workingCopyRevision: workingCopy.workingCopyRevision,
    artifactChecksum: workingCopy.artifactChecksum
  })
}

function compactVideoCompositionSummary(composition: MotionVideoComposition | null | undefined) {
  if (!composition) {
    return null
  }
  const sceneLayers = (composition.scenes ?? []).reduce((count, scene) => count + (scene.layers?.length ?? 0), 0)
  const topLevelLayers = composition.layers?.length ?? 0
  return compactObject({
    width: composition.w,
    height: composition.h,
    duration: composition.duration,
    fps: composition.fps,
    sceneCount: composition.scenes?.length ?? 0,
    layerCount: topLevelLayers + sceneLayers + (composition.shared?.length ?? 0),
    sharedLayerCount: composition.shared?.length ?? 0,
    keyframeCount: countLayerKeyframes([...(composition.layers ?? []), ...(composition.shared ?? []), ...(composition.scenes ?? []).flatMap((scene) => scene.layers ?? [])])
  })
}

function compactLogPointer(log: LogPointer | null | undefined) {
  if (!log) {
    return null
  }
  return compactObject({
    id: log.id,
    action: log.action,
    message: log.message,
    errorMessage: log.errorMessage,
    createdAt: dateString(log.createdAt)
  })
}

function countLayerKeyframes(layers: MotionVideoLayer[]) {
  return layers.reduce((sum, layer) => {
    const tracks = layer.tracks ?? {}
    return sum + Object.values(tracks).reduce((trackSum, track) => trackSum + (Array.isArray(track) ? track.length : 0), 0)
  }, 0)
}

function positiveNumber(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function dateString(value: string | Date | null | undefined) {
  if (typeof value === 'string') {
    return value
  }
  return value instanceof Date ? value.toISOString() : value
}

function compactObject<T extends Record<string, MotionJsonValue | undefined>>(value: T) {
  const next: Record<string, MotionJsonValue> = {}
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) {
      next[key] = field
    }
  }
  return next
}
