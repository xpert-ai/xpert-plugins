import type { I18nObject, JsonSchemaObjectType } from '@xpert-ai/contracts'

// Temporary structural compatibility types for plugin-sdk 3.10.x. Replace with
// the official Workspace Files exports when the Excalidraw peer range advances.
export interface DiagramWorkspaceFileReference {
  source: 'platform.workspace.files'
  filePath: string
  workspacePath: string
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  size?: number | null
  [key: string]: unknown
}

export interface DiagramWorkspaceFilesApi {
  writeRuntimeBuffer(input: {
    path: string
    originalName: string
    mimeType: string
    buffer: Buffer
  }): Promise<{
    filePath: string
    workspacePath: string
    size?: number | null
    reference: DiagramWorkspaceFileReference
  }>
}

export type DiagramJsonPrimitive = string | number | boolean | null
export type DiagramJsonValue = DiagramJsonPrimitive | DiagramJsonObject | DiagramJsonValue[]
export interface DiagramJsonObject {
  [key: string]: DiagramJsonValue
}

export type DiagramKind =
  | 'architecture'
  | 'data-flow'
  | 'flowchart'
  | 'sequence'
  | 'comparison'
  | 'timeline'
  | 'mind-map'
  | 'agent'
  | 'memory'
  | 'class'
  | 'use-case'
  | 'state-machine'
  | 'er-diagram'
  | 'network-topology'
  | 'other'

export type DiagramLayoutStrategy = 'layered' | 'flow' | 'sequence' | 'radial' | 'matrix' | 'explicit'
export type DiagramDirection = 'top-to-bottom' | 'left-to-right'
export type DiagramColorScheme = 'light' | 'dark'
export type DiagramRenderingStyle = 'clean' | 'sketch'
export type DiagramPalette = 'neutral' | 'semantic'
export type DiagramPort = 'left' | 'right' | 'top' | 'bottom'
export type DiagramFlow = 'primary' | 'control' | 'read' | 'write' | 'async' | 'transform' | 'feedback' | 'neutral'
export type DiagramNodeKind =
  | 'process'
  | 'decision'
  | 'user'
  | 'agent'
  | 'model'
  | 'api'
  | 'service'
  | 'tool'
  | 'memory'
  | 'database'
  | 'vector-store'
  | 'graph-store'
  | 'queue'
  | 'document'
  | 'external'
  | 'state'
  | 'entity'
  | 'actor'
  | 'note'

export interface DiagramPoint {
  x: number
  y: number
}

export interface DiagramSize {
  width: number
  height: number
}

export interface DiagramAppearance {
  colorScheme: DiagramColorScheme
  rendering: DiagramRenderingStyle
  palette: DiagramPalette
  fontFamilyId?: number
}

export interface DiagramCanvas {
  width: number
  height: number
  padding: number
}

export interface DiagramLayout {
  strategy: DiagramLayoutStrategy
  direction: DiagramDirection
  horizontalGap: number
  verticalGap: number
  seed: string
}

export interface DiagramGroup {
  id: string
  label: string
  kind: 'container' | 'lane' | 'cluster'
  order?: number
  parentId?: string | null
}

export interface DiagramNode {
  id: string
  kind: DiagramNodeKind
  label: string
  description?: string
  groupId?: string | null
  layer?: number
  order?: number
  size?: Partial<DiagramSize>
  position?: DiagramPoint
  tags?: string[]
}

export interface DiagramEndpoint {
  nodeId: string
  port?: DiagramPort
}

export interface DiagramEdgeRouting {
  corridorX?: number[]
  corridorY?: number[]
  points?: DiagramPoint[]
}

export interface DiagramEdge {
  id: string
  source: DiagramEndpoint
  target: DiagramEndpoint
  flow: DiagramFlow
  label?: string
  directed?: boolean
  order?: number
  routing?: DiagramEdgeRouting
}

export interface DiagramAnnotation {
  id: string
  text: string
  targetId?: string
  position?: DiagramPoint
}

export interface DiagramLegendItem {
  flow: DiagramFlow
  label: string
}

