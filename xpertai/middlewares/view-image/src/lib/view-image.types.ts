import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const VIEW_IMAGE_MIDDLEWARE_NAME = 'ViewImageMiddleware'
export const VIEW_IMAGE_TOOL_NAME = 'view_image'
export const VIEW_IMAGE_METADATA_KEY = 'view_image'
export const DEFAULT_SANDBOX_ROOT = '/workspace'
export const DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL = 3
export const DEFAULT_VIEW_IMAGE_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const DEFAULT_VIEW_IMAGE_MAX_EDGE = 1024
export const DEFAULT_VIEW_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000
export const VIEW_IMAGE_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const ViewImagePluginConfigSchema = z.object({})

export type ViewImagePluginConfig = z.infer<typeof ViewImagePluginConfigSchema>

export const ViewImagePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}

export const ViewedImageDescriptorSchema = z.object({
  target: z.string(),
  resolvedPath: z.string(),
  downloadPath: z.string(),
  fileName: z.string(),
  mimeType: z.enum(VIEW_IMAGE_ALLOWED_MIME_TYPES),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
})

export type ViewedImageDescriptor = z.infer<typeof ViewedImageDescriptorSchema>

export const ViewedImageItemSchema = ViewedImageDescriptorSchema.extend({
  dataUrl: z.string()
})

export type ViewedImageItem = z.infer<typeof ViewedImageItemSchema>

export const ViewedImageBatchSchema = z.object({
  toolCallId: z.string(),
  createdAt: z.string(),
  items: z.array(ViewedImageItemSchema).min(1)
})

export type ViewedImageBatch = z.infer<typeof ViewedImageBatchSchema>

export const ViewedImageBatchMetadataSchema = z.object({
  toolCallId: z.string(),
  createdAt: z.string(),
  items: z.array(ViewedImageDescriptorSchema).min(1)
})

export type ViewedImageBatchMetadata = z.infer<typeof ViewedImageBatchMetadataSchema>

export const ViewImageToolInputSchema = z.object({
  path: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Sandbox image path or paths. Prefer relative paths from the sandbox working directory. Absolute paths are only supported when they still refer to files inside that same working directory. Pass multiple paths in one call when you need to inspect multiple images.'
    )
})

export type ViewImageToolInput = z.infer<typeof ViewImageToolInputSchema>
