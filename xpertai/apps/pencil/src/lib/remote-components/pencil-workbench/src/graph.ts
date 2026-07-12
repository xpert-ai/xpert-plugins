import { SceneGraph } from '@open\u002dpencil/core/scene-graph'
import type {
  DocumentColorSpace,
  FigmaSourcePayload,
  NodeType,
  SceneNode,
  SourceMetadata,
  Variable,
  VariableCollection
} from '@open\u002dpencil/core/scene-graph'
import type { Editor, Tool } from '@open\u002dpencil/vue'

import { isObject } from './runtime.js'
import type { RemotePayloadObject, RemotePayloadValue } from './runtime.js'
import type { GraphSnapshot, PencilBinaryObject, Summary } from './types.js'

// Keep the browser codec identical to the server snapshot codec.
const BINARY_MARKER_KEY = '__pencilBinary'
const BINARY_MARKER_VALUE = 'base64'
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

export function parseGraphText(value: string, errorMessage: string): GraphSnapshot {
  const parsed = JSON.parse(value) as unknown
  if (!isGraphSnapshot(parsed)) {
    throw new Error(errorMessage)
  }
  return parsed
}

export function isGraphSnapshot(value: unknown): value is GraphSnapshot {
  const candidate = value as RemotePayloadObject
  return (
    isObject(candidate) &&
    candidate.formatVersion === 'pencil.scene-graph.v1' &&
    typeof candidate.rootId === 'string' &&
    Array.isArray(candidate.nodes)
  )
}

export function normalizeSummary(value: RemotePayloadValue | null | undefined, snapshot: GraphSnapshot | null | undefined): Summary {
  if (isObject(value)) {
    return {
      nodeCount: numeric(value.nodeCount, 0),
      pageCount: numeric(value.pageCount, 0),
      imageCount: numeric(value.imageCount, 0),
      variableCount: numeric(value.variableCount, 0)
    }
  }
  return summarizeSnapshot(snapshot)
}

export function summarizeSnapshot(snapshot: GraphSnapshot | null | undefined): Summary {
  if (!snapshot) {
    return { nodeCount: 0, pageCount: 0, imageCount: 0, variableCount: 0 }
  }
  const nodes = snapshot.nodes.map(([, node]) => node as Record<string, unknown>)
  return {
    nodeCount: nodes.length,
    pageCount: nodes.filter((node) => node.type === 'CANVAS').length,
    imageCount: snapshot.images?.length ?? 0,
    variableCount: snapshot.variables?.length ?? 0
  }
}

export function findSnapshotNode(snapshot: GraphSnapshot | null | undefined, nodeId: string): RemotePayloadObject | null {
  if (!snapshot || !nodeId) {
    return null
  }
  for (const [id, node] of snapshot.nodes) {
    if (id === nodeId || node.id === nodeId) {
      return node
    }
  }
  return null
}

export function numeric(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function formatNumberLike(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 100) / 100) : ''
}

export function summarizeEditorGraph(editor: Editor): Summary {
  const nodes = Array.from(editor.graph.nodes.values())
  return {
    nodeCount: nodes.length,
    pageCount: nodes.filter((node) => node.type === 'CANVAS').length,
    imageCount: editor.graph.images.size,
    variableCount: editor.graph.variables.size
  }
}

export function snapshotFromGraph(graph: SceneGraph): GraphSnapshot {
  return {
    formatVersion: 'pencil.scene-graph.v1',
    pencilVersion: '0.13.2',
    rootId: graph.rootId,
    nodes: Array.from(graph.nodes.entries()).map(([id, node]) => [id, encodeBinaryValue(node) as RemotePayloadObject]),
    images: Array.from(graph.images.entries()).map(([hash, bytes]) => [hash, bytesToBase64(bytes)]),
    variables: Array.from(graph.variables.entries()).map(([id, variable]) => [id, encodeBinaryValue(variable) as RemotePayloadObject]),
    variableCollections: Array.from(graph.variableCollections.entries()).map(([id, collection]) => [id, encodeBinaryValue(collection) as RemotePayloadObject]),
    activeMode: Array.from(graph.activeMode.entries()),
    instanceIndex: Array.from(graph.instanceIndex.entries()).map(([componentId, instanceIds]) => [componentId, Array.from(instanceIds)]),
    figKiwiVersion: graph.figKiwiVersion,
    figSchemaDeflatedBase64: graph.figSchemaDeflated ? bytesToBase64(graph.figSchemaDeflated) : null,
    documentColorSpace: graph.documentColorSpace
  }
}

