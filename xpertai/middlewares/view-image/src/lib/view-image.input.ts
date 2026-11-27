import { DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL, type ViewImageToolInput } from './view-image.types.js'

/** Keep execution and timeline targets consistent across supported input aliases. */
export function normalizeViewImageTargets(input: ViewImageToolInput) {
  const normalized = [
    ...normalizeTargetValue(input.path),
    ...normalizeTargetValue(input.paths)
  ]
  const uniqueTargets = Array.from(new Set(normalized))

  if (uniqueTargets.length === 0) {
    throw new Error('`view_image` requires at least one non-empty image path.')
  }

  if (uniqueTargets.length > DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL) {
    throw new Error(
      `\`view_image\` accepts at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call. Load additional images in a later model step.`
    )
  }

  return uniqueTargets
}

function normalizeTargetValue(value: ViewImageToolInput['path']) {
  if (value === undefined) {
    return []
  }

  const items = Array.isArray(value) ? value : [value]
  return items.flatMap((item) => expandTargetString(item))
}

function expandTargetString(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('`view_image` JSON array path input must be a valid JSON string array.')
    }

    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('`view_image` JSON array path input must contain only strings.')
    }

    return parsed.map((item) => item.trim()).filter(Boolean)
  }

  return [trimmed]
}
