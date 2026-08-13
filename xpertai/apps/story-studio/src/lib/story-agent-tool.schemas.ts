import { z } from 'zod/v3'
import {
  STORY_ASPECT_RATIOS,
  STORY_PRODUCTION_FORMATS,
  STORY_PROJECT_STATUSES
} from './types.js'

const boundedString = (maximum: number) => z.string().trim().min(1).max(maximum)

const projectIdSchema = z
  .string()
  .uuid()
  .describe(
    'Story project UUID returned by story_create_project, story_search_projects, or the current Workbench context.'
  )

const operationIdSchema = boundedString(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/,
    'Use a stable operation id containing 8–128 letters, numbers, dots, underscores, colons, or dashes.'
  )
  .describe(
    'Idempotency key for exactly this mutation. Reuse only when retrying the same payload.'
  )

const changeSummarySchema = boundedString(240).describe(
  'Short user-visible description of this exact mutation.'
)

const statusSchema = z.enum(STORY_PROJECT_STATUSES)
const productionFormatSchema = z.enum(STORY_PRODUCTION_FORMATS)
const aspectRatioSchema = z.enum(STORY_ASPECT_RATIOS)
const tagsSchema = z
  .array(boundedString(64))
  .max(20)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: 'Tags must be unique.'
  })

export const createStoryProjectSchema = z
  .object({
    operationId: operationIdSchema,
    title: boundedString(160),
    description: z.string().trim().max(2_000).optional(),
    premise: z.string().trim().max(8_000).optional(),
    productionFormat: productionFormatSchema.optional(),
    aspectRatio: aspectRatioSchema.optional(),
    targetDurationSeconds: z
      .number()
      .int()
      .min(5)
      .max(28_800)
      .describe(
        'Target duration as an integer number of seconds, for example 120. Never pass a string, a clock value, or text such as "2 minutes".'
      )
      .optional(),
    tags: tagsSchema.optional(),
    changeSummary: changeSummarySchema
  })
  .strict()

export const searchStoryProjectsSchema = z
  .object({
    status: statusSchema.optional(),
    productionFormat: productionFormatSchema.optional(),
    search: z.string().trim().max(160).optional(),
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(50).optional()
  })
  .strict()

export const getStoryProjectSummarySchema = z
  .object({
    projectId: projectIdSchema,
    expectedRevision: z.number().int().min(1).optional()
  })
  .strict()

export const getStoryProjectRevisionSchema = z
  .object({
    projectId: projectIdSchema
  })
  .strict()

export const updateStoryProjectSchema = z
  .object({
    projectId: projectIdSchema,
    operationId: operationIdSchema,
    baseRevision: z
      .number()
      .int()
      .min(1)
      .describe(
        'Current revision from Workbench context, the latest mutation receipt, or story_get_project_revision.'
      ),
    title: boundedString(160).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    premise: z.string().trim().max(8_000).nullable().optional(),
    productionFormat: productionFormatSchema.optional(),
    aspectRatio: aspectRatioSchema.optional(),
    targetDurationSeconds: z
      .number()
      .int()
      .min(5)
      .max(28_800)
      .describe(
        'Target duration as an integer number of seconds, for example 120. Never pass a string, a clock value, or text such as "2 minutes". Pass null only to clear the target.'
      )
      .nullable()
      .optional(),
    tags: tagsSchema.optional(),
    changeSummary: changeSummarySchema
  })
  .strict()
  .refine(
    (value) =>
      [
        value.title,
        value.description,
        value.premise,
        value.productionFormat,
        value.aspectRatio,
        value.targetDurationSeconds,
        value.tags
      ].some((field) => field !== undefined),
    {
      message: 'At least one project field must change.'
    }
  )

export const updateStoryProjectStatusSchema = z
  .object({
    projectId: projectIdSchema,
    operationId: operationIdSchema,
    baseRevision: z.number().int().min(1),
    status: statusSchema,
    reason: z.string().trim().max(1_000).optional(),
    changeSummary: changeSummarySchema
  })
  .strict()

export const reportStoryFailureSchema = z
  .object({
    projectId: projectIdSchema,
    operationId: operationIdSchema,
    baseRevision: z.number().int().min(1),
    failureCode: boundedString(100).regex(
      /^[a-z][a-z0-9_]*$/,
      'Use a stable lowercase snake_case failure code.'
    ),
    errorMessage: boundedString(2_000),
    recoverable: z.boolean(),
    changeSummary: changeSummarySchema
  })
  .strict()
