import { createHash } from 'node:crypto'
import type {
  DocumentColorSpace,
  FigmaSourcePayload,
  NodeType,
  SceneGraph,
  SceneNode,
  SourceMetadata,
  Variable,
  VariableCollection
} from '@open\u002dpencil/core/scene-graph'
import { PENCIL_VERSION } from './constants.js'
import type { PencilGraphSnapshot, PencilJsonObject, PencilJsonValue } from './types.js'

const GRAPH_FORMAT_VERSION = 'pencil.scene-graph.v1' as const
// Binary markers preserve typed arrays inside otherwise JSON-only node payloads.
const BINARY_MARKER_KEY = '__pencilBinary'
const BINARY_MARKER_VALUE = 'base64'
const DEFAULT_ROOT_ID = 'root'
const DEFAULT_PAGE_ID = 'page-1'
const NODE_TYPES = [
  'CANVAS',
  'FRAME',
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'ELLIPSE',
  'TEXT',
  'LINE',
  'STAR',
  'POLYGON',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'GROUP',
  'SECTION',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'CONNECTOR',
  'SHAPE_WITH_TEXT'
] as const satisfies readonly NodeType[]

type SceneGraphModule = typeof import('@open\u002dpencil/core/scene-graph')

let sceneGraphModulePromise: Promise<SceneGraphModule> | null = null

export class PencilGraphSnapshotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PencilGraphSnapshotError'
  }
}

/** Creates the smallest valid graph that can be opened by both the server and editor runtime. */
export function createEmptyPencilGraphSnapshot(): PencilGraphSnapshot {
  return {
    formatVersion: GRAPH_FORMAT_VERSION,
    pencilVersion: PENCIL_VERSION,
    rootId: DEFAULT_ROOT_ID,
    nodes: [
      [
        DEFAULT_ROOT_ID,
        {
          id: DEFAULT_ROOT_ID,
          type: 'FRAME',
          name: 'Document',
          parentId: null,
          childIds: [DEFAULT_PAGE_ID],
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          flipX: false,
          flipY: false,
          visible: true
        }
      ],
      [
        DEFAULT_PAGE_ID,
        {
          id: DEFAULT_PAGE_ID,
          type: 'CANVAS',
          name: 'Page 1',
          parentId: DEFAULT_ROOT_ID,
          childIds: [],
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          flipX: false,
          flipY: false,
          visible: true
        }
      ]
    ],
    images: [],
    variables: [],
    variableCollections: [],
    activeMode: [],
    instanceIndex: [],
    figKiwiVersion: null,
    figSchemaDeflatedBase64: null,
    documentColorSpace: 'srgb'
  }
}

/** Serializes all graph maps and binary fields without losing import/export metadata. */
export function snapshotFromGraph(graph: SceneGraph): PencilGraphSnapshot {
  return {
    formatVersion: GRAPH_FORMAT_VERSION,
    pencilVersion: PENCIL_VERSION,
    rootId: graph.rootId,
    nodes: Array.from(graph.nodes.entries()).map(([id, node]) => [id, encodeBinaryValue(node) as PencilJsonObject]),
    images: Array.from(graph.images.entries()).map(([hash, bytes]) => [hash, Buffer.from(bytes).toString('base64')]),
    variables: Array.from(graph.variables.entries()).map(([id, variable]) => [id, encodeBinaryValue(variable) as PencilJsonObject]),
    variableCollections: Array.from(graph.variableCollections.entries()).map(([id, collection]) => [id, encodeBinaryValue(collection) as PencilJsonObject]),
    activeMode: Array.from(graph.activeMode.entries()),
    instanceIndex: Array.from(graph.instanceIndex.entries()).map(([componentId, instanceIds]) => [componentId, Array.from(instanceIds)]),
    figKiwiVersion: graph.figKiwiVersion,
    figSchemaDeflatedBase64: graph.figSchemaDeflated ? Buffer.from(graph.figSchemaDeflated).toString('base64') : null,
    documentColorSpace: graph.documentColorSpace
  }
}

/**
 * Rehydrates a persisted snapshot and repairs historical or minimal nodes before
 * handing the graph to layout, renderer, or exporter code.
 */