export interface DiagramIR {
  schemaVersion: 1
  kind: DiagramKind
  title: string
  subtitle?: string
  canvas: DiagramCanvas
  appearance: DiagramAppearance
  layout: DiagramLayout
  groups: DiagramGroup[]
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  annotations: DiagramAnnotation[]
  legend: DiagramLegendItem[]
}

export interface ResolvedDiagramNode extends DiagramNode, DiagramPoint, DiagramSize {}

export interface ResolvedDiagramGroup extends DiagramGroup {
  x: number
  y: number
  width: number
  height: number
}

export interface ResolvedDiagramEdge extends DiagramEdge {
  points: DiagramPoint[]
}

export interface ResolvedDiagram {
  ir: DiagramIR
  groups: ResolvedDiagramGroup[]
  nodes: ResolvedDiagramNode[]
  edges: ResolvedDiagramEdge[]
}

export type DiagramQualitySeverity = 'error' | 'warning' | 'info'

export interface DiagramQualityIssue {
  code: string
  severity: DiagramQualitySeverity
  message: string
  targetIds: string[]
  correctionIntent?: string
}

export interface DiagramValidationReport {
  valid: boolean
  checkedAt: string
  issues: DiagramQualityIssue[]
  summary: {
    errors: number
    warnings: number
    nodes: number
    edges: number
  }
}

export type DiagramVisualReviewDecision = 'passed' | 'needs_revision' | 'skipped' | 'exhausted'

export interface DiagramVisualReviewRecord {
  qualityRunId: string
  attempt: number
  decision: DiagramVisualReviewDecision
  issues: DiagramQualityIssue[]
  notes?: string
  reviewedAt: string
  svgFile?: DiagramWorkspaceFileReference
  pngFile?: DiagramWorkspaceFileReference
}

export type DiagramIrRevisionStatus = 'draft' | 'validated' | 'rendered' | 'reviewed' | 'diverged' | 'failed'

export interface DiagramTemplatePayload {
  builderId: DiagramTemplateBuilderId
  base: DiagramIR
}

export type DiagramTemplateBuilderId =
  | 'layered-v1'
  | 'flow-v1'
  | 'sequence-v1'
  | 'radial-v1'
  | 'matrix-v1'

export interface ArtifactTemplateDescriptor {
  schemaVersion: 1
  key: string
  version: string
  /** Adapter-owned artifact identifier, for example excalidraw.diagram-ir or docx.document. */
  artifactType: string
  title: I18nObject
  description: I18nObject
  category: string
  tags: string[]
  preview?: {
    assetPath: string
    alt: I18nObject
  }
}

export interface ArtifactTemplateDefinition<TPayload extends DiagramJsonValue | object = DiagramTemplatePayload> {
  descriptor: ArtifactTemplateDescriptor
  inputSchema: JsonSchemaObjectType
  defaults: DiagramJsonObject
  examples: Array<{
    locale: 'en_US' | 'zh_Hans'
    prompt: string
    parameters: DiagramJsonObject
  }>
  payload: TPayload
}

export interface ArtifactTemplateQuery {
  search?: string
  category?: string
  tags?: string[]
}

export interface ArtifactTemplateCatalog<TPayload extends DiagramJsonValue | object = DiagramTemplatePayload> {
  list(query?: ArtifactTemplateQuery): ArtifactTemplateDescriptor[]
  get(key: string, version?: string): ArtifactTemplateDefinition<TPayload>
  validate(definition: ArtifactTemplateDefinition<TPayload>): void
}

export interface ArtifactTemplateAdapter<TPayload extends DiagramJsonValue | object, TResult> {
  readonly artifactType: string
  validate(definition: ArtifactTemplateDefinition<TPayload>): void
  instantiate(definition: ArtifactTemplateDefinition<TPayload>, parameters: DiagramJsonObject): TResult
  preview(definition: ArtifactTemplateDefinition<TPayload>, parameters: DiagramJsonObject): TResult
}

export interface DiagramCompileResult {
  resolved: ResolvedDiagram
  elements: Record<string, unknown>[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
  svg: string
  report: DiagramValidationReport
}
