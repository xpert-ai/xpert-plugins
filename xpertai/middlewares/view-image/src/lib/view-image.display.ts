import type { JSONValue } from '@xpert-ai/contracts'
import { normalizeViewImageTargets } from './view-image.input.js'
import { VIEW_IMAGE_TOOL_NAME, ViewImageToolInputSchema } from './view-image.types.js'

export const viewImagePresentation = {
  tool: VIEW_IMAGE_TOOL_NAME,
  input(value: unknown) {
    const parsed = ViewImageToolInputSchema.safeParse(value)
    return parsed.success ? parsed.data : undefined
  },
  output: (value: unknown) => typeof value === 'string' ? value : undefined,
  error: (value: unknown) => typeof value === 'string' ? value : undefined,
  attachments: 'images' as const
}

export const viewImageDisplay = {
  tool: VIEW_IMAGE_TOOL_NAME,
  activity: { kind: 'image', action: 'view' } as const,
  target(input: JSONValue) {
    const parsed = ViewImageToolInputSchema.safeParse(input)
    if (!parsed.success) return undefined
    try {
      return normalizeViewImageTargets(parsed.data)
        .map((value) => value.split(/[\\/]/).filter(Boolean).slice(-2).join('/')).join(', ')
    } catch {
      // Invalid compatibility input must not interrupt the tool event stream.
      return undefined
    }
  }
}