export async function graphFromSnapshot(input: PencilGraphSnapshot): Promise<SceneGraph> {
  const snapshot = normalizePencilGraphSnapshot(input)
  const { SceneGraph } = await loadSceneGraphModule()
  const graph = new SceneGraph()
  graph.nodes.clear()
  graph.images.clear()
  graph.variables.clear()
  graph.variableCollections.clear()
  graph.activeMode.clear()
  graph.instanceIndex.clear()

  for (const [id, node] of snapshot.nodes) {
    graph.nodes.set(id, decodeBinaryValue(node) as SceneNode)
  }
  for (const [hash, base64] of snapshot.images) {
    graph.images.set(hash, Uint8Array.from(Buffer.from(base64, 'base64')))
  }
  for (const [id, variable] of snapshot.variables) {
    graph.variables.set(id, decodeBinaryValue(variable) as Variable)
  }
  for (const [id, collection] of snapshot.variableCollections) {
    graph.variableCollections.set(id, decodeBinaryValue(collection) as VariableCollection)
  }
  for (const [collectionId, modeId] of snapshot.activeMode) {
    graph.activeMode.set(collectionId, modeId)
  }
  for (const [componentId, instanceIds] of snapshot.instanceIndex) {
    graph.instanceIndex.set(componentId, new Set(instanceIds))
  }

  graph.rootId = snapshot.rootId
  graph.figKiwiVersion = typeof snapshot.figKiwiVersion === 'number' ? snapshot.figKiwiVersion : null
  graph.figSchemaDeflated = snapshot.figSchemaDeflatedBase64
    ? Uint8Array.from(Buffer.from(snapshot.figSchemaDeflatedBase64, 'base64'))
    : null
  graph.documentColorSpace = normalizeDocumentColorSpace(snapshot.documentColorSpace)

  if (!graph.nodes.has(graph.rootId)) {
    throw new PencilGraphSnapshotError(`Pencil graph root node "${graph.rootId}" is missing.`)
  }
  repairPencilGraphForCore(graph)
  repairPencilGraphForDisplay(graph)
  return graph
}

/**
 * Restores required core fields that older snapshots and Agent-created nodes may
 * omit. Missing geometry or source metadata otherwise propagates NaN bounds into
 * canvas rendering and file exports.
 */
export function repairPencilGraphForCore(graph: SceneGraph) {
  const defaults = createSceneNodeDefaults(graph)
  for (const [nodeId, rawNode] of Array.from(graph.nodes.entries())) {
    const node = repairSceneNodeDefaults(graph, defaults, nodeId, rawNode)
    graph.nodes.set(nodeId, node)
    const writable = node as SceneNode & { source?: SourceMetadata }
    if (!isPlainObject(writable.source as unknown)) {
      writable.source = createDefaultSourceMetadata()
      continue
    }
    const source = writable.source as SourceMetadata
    if (!isPlainObject(source.fig as unknown)) {
      writable.source.fig = createDefaultSourceMetadata().fig
      continue
    }
    const fig = writable.source.fig as FigmaSourcePayload & Record<string, unknown>
    fig.rawSize ??= null
    fig.rawTransform ??= null
    fig.rawNodeFields ??= {}
    fig.layout ??= null
    fig.symbolOverrides ??= []
    fig.componentPropAssignments ??= []
    fig.derivedSymbolData ??= []
    fig.derivedSymbolDataLayoutVersion ??= null
    fig.uniformScaleFactor ??= null
  }
}

/** Provides a fresh default node per type so callers cannot mutate cached templates. */
type SceneNodeDefaults = {
  byType(type: NodeType): SceneNode
}

type SceneGraphConstructor = new () => SceneGraph
type SceneGraphWithCreateNode = SceneGraph & {
  createNode?: (type: NodeType, parentId: string, overrides?: Partial<SceneNode>) => SceneNode
  getNode?: (id: string) => SceneNode | undefined
}

function createSceneNodeDefaults(graph: SceneGraph): SceneNodeDefaults {
  const GraphConstructor = graph.constructor as SceneGraphConstructor
  let templateGraph: SceneGraphWithCreateNode | null = null
  try {
    templateGraph = new GraphConstructor() as SceneGraphWithCreateNode
  } catch {
    templateGraph = null
  }

  const cache = new Map<NodeType, SceneNode>()
  return {
    byType(type) {
      const cached = cache.get(type)
      if (cached) {
        return cloneSceneNode(cached)
      }
      const template = readTemplateNode(templateGraph, type) ?? createFallbackDefaultNode(type)
      cache.set(type, template)
      return cloneSceneNode(template)
    }
  }
}

