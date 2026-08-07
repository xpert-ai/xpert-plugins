import { z } from 'zod/v3'

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum)
const identifier = bounded(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const projectId = z.string().uuid()
const operationId = bounded(128).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
)
const baseRevision = z.number().int().min(1)
const changeSummary = bounded(240)
const status = z.enum(['pending', 'accepted', 'dismissed'])

export const listStoryAdaptationSuggestionsSchema = z
  .object({
    projectId,
    expectedRevision: baseRevision.optional(),
    status: status.optional(),
    page: z.number().int().min(1).max(1_000).default(1),
    pageSize: z.number().int().min(1).max(40).default(20)
  })
  .strict()

export const createStoryAdaptationSuggestionSchema = z
  .object({
    projectId,
    operationId,
    baseRevision,
    suggestionId: identifier.describe(
      'Stable suggestion identifier unique inside this production document.'
    ),
    episodeId: identifier,
    sceneId: identifier.optional(),
    shotId: identifier.optional(),
    originalText: bounded(4_000),
    suggestedText: bounded(4_000),
    reason: bounded(1_000),
    changeSummary
  })
  .strict()
  .refine((value) => !value.shotId || Boolean(value.sceneId), {
    path: ['sceneId'],
    message: 'sceneId is required when shotId is provided.'
  })

export const updateStoryAdaptationSuggestionSchema = z
  .object({
    projectId,
    operationId,
    baseRevision,
    suggestionId: identifier,
    suggestedText: bounded(4_000).optional(),
    reason: bounded(1_000).optional(),
    status: status.optional(),
    changeSummary
  })
  .strict()
  .refine(
    (value) =>
      value.suggestedText !== undefined ||
      value.reason !== undefined ||
      value.status !== undefined,
    { message: 'At least one suggestion field must change.' }
  )

export const deleteStoryAdaptationSuggestionSchema = z
  .object({
    projectId,
    operationId,
    baseRevision,
    suggestionId: identifier,
    changeSummary
  })
  .strict()