/** Rehydrates server data into the exact SceneGraph instance consumed by the Vue editor. */
export function graphFromSnapshot(snapshot: GraphSnapshot): SceneGraph {
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
  for (const [hash, base64] of snapshot.images ?? []) {
    graph.images.set(hash, base64ToBytes(base64))
  }
  for (const [id, variable] of snapshot.variables ?? []) {
    graph.variables.set(id, decodeBinaryValue(variable) as Variable)
  }
  for (const [id, collection] of snapshot.variableCollections ?? []) {
    graph.variableCollections.set(id, decodeBinaryValue(collection) as VariableCollection)
  }
  for (const [collectionId, modeId] of snapshot.activeMode ?? []) {
    graph.activeMode.set(collectionId, modeId)
  }
  for (const [componentId, instanceIds] of snapshot.instanceIndex ?? []) {
    graph.instanceIndex.set(componentId, new Set(instanceIds))
  }

  graph.rootId = snapshot.rootId
  graph.figKiwiVersion = typeof snapshot.figKiwiVersion === 'number' ? snapshot.figKiwiVersion : null
  graph.figSchemaDeflated = snapshot.figSchemaDeflatedBase64 ? base64ToBytes(snapshot.figSchemaDeflatedBase64) : null
  graph.documentColorSpace = normalizeDocumentColorSpace(snapshot.documentColorSpace)
  repairGraphForCore(graph)
  repairGraphForDisplay(graph)

  return graph
}

/** Repairs legacy or Agent-minimal nodes before the canvas and exporters inspect them. */
export function repairGraphForCore(graph: SceneGraph) {
  const defaults = createSceneNodeDefaults(graph)
  for (const [nodeId, rawNode] of Array.from(graph.nodes.entries())) {
    const node = repairSceneNodeDefaults(graph, defaults, nodeId, rawNode)
    graph.nodes.set(nodeId, node)
    const writable = node as SceneNode & { source?: SourceMetadata }
    if (!isObject(writable.source as unknown)) {
      writable.source = createDefaultSourceMetadata()
      continue
    }
    const source = writable.source as SourceMetadata
    if (!isObject(source.fig as unknown)) {
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

/** Supplies fresh core-compatible defaults without sharing mutable template objects. */
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

/** Uses installed core constructors first so newly added node fields inherit package defaults. */
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
  // Fallbacks cover tests and partial runtimes where a template graph cannot be constructed.
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

/** Expands empty page bounds from child geometry so zoom-to-fit always has a finite target. */
export function repairGraphForDisplay(graph: SceneGraph) {
  for (const page of graph.getPages(true)) {
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

function encodeBinaryValue(value: unknown): RemotePayloadValue {
  if (value instanceof Uint8Array) {
    return {
      [BINARY_MARKER_KEY]: BINARY_MARKER_VALUE,
      base64: bytesToBase64(value)
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => encodeBinaryValue(item))
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encodeBinaryValue(item)])) as RemotePayloadObject
  }
  if (isRemotePayloadPrimitive(value)) {
    return value
  }
  return null
}

function isRemotePayloadPrimitive(value: unknown): value is string | number | boolean | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

function decodeBinaryValue(value: RemotePayloadValue): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => decodeBinaryValue(item))
  }
  if (!isObject(value)) {
    return value
  }
  const binary = value as PencilBinaryObject
  if (binary[BINARY_MARKER_KEY] === BINARY_MARKER_VALUE && typeof binary.base64 === 'string') {
    return base64ToBytes(binary.base64)
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBinaryValue(item as RemotePayloadValue)]))
}

export function nodeToPayloadObject(node: SceneNode | undefined): RemotePayloadObject | null {
  return node ? (encodeBinaryValue(node) as RemotePayloadObject) : null
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function normalizeDocumentColorSpace(value: string | null | undefined): DocumentColorSpace {
  return value === 'display-p3' ? 'display-p3' : 'srgb'
}

export function flattenLayerTreeItems(items: unknown[] | undefined, level = 0): unknown[] {
  if (!Array.isArray(items)) {
    return []
  }
  return items.flatMap((item) => {
    const layer = readLayerEntry(item, level)
    const children = isObject(item) && Array.isArray(item.children) ? item.children : []
    return [item, ...flattenLayerTreeItems(children, layer.level + 1)]
  })
}

export function readLayerEntry(entry: unknown, fallbackLevel = 0) {
  const record = isObject(entry) ? entry : {}
  const value = (isObject(record.value) ? record.value : isObject(record.item) ? record.item : isObject(record.node) ? record.node : record) as RemotePayloadObject
  const id = typeof value.id === 'string' ? value.id : typeof record.id === 'string' ? record.id : ''
  const children = Array.isArray(value.children) ? value.children : []
  return {
    id,
    name: typeof value.name === 'string' ? value.name : id,
    type: typeof value.type === 'string' ? value.type : 'NODE',
    level: numeric(record.level ?? record.depth, fallbackLevel),
    hasChildren: children.length > 0 || Boolean(record.hasChildren)
  }
}

export function toolGlyph(tool: Tool) {
  const glyphs: Record<Tool, string> = {
    SELECT: 'V',
    FRAME: 'F',
    SECTION: 'S',
    RECTANGLE: 'R',
    ELLIPSE: 'O',
    LINE: 'L',
    POLYGON: 'P',
    STAR: '*',
    TEXT: 'T',
    PEN: 'N',
    HAND: 'H'
  }
  return glyphs[tool]
}

export function readNestedString(value: RemotePayloadValue | null | undefined, path: string[]) {
  let cursor: RemotePayloadValue | undefined | null = value
  for (const key of path) {
    if (!isObject(cursor)) {
      return undefined
    }
    cursor = cursor[key]
  }
  return typeof cursor === 'string' && cursor.trim() ? cursor.trim() : undefined
}