/** Prefers defaults produced by the installed core package to keep schema changes compatible. */
function readTemplateNode(templateGraph: SceneGraphWithCreateNode | null, type: NodeType): SceneNode | null {
  if (!templateGraph) {
    return null
  }
  const template =
    type === 'CANVAS'
      ? templateGraph.getPages(true)[0]
      : type === 'FRAME'
        ? typeof templateGraph.getNode === 'function'
          ? templateGraph.getNode(templateGraph.rootId)
          : templateGraph.nodes.get(templateGraph.rootId)
        : typeof templateGraph.createNode === 'function'
          ? templateGraph.createNode(type, templateGraph.rootId)
          : null
  return template && hasRenderableDefaults(template) ? cloneSceneNode(template) : null
}

function hasRenderableDefaults(node: SceneNode) {
  return (
    isFiniteNumber(node.x) &&
    isFiniteNumber(node.y) &&
    isFiniteNumber(node.width) &&
    isFiniteNumber(node.height) &&
    isFiniteNumber(node.rotation) &&
    Array.isArray(node.fills) &&
    Array.isArray(node.strokes) &&
    Array.isArray(node.effects)
  )
}

function repairSceneNodeDefaults(graph: SceneGraph, defaults: SceneNodeDefaults, nodeId: string, rawNode: SceneNode): SceneNode {
  const type = normalizeSceneNodeType(rawNode.type, nodeId === graph.rootId)
  const childIds = Array.isArray(rawNode.childIds) ? rawNode.childIds : []
  return {
    ...defaults.byType(type),
    ...rawNode,
    id: typeof rawNode.id === 'string' && rawNode.id ? rawNode.id : nodeId,
    type,
    parentId: nodeId === graph.rootId ? null : rawNode.parentId,
    childIds
  }
}

function normalizeSceneNodeType(value: unknown, isRootNode: boolean): NodeType {
  if (isRootNode || value === 'ROOT') {
    return 'FRAME'
  }
  return isNodeType(value) ? value : 'FRAME'
}

function isNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && (NODE_TYPES as readonly string[]).includes(value)
}

function cloneSceneNode(node: SceneNode): SceneNode {
  return structuredClone(node)
}

function createFallbackDefaultNode(type: NodeType): SceneNode {
  // This fallback keeps tests and degraded runtimes usable when a template graph cannot be constructed.
  const fallback: Partial<SceneNode> = {
    id: '',
    type,
    name: type === 'CANVAS' ? 'Page' : type.charAt(0) + type.slice(1).toLowerCase(),
    parentId: null,
    childIds: [],
    x: 0,
    y: 0,
    width: type === 'CANVAS' ? 0 : 100,
    height: type === 'CANVAS' ? 0 : 100,
    rotation: 0,
    source: createDefaultSourceMetadata(),
    figmaDerivedLayout: null,
    fills: type === 'TEXT' ? [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }] : [],
    strokes: [],
    effects: [],
    opacity: 1,
    cornerRadius: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomRightRadius: 0,
    bottomLeftRadius: 0,
    independentCorners: false,
    cornerSmoothing: 0,
    visible: true,
    locked: false,
    clipsContent: false,
    text: '',
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: 400,
    italic: false,
    textAlignHorizontal: 'LEFT',
    textDirection: 'AUTO',
    lineHeight: null,
    letterSpacing: 0,
    layoutMode: 'NONE',
    layoutDirection: 'AUTO',
    layoutWrap: 'NO_WRAP',
    primaryAxisAlign: 'MIN',
    counterAxisAlign: 'MIN',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    itemSpacing: 0,
    counterAxisSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    blendMode: 'PASS_THROUGH',
    layoutPositioning: 'AUTO',
    layoutGrow: 0,
    layoutAlignSelf: 'AUTO',
    vectorNetwork: null,
    fillGeometry: [],
    strokeGeometry: [],
    arcData: null,
    textAlignVertical: 'TOP',
    textAutoResize: 'NONE',
    textCase: 'ORIGINAL',
    textDecoration: 'NONE',
    maxLines: null,
    styleRuns: [],
    fontVariations: [],
    fontFeatures: [],
    horizontalConstraint: 'MIN',
    verticalConstraint: 'MIN',
    strokeCap: 'NONE',
    strokeJoin: 'MITER',
    dashPattern: [],
    borderTopWeight: 0,
    borderRightWeight: 0,
    borderBottomWeight: 0,
    borderLeftWeight: 0,
    independentStrokeWeights: false,
    strokeMiterLimit: 4,
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null,
    isMask: false,
    maskType: 'ALPHA',
    gridTemplateColumns: [],
    gridTemplateRows: [],
    gridColumnGap: 0,
    gridRowGap: 0,
    gridPosition: null,
    counterAxisAlignContent: 'AUTO',
    itemReverseZIndex: false,
    strokesIncludedInLayout: false,
    expanded: true,
    textTruncation: 'DISABLED',
    autoRename: true,
    pointCount: 5,
    starInnerRadius: 0.38,
    componentId: null,
    overrides: {},
    componentPropertyDefinitions: [],
    componentPropertyValues: {},
    componentKey: null,
    sourceLibraryKey: null,
    publishId: null,
    overrideKey: null,
    sharedSymbolVersion: null,
    publishedVersion: null,
    isPublishable: false,
    isSymbolPublishable: false,
    symbolDescription: '',
    symbolLinks: [],
    variantPropSpecs: [],
    boundVariables: {},
    pluginData: [],
    pluginRelaunchData: [],
    internalOnly: false,
    flipX: false,
    flipY: false,
    textPicture: null,
    figmaDerivedTextGlyphs: null
  }
  return fallback as SceneNode
}

