export class ExcalidrawSceneValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('; '))
    this.name = 'ExcalidrawSceneValidationError'
  }
}

export interface NormalizedExcalidrawScene {
  elements: Record<string, unknown>[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

export interface SceneValidationOptions {
  context?: string
}

const ELEMENT_TYPES = new Set([
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
  'image',
  'frame',
  'magicframe',
  'iframe',
  'embeddable'
])

const GENERIC_TYPES = new Set(['rectangle', 'diamond', 'ellipse', 'iframe', 'embeddable'])
const COMMON_NUMBER_FIELDS = ['x', 'y', 'width', 'height', 'angle', 'strokeWidth', 'roughness', 'opacity', 'seed', 'version', 'versionNonce', 'updated']
const COMMON_STRING_FIELDS = ['strokeColor', 'backgroundColor', 'fillStyle', 'strokeStyle']
const LINEAR_TYPES = new Set(['arrow', 'line'])
const ARROWHEADS = new Set([
  'arrow',
  'bar',
  'dot',
  'circle',
  'circle_outline',
  'triangle',
  'triangle_outline',
  'diamond',
  'diamond_outline',
  'crowfoot_one',
  'crowfoot_many',
  'crowfoot_one_or_many'
])

export function normalizeExcalidrawScene(
  input: {
    elements?: unknown[] | null
    appState?: unknown
    files?: unknown
  },
  options: SceneValidationOptions = {}
): NormalizedExcalidrawScene {
  const issues: string[] = []
  const elements = Array.isArray(input.elements) ? input.elements : []
  const files = isPlainObject(input.files) ? input.files : {}
  const ids = new Set<string>()

  elements.forEach((element, index) => {
    validateElement(element, index, files, ids, issues)
  })

  validateFiles(files, issues)

  if (issues.length) {
    const prefix = options.context ? `${options.context}: ` : ''
    throw new ExcalidrawSceneValidationError(issues.map((issue) => `${prefix}${issue}`))
  }

  return {
    elements: elements as Record<string, unknown>[],
    appState: isPlainObject(input.appState) ? input.appState : {},
    files
  }
}

export function createStableJsonSignature(value: unknown) {
  return JSON.stringify(normalizeJsonValue(value))
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validateElement(
  element: unknown,
  index: number,
  files: Record<string, unknown>,
  ids: Set<string>,
  issues: string[]
) {
  const path = `elements[${index}]`
  if (!isPlainObject(element)) {
    issues.push(`${path} must be an object.`)
    return
  }

  const id = readString(element.id)
  if (!id) {
    issues.push(`${path}.id is required and must be a non-empty string.`)
  } else if (ids.has(id)) {
    issues.push(`${path}.id "${id}" is duplicated.`)
  } else {
    ids.add(id)
  }

  const type = readString(element.type)
  if (!type) {
    issues.push(`${path}.type is required.`)
    return
  }
  if (!ELEMENT_TYPES.has(type)) {
    const message = type === 'selection' ? 'selection elements are transient and cannot be persisted.' : `unsupported element type "${type}".`
    issues.push(`${path}.type ${message}`)
    return
  }

  validateCommonElementFields(element, path, issues)

  if (GENERIC_TYPES.has(type)) {
    return
  }
  if (type === 'text') {
    validateTextElement(element, path, issues)
    return
  }
  if (LINEAR_TYPES.has(type)) {
    validateLinearElement(element, path, type, issues)
    return
  }
  if (type === 'freedraw') {
    validateFreedrawElement(element, path, issues)
    return
  }
  if (type === 'image') {
    validateImageElement(element, path, files, issues)
    return
  }
  if (type === 'frame' || type === 'magicframe') {
    validateNullableString(element.name, `${path}.name`, issues)
  }
}

function validateCommonElementFields(element: Record<string, unknown>, path: string, issues: string[]) {
  for (const field of COMMON_NUMBER_FIELDS) {
    validateFiniteNumber(element[field], `${path}.${field}`, issues)
  }
  for (const field of COMMON_STRING_FIELDS) {
    validateRequiredString(element[field], `${path}.${field}`, issues)
  }
  validateBoolean(element.isDeleted, `${path}.isDeleted`, issues)
  validateBoolean(element.locked, `${path}.locked`, issues)
  validateNullableString(element.frameId, `${path}.frameId`, issues)
  validateNullableString(element.link, `${path}.link`, issues)
  validateIndex(element.index, `${path}.index`, issues)
  validateGroupIds(element.groupIds, `${path}.groupIds`, issues)
  validateRoundness(element.roundness, `${path}.roundness`, issues)
  validateBoundElements(element.boundElements, `${path}.boundElements`, issues)
}

function validateTextElement(element: Record<string, unknown>, path: string, issues: string[]) {
  validateFiniteNumber(element.fontSize, `${path}.fontSize`, issues, { positive: true })
  validateFiniteNumber(element.fontFamily, `${path}.fontFamily`, issues)
  validateRequiredString(element.text, `${path}.text`, issues)
  validateRequiredString(element.originalText, `${path}.originalText`, issues)
  validateRequiredString(element.textAlign, `${path}.textAlign`, issues)
  validateRequiredString(element.verticalAlign, `${path}.verticalAlign`, issues)
  validateNullableString(element.containerId, `${path}.containerId`, issues)
  validateBoolean(element.autoResize, `${path}.autoResize`, issues)
  validateFiniteNumber(element.lineHeight, `${path}.lineHeight`, issues, { positive: true })
}

function validateLinearElement(element: Record<string, unknown>, path: string, type: string, issues: string[]) {
  validatePointArray(element.points, `${path}.points`, issues, { minLength: 2 })
  validateNullablePoint(element.lastCommittedPoint, `${path}.lastCommittedPoint`, issues)
  validateBinding(element.startBinding, `${path}.startBinding`, issues)
  validateBinding(element.endBinding, `${path}.endBinding`, issues)
  validateArrowhead(element.startArrowhead, `${path}.startArrowhead`, issues)
  validateArrowhead(element.endArrowhead, `${path}.endArrowhead`, issues)
  if (type === 'arrow') {
    validateBoolean(element.elbowed, `${path}.elbowed`, issues)
  }
}

function validateFreedrawElement(element: Record<string, unknown>, path: string, issues: string[]) {
  validatePointArray(element.points, `${path}.points`, issues, { minLength: 1 })
  if (!Array.isArray(element.pressures) || !element.pressures.every(isFiniteNumber)) {
    issues.push(`${path}.pressures must be an array of finite numbers.`)
  }
  validateBoolean(element.simulatePressure, `${path}.simulatePressure`, issues)
  validateNullablePoint(element.lastCommittedPoint, `${path}.lastCommittedPoint`, issues)
}

function validateImageElement(
  element: Record<string, unknown>,
  path: string,
  files: Record<string, unknown>,
  issues: string[]
) {
  const fileId = element.fileId
  validateNullableString(fileId, `${path}.fileId`, issues)
  validateRequiredString(element.status, `${path}.status`, issues)
  validateFiniteTuple(element.scale, `${path}.scale`, issues, 2)
  validateCrop(element.crop, `${path}.crop`, issues)
  if (typeof fileId === 'string' && fileId.trim() && !isPlainObject(files[fileId])) {
    issues.push(`${path}.fileId "${fileId}" does not exist in files.`)
  }
}

function validateFiles(files: Record<string, unknown>, issues: string[]) {
  for (const [fileId, file] of Object.entries(files)) {
    if (!fileId.trim()) {
      issues.push('files contains an empty file id.')
    }
    if (!isPlainObject(file)) {
      issues.push(`files["${fileId}"] must be an object.`)
      continue
    }
    if (file.id !== undefined && file.id !== fileId) {
      issues.push(`files["${fileId}"].id must match the file map key.`)
    }
  }
}

function validateGroupIds(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    issues.push(`${path} must be an array of strings.`)
  }
}

function validateRoundness(value: unknown, path: string, issues: string[]) {
  if (value === null) {
    return
  }
  if (!isPlainObject(value)) {
    issues.push(`${path} must be null or an object.`)
    return
  }
  validateFiniteNumber(value.type, `${path}.type`, issues)
  if (value.value !== undefined) {
    validateFiniteNumber(value.value, `${path}.value`, issues)
  }
}

function validateBoundElements(value: unknown, path: string, issues: string[]) {
  if (value === null) {
    return
  }
  if (!Array.isArray(value)) {
    issues.push(`${path} must be null or an array.`)
    return
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isPlainObject(item)) {
      issues.push(`${itemPath} must be an object.`)
      return
    }
    validateRequiredString(item.id, `${itemPath}.id`, issues)
    const type = readString(item.type)
    if (type !== 'arrow' && type !== 'text') {
      issues.push(`${itemPath}.type must be "arrow" or "text".`)
    }
  })
}

