export const DEFAULT_SCENE_ANIMATION_STEP_DELAY_MS = 120

export type SceneDiffStepType = 'delete' | 'update' | 'add'

export interface SceneDiffStep {
  type: SceneDiffStepType
  id: string
  elements: Record<string, unknown>[]
}

export interface SceneAnimationBaseOptions {
  discardCurrentImages?: boolean
}

export function buildSceneDiffSteps(currentElements: unknown[], targetElements: unknown[]): SceneDiffStep[] {
  const current = toElementRecords(currentElements)
  const target = toElementRecords(targetElements)
  const targetById = new Map(target.map(toElementIdEntry).filter(hasStringKey))
  const currentById = new Map(current.map(toElementIdEntry).filter(hasStringKey))
  const steps: SceneDiffStep[] = []
  let working = current.slice()

  for (const element of current) {
    const id = readElementId(element)
    if (!id || targetById.has(id)) {
      continue
    }
    working = working.filter((candidate) => readElementId(candidate) !== id)
    steps.push({ type: 'delete', id, elements: working.slice() })
  }

  for (const targetElement of target) {
    const id = readElementId(targetElement)
    if (!id || !currentById.has(id)) {
      continue
    }
    const currentElement = currentById.get(id)
    if (stableStringify(currentElement) === stableStringify(targetElement)) {
      continue
    }
    working = working.map((candidate) => (readElementId(candidate) === id ? targetElement : candidate))
    steps.push({ type: 'update', id, elements: working.slice() })
  }

  for (const targetElement of target) {
    const id = readElementId(targetElement)
    if (!id || currentById.has(id)) {
      continue
    }
    working = [...working, targetElement]
    steps.push({ type: 'add', id, elements: working.slice() })
  }

  if (steps.length > 0 && stableStringify(working) !== stableStringify(target)) {
    const last = steps[steps.length - 1]
    steps[steps.length - 1] = { ...last, elements: target.slice() }
  }

  return steps
}

export function prepareSceneAnimationBaseElements(
  currentElements: unknown[],
  targetElements: unknown[],
  options: SceneAnimationBaseOptions = {}
) {
  const current = toElementRecords(currentElements)
  if (!options.discardCurrentImages) {
    return current
  }
  const target = toElementRecords(targetElements)
  if (target.some(isImageElement)) {
    return current
  }
  return current.filter((element) => !isImageElement(element))
}

function toElementRecords(elements: unknown[]) {
  return (Array.isArray(elements) ? elements : []).filter(isRecord)
}

function readElementId(element: Record<string, unknown>) {
  return typeof element.id === 'string' && element.id.trim() ? element.id.trim() : null
}

function toElementIdEntry(element: Record<string, unknown>): [string | null, Record<string, unknown>] {
  return [readElementId(element), element]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isImageElement(element: Record<string, unknown>) {
  return element.type === 'image'
}

function hasStringKey(entry: [string | null, Record<string, unknown>]): entry is [string, Record<string, unknown>] {
  return Boolean(entry[0])
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeJsonValue(value))
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
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, mapValue]) => [String(key), normalizeJsonValue(mapValue, seen)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => normalizeJsonValue(item, seen))
  }
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const normalized = normalizeJsonValue((value as Record<string, unknown>)[key], seen)
      if (normalized !== undefined) {
        acc[key] = normalized
      }
      return acc
    }, {})
}