/** Ensures every page has finite visible bounds even when only its children carry geometry. */
export function repairPencilGraphForDisplay(graph: SceneGraph) {
  const pages = graph.getPages(true)
  for (const page of pages) {
    const bounds = page.childIds
      .map((id) => getGraphNode(graph, id))
      .filter((node): node is SceneNode => Boolean(node))
      .reduce<GraphBounds | null>((acc, node) => expandBounds(acc, node), null)

    const changes: Partial<SceneNode> = {}
    if (!isFiniteNumber(page.x)) {
      changes.x = 0
    }
    if (!isFiniteNumber(page.y)) {
      changes.y = 0
    }
    if (!isFiniteNumber(page.width) || page.width <= 0) {
      changes.width = bounds ? Math.max(1, Math.ceil(bounds.maxX)) : 1440
    }
    if (!isFiniteNumber(page.height) || page.height <= 0) {
      changes.height = bounds ? Math.max(1, Math.ceil(bounds.maxY)) : 900
    }
    if (page.visible !== true) {
      changes.visible = true
    }

    if (Object.keys(changes).length > 0) {
      Object.assign(page, changes)
    }
  }
}

type GraphBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function expandBounds(bounds: GraphBounds | null, node: SceneNode): GraphBounds | null {
  const x = isFiniteNumber(node.x) ? node.x : 0
  const y = isFiniteNumber(node.y) ? node.y : 0
  const width = isFiniteNumber(node.width) ? node.width : 0
  const height = isFiniteNumber(node.height) ? node.height : 0
  if (width <= 0 || height <= 0) {
    return bounds
  }
  const next = {
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height
  }
  if (!bounds) {
    return next
  }
  return {
    minX: Math.min(bounds.minX, next.minX),
    minY: Math.min(bounds.minY, next.minY),
    maxX: Math.max(bounds.maxX, next.maxX),
    maxY: Math.max(bounds.maxY, next.maxY)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getGraphNode(graph: SceneGraph, id: string): SceneNode | undefined {
  const candidate = graph as SceneGraph & { getNode?: (id: string) => SceneNode | undefined }
  return typeof candidate.getNode === 'function' ? candidate.getNode(id) : graph.nodes.get(id)
}

function createDefaultSourceMetadata(): SourceMetadata {
  return {
    format: null,
    id: null,
    orderKey: null,
    fig: {
      rawSize: null,
      rawTransform: null,
      rawNodeFields: {},
      layout: null,
      symbolOverrides: [],
      componentPropAssignments: [],
      derivedSymbolData: [],
      derivedSymbolDataLayoutVersion: null,
      uniformScaleFactor: null
    }
  }
}

function loadSceneGraphModule(): Promise<SceneGraphModule> {
  sceneGraphModulePromise ??= import('@open\u002dpencil/core/scene-graph')
  return sceneGraphModulePromise
}

export function normalizePencilGraphSnapshot(input: PencilJsonValue | object | null | undefined): PencilGraphSnapshot {
  if (!isPlainObject(input)) {
    throw new PencilGraphSnapshotError('Pencil graph snapshot must be an object.')
  }
  if (input.formatVersion !== GRAPH_FORMAT_VERSION) {
    throw new PencilGraphSnapshotError(`Unsupported Pencil graph snapshot format: ${String(input.formatVersion ?? '')}`)
  }
  const rootId = typeof input.rootId === 'string' && input.rootId.trim() ? input.rootId : null
  if (!rootId) {
    throw new PencilGraphSnapshotError('Pencil graph snapshot rootId is required.')
  }

  const nodes = normalizeEntryObjectArray(input.nodes, 'nodes')
  if (!nodes.length) {
    throw new PencilGraphSnapshotError('Pencil graph snapshot must contain nodes.')
  }

  return {
    formatVersion: GRAPH_FORMAT_VERSION,
    pencilVersion: typeof input.pencilVersion === 'string' ? input.pencilVersion : PENCIL_VERSION,
    rootId,
    nodes,
    images: normalizeStringEntryArray(input.images, 'images'),
    variables: normalizeEntryObjectArray(input.variables, 'variables'),
    variableCollections: normalizeEntryObjectArray(input.variableCollections, 'variableCollections'),
    activeMode: normalizeStringEntryArray(input.activeMode, 'activeMode'),
    instanceIndex: normalizeStringArrayEntryArray(input.instanceIndex, 'instanceIndex'),
    figKiwiVersion: typeof input.figKiwiVersion === 'number' ? input.figKiwiVersion : null,
    figSchemaDeflatedBase64: typeof input.figSchemaDeflatedBase64 === 'string' ? input.figSchemaDeflatedBase64 : null,
    documentColorSpace: normalizeDocumentColorSpace(typeof input.documentColorSpace === 'string' ? input.documentColorSpace : undefined)
  }
}

export function summarizeGraphSnapshot(snapshot: PencilJsonValue | object | null | undefined) {
  if (!isGraphSnapshotLike(snapshot)) {
    return {
      nodeCount: 0,
      pageCount: 0,
      imageCount: 0,
      variableCount: 0,
      componentCount: 0
    }
  }
  const normalized = normalizePencilGraphSnapshot(snapshot)
  const nodes = normalized.nodes.map(([, node]) => node)
  const pages = nodes.filter((node) => node.type === 'CANVAS')
  const components = nodes.filter((node) => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')
  return {
    nodeCount: normalized.nodes.length,
    pageCount: pages.length,
    imageCount: normalized.images.length,
    variableCount: normalized.variables.length,
    componentCount: components.length,
    documentColorSpace: normalized.documentColorSpace,
    rootId: normalized.rootId,
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      childCount: Array.isArray(page.childIds) ? page.childIds.length : 0
    }))
  }
}