function validatePointArray(value: unknown, path: string, issues: string[], options: { minLength: number }) {
  if (!Array.isArray(value) || value.length < options.minLength) {
    issues.push(`${path} must contain at least ${options.minLength} points.`)
    return
  }
  value.forEach((point, index) => validateFiniteTuple(point, `${path}[${index}]`, issues, 2))
}

function validateNullablePoint(value: unknown, path: string, issues: string[]) {
  if (value === null) {
    return
  }
  validateFiniteTuple(value, path, issues, 2)
}

function validateBinding(value: unknown, path: string, issues: string[]) {
  if (value === null) {
    return
  }
  if (!isPlainObject(value)) {
    issues.push(`${path} must be null or an object.`)
    return
  }
  validateRequiredString(value.elementId, `${path}.elementId`, issues)
  validateFiniteNumber(value.focus, `${path}.focus`, issues)
  validateFiniteNumber(value.gap, `${path}.gap`, issues)
}

function validateCrop(value: unknown, path: string, issues: string[]) {
  if (value === null) {
    return
  }
  if (!isPlainObject(value)) {
    issues.push(`${path} must be null or an object.`)
    return
  }
  for (const field of ['x', 'y', 'width', 'height', 'naturalWidth', 'naturalHeight']) {
    validateFiniteNumber(value[field], `${path}.${field}`, issues)
  }
}

