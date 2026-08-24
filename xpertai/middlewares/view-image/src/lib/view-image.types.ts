import { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const VIEW_IMAGE_PLUGIN_NAME = '@xpert-ai/plugin-view-image'
export const VIEW_IMAGE_MIDDLEWARE_NAME = 'ViewImageMiddleware'
export const VIEW_IMAGE_TOOL_NAME = 'view_image'
export const VIEW_IMAGE_METADATA_KEY = 'view_image'
export const VIEW_IMAGE_ARTIFACT_RESOURCE_TYPE = 'sandbox-image'
export const VIEW_IMAGE_ARTIFACT_FOLDER = '.xpert/tool-output/view-image'
export const DEFAULT_SANDBOX_ROOT = '/workspace'
export const DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL = 3
export const DEFAULT_VIEW_IMAGE_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const DEFAULT_VIEW_IMAGE_COMPRESSION_PERCENT = 100
export const DEFAULT_VIEW_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000
export const VIEW_IMAGE_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const ViewImagePluginConfigSchema = z.object({}).strict()

export type ViewImagePluginConfig = z.infer<typeof ViewImagePluginConfigSchema>

export const ViewImagePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}

export const ViewImageMiddlewareConfigSchema = z
  .object({
    compressionPercent: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .default(DEFAULT_VIEW_IMAGE_COMPRESSION_PERCENT)
  })
  .strict()

export type ViewImageMiddlewareConfig = z.infer<typeof ViewImageMiddlewareConfigSchema>

export const ViewImageMiddlewareConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    compressionPercent: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      default: DEFAULT_VIEW_IMAGE_COMPRESSION_PERCENT,
      title: {
        en_US: 'Compression Size (%)',
        zh_Hans: '压缩尺寸（%）'
      },
      description: {
        en_US:
          'Resize image width and height to this percentage before attaching them to the model. This is not a target file-size percentage; the final KB/MB depends on image content and encoding. 100% keeps the original dimensions.',
        zh_Hans:
          '图片注入模型前按宽高比例缩放。这里不是目标文件体积比例；最终 KB/MB 会受图片内容和编码影响。100% 表示保持原始尺寸。'
      },
      'x-ui': {
        component: 'slider',
        inputs: {
          min: 0,
          max: 100,
          step: 1
        }
      }
    }
  }
}

export const ViewedImageDescriptorSchema = z
  .object({
    target: z.string(),
    resolvedPath: z.string(),
    downloadPath: z.string(),
    fileName: z.string(),
    mimeType: z.enum(VIEW_IMAGE_ALLOWED_MIME_TYPES),
    size: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional()
  })
  .strict()

export type ViewedImageDescriptor = z.infer<typeof ViewedImageDescriptorSchema>

export const ViewedImageItemSchema = ViewedImageDescriptorSchema.extend({
  dataUrl: z.string()
})

export type ViewedImageItem = z.infer<typeof ViewedImageItemSchema>

export const ViewedImageBatchSchema = z
  .object({
    toolCallId: z.string(),
    createdAt: z.string(),
    items: z.array(ViewedImageItemSchema).min(1)
  })
  .strict()

export type ViewedImageBatch = z.infer<typeof ViewedImageBatchSchema>

export const ViewedImageBatchMetadataSchema = z
  .object({
    toolCallId: z.string(),
    createdAt: z.string(),
    items: z.array(ViewedImageDescriptorSchema).min(1)
  })
  .strict()

export type ViewedImageBatchMetadata = z.infer<typeof ViewedImageBatchMetadataSchema>

const ViewImageToolPathValueSchema = z.union([
  z.string().trim().min(1).max(4096),
  z
    .array(z.string().trim().min(1).max(4096))
    .min(1)
    .max(DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL, {
      message: `view_image accepts at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call.`
    })
])

export const ViewImageToolInputSchema = z
  .object({
    path: ViewImageToolPathValueSchema.optional().describe(
      `Sandbox workspace image path or paths, with at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call and per model step. Prefer relative paths from the sandbox workspace root, for example \`sessions/thread/files/page.png\`. Absolute paths are only supported when they still refer to files inside that same workspace root. JSON string arrays are accepted for compatibility. Load ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL + 1}+ known images across separate model steps, not multiple same-step view_image calls.`
    ),
    paths: ViewImageToolPathValueSchema.optional().describe(
      `Alias for \`path\` when passing one or more sandbox workspace image paths, with at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call and per model step.`
    )
  })
  .strict()
  .refine((value) => value.path !== undefined || value.paths !== undefined, {
    message: '`view_image` requires `path` or `paths`.'
  })

export type ViewImageToolInput = z.infer<typeof ViewImageToolInputSchema>