/** Produces a bounded graph view suitable for Agent context instead of returning the full snapshot. */
export function compactGraphSnapshotForAgent(snapshot: PencilJsonValue | object | null | undefined) {
  if (!isGraphSnapshotLike(snapshot)) {
    return null
  }
  const normalized = normalizePencilGraphSnapshot(snapshot)
  const nodes = normalized.nodes.map(([, node]) => node)
  return {
    ...summarizeGraphSnapshot(normalized),
    nodes: nodes
      .filter((node) => node.id !== normalized.rootId)
      .slice(0, 200)
      .map((node) => compactNodeForAgent(node))
  }
}

export function getNodeFromSnapshot(snapshot: PencilGraphSnapshot, nodeId: string) {
  return normalizePencilGraphSnapshot(snapshot).nodes.find(([id]) => id === nodeId)?.[1] ?? null
}

export function compactNodeForAgent(node: PencilJsonObject | null | undefined): PencilJsonObject | null {
  if (!node) {
    return null
  }
  const compact: PencilJsonObject = {}
  for (const key of [
    'id',
    'type',
    'name',
    'parentId',
    'childIds',
    'x',
    'y',
    'width',
    'height',
    'rotation',
    'visible',
    'locked',
    'opacity',
    'layoutMode',
    'layoutDirection',
    'layoutWrap',
    'primaryAxisAlign',
    'counterAxisAlign',
    'counterAxisAlignContent',
    'primaryAxisSizing',
    'counterAxisSizing',
    'itemSpacing',
    'counterAxisSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'layoutPositioning',
    'layoutGrow',
    'layoutAlignSelf',
    'minWidth',
    'maxWidth',
    'minHeight',
    'maxHeight',
    'gridTemplateColumns',
    'gridTemplateRows',
    'gridColumnGap',
    'gridRowGap',
    'gridPosition',
    'text',
    'fontSize',
    'fontFamily',
    'fills',
    'strokes',
    'effects',
    'componentId',
    'componentKey'
  ]) {
    const value = node[key]
    if (value !== undefined) {
      compact[key] = redactLargeBinaryMarkers(value)
    }
  }
  return compact
}