function validateArrowhead(value: unknown, path: string, issues: string[]) {
  if (value === null) {
    return
  }
  if (typeof value !== 'string' || !ARROWHEADS.has(value)) {
    issues.push(`${path} must be null or a supported Excalidraw arrowhead.`)
  }
}

function validateIndex(value: unknown, path: string, issues: string[]) {
  if (value === null || typeof value === 'string') {
    return
  }
  issues.push(`${path} must be a string or null.`)
}

function validateNullableString(value: unknown, path: string, issues: string[]) {
  if (value === null || typeof value === 'string') {
    return
  }
  issues.push(`${path} must be a string or null.`)
}

function validateRequiredString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== 'string') {
    issues.push(`${path} must be a string.`)
  }
}

function validateBoolean(value: unknown, path: string, issues: string[]) {
  if (typeof value !== 'boolean') {
    issues.push(`${path} must be a boolean.`)
  }
}

function validateFiniteNumber(value: unknown, path: string, issues: string[], options: { positive?: boolean } = {}) {
  if (!isFiniteNumber(value) || (options.positive && value <= 0)) {
    issues.push(`${path} must be a ${options.positive ? 'positive ' : ''}finite number.`)
  }
}

function validateFiniteTuple(value: unknown, path: string, issues: string[], length: number) {
  if (!Array.isArray(value) || value.length !== length || !value.every(isFiniteNumber)) {
    issues.push(`${path} must be an array of ${length} finite numbers.`)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJsonValue(item, seen)
      return normalized === undefined ? null : normalized
    })
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const normalized = normalizeJsonValue((value as Record<string, unknown>)[key], seen)
      if (normalized !== undefined) {
        acc[key] = normalized
      }
      return acc
    }, {})
}