/** Hashes canonical JSON so equivalent snapshots have the same optimistic-lock token. */
export function checksumGraphSnapshot(snapshot: PencilGraphSnapshot | null | undefined) {
  if (!snapshot) {
    return null
  }
  return createHash('sha256').update(stableStringifyPencilJson(normalizePencilGraphSnapshot(snapshot))).digest('hex')
}

/** Stringifies objects with deterministic key ordering while preserving array order. */
export function stableStringifyPencilJson(value: PencilJsonValue | undefined): string {
  if (value === undefined || value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyPencilJson(item)).join(',')}]`
  }
  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringifyPencilJson(value[key])}`)
  return `{${entries.join(',')}}`
}

/** Recursively replaces typed arrays with explicit base64 marker objects. */
function encodeBinaryValue(value: unknown): PencilJsonValue {
  if (value instanceof Uint8Array) {
    return {
      [BINARY_MARKER_KEY]: BINARY_MARKER_VALUE,
      base64: Buffer.from(value).toString('base64')
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => encodeBinaryValue(item))
  }
  if (isPlainRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, encodeBinaryValue(item)] as const)
    return Object.fromEntries(entries) as PencilJsonObject
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value as PencilJsonValue
  }
  return null
}

/** Reconstructs typed arrays encoded by encodeBinaryValue. */
function decodeBinaryValue(value: PencilJsonValue): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => decodeBinaryValue(item))
  }
  if (!isPlainObject(value)) {
    return value
  }
  if (value[BINARY_MARKER_KEY] === BINARY_MARKER_VALUE && typeof value.base64 === 'string') {
    return Uint8Array.from(Buffer.from(value.base64, 'base64'))
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBinaryValue(item as PencilJsonValue)]))
}

function redactLargeBinaryMarkers(value: PencilJsonValue): PencilJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactLargeBinaryMarkers(item))
  }
  if (!isPlainObject(value)) {
    return value
  }
  if (value[BINARY_MARKER_KEY] === BINARY_MARKER_VALUE && typeof value.base64 === 'string') {
    return `[binary:${value.base64.length}]`
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactLargeBinaryMarkers(item as PencilJsonValue)])) as PencilJsonObject
}

function normalizeEntryObjectArray(value: PencilJsonValue | undefined, label: string): Array<[string, PencilJsonObject]> {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item, index) => {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !isPlainObject(item[1])) {
      throw new PencilGraphSnapshotError(`Pencil graph snapshot ${label}[${index}] must be [id, object].`)
    }
    return [item[0], item[1]]
  })
}

function normalizeStringEntryArray(value: PencilJsonValue | undefined, label: string): Array<[string, string]> {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item, index) => {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || typeof item[1] !== 'string') {
      throw new PencilGraphSnapshotError(`Pencil graph snapshot ${label}[${index}] must be [string, string].`)
    }
    return [item[0], item[1]]
  })
}

function normalizeStringArrayEntryArray(value: PencilJsonValue | undefined, label: string): Array<[string, string[]]> {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item, index) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== 'string' ||
      !Array.isArray(item[1]) ||
      !item[1].every((entry) => typeof entry === 'string')
    ) {
      throw new PencilGraphSnapshotError(`Pencil graph snapshot ${label}[${index}] must be [string, string[]].`)
    }
    return [item[0], item[1]]
  })
}

function normalizeDocumentColorSpace(value: string | null | undefined): DocumentColorSpace {
  return value === 'display-p3' ? 'display-p3' : 'srgb'
}

function isGraphSnapshotLike(value: PencilJsonValue | object | null | undefined): value is PencilGraphSnapshot {
  return isPlainObject(value) && value.formatVersion === GRAPH_FORMAT_VERSION
}

function isPlainObject(value: unknown): value is PencilJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
