import { z } from 'zod/v3'

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum)
const identifier = bounded(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const projectId = z
  .string()
  .uuid()
  .describe(
    'Story project UUID returned by project creation/search or the current Workbench context.'
  )
const operationId = bounded(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
  .describe(
    'Idempotency key for exactly this mutation. Reuse it only for an identical retry.'
  )
const baseRevision = z
  .number()
  .int()
  .min(1)
  .describe(
    'Current project revision from Workbench context, production context, or the latest successful mutation receipt.'
  )
const planningRevision = baseRevision.optional().describe(
  'Optional planning revision. For a new entity, the service reads the authoritative revision and safely rebases the create. For an existing entity update, pass the exact current revision. Never predict a future revision.'
)
const changeSummary = bounded(240).describe(
  'Short user-visible description of this exact mutation.'
)
const episodeScript = bounded(20_000)
  .refine(
    (value) => !value.includes('"'),
    'script must not contain ASCII double quotation marks. Use typographic quotation marks such as “…” or 「…」 for dialogue.'
  )
  .describe(
    'Complete episode script as one JSON string. Never place an unescaped ASCII double quote (") inside this value. Use typographic quotation marks such as “…” or 「…」 for dialogue. In serialized tool arguments, newlines must be valid JSON escapes.'
  )

const categoryDetails = z
  .object({
    identity: z.string().trim().max(1_000).optional(),
    appearance: z.string().trim().max(1_000).optional(),
    wardrobe: z.string().trim().max(1_000).optional(),
    voice: z.string().trim().max(1_000).optional(),
    environment: z.string().trim().max(1_000).optional(),
    lighting: z.string().trim().max(1_000).optional(),
    material: z.string().trim().max(1_000).optional(),
    condition: z.string().trim().max(1_000).optional(),
    storyFunction: z.string().trim().max(1_000).optional(),
    palette: z.string().trim().max(1_000).optional(),
    lens: z.string().trim().max(1_000).optional(),
    continuity: z.string().trim().max(1_000).optional()
  })
  .strict()

export const getStoryProductionContextSchema = z
  .object({
    projectId,
    expectedRevision: z.number().int().min(1).optional()
  })
  .strict()

export const initializeStoryProductionSchema = z
  .object({
    projectId,
    operationId,
    baseRevision,
    sourceSynopsis: bounded(12_000),
    adaptationGoal: bounded(4_000),
    visualStyle: bounded(2_000),
    audience: z.string().trim().max(500).optional(),
    changeSummary
  })
  .strict()

export const updateStoryProductionBriefSchema = z
  .object({
    projectId,
    operationId,
    baseRevision,
    sourceSynopsis: bounded(12_000).optional(),
    adaptationGoal: bounded(4_000).optional(),
    visualStyle: bounded(2_000).optional(),
    audience: z.string().trim().max(500).nullable().optional(),
    changeSummary
  })
  .strict()
  .refine(
    (value) =>
      value.sourceSynopsis !== undefined ||
      value.adaptationGoal !== undefined ||
      value.visualStyle !== undefined ||
      value.audience !== undefined,
    'At least one production brief field must change.'
  )

export const upsertStoryProductionCharacterSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: planningRevision,
    character: z
      .object({
        id: identifier,
        name: bounded(120),
        description: bounded(2_000),
        prompt: bounded(4_000),
        role: z.string().trim().max(240).optional(),
        visualDescription: z.string().trim().max(2_000).optional(),
        negativePrompt: z.string().trim().max(2_000).optional(),
        continuityNotes: z.string().trim().max(2_000).optional(),
        categoryDetails: categoryDetails.optional()
      })
      .strict(),
    changeSummary
  })
  .strict()

export const upsertStoryProductionEpisodeSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: planningRevision,
    episode: z
      .object({
        id: identifier,
        order: z.number().int().min(1).max(100),
        title: bounded(160),
        summary: bounded(2_000),
        script: episodeScript,
        targetDurationSeconds: z
          .number()
          .int()
          .min(5)
          .max(1_800)
          .describe(
            'Episode duration as an integer number of seconds, for example 120. Never pass a string.'
          )
          .optional()
      })
      .strict(),
    changeSummary
  })
  .strict()

export const upsertStoryProductionAssetSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: planningRevision,
    asset: z
      .object({
        id: identifier,
        kind: z.enum(['location', 'prop', 'style']),
        name: bounded(160),
        description: bounded(2_000),
        prompt: bounded(4_000),
        negativePrompt: z.string().trim().max(2_000).optional(),
        continuityNotes: z.string().trim().max(2_000).optional(),
        categoryDetails: categoryDetails.optional()
      })
      .strict(),
    changeSummary
  })
  .strict()

export const upsertStoryProductionSceneMetadataSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: planningRevision,
    scene: z
      .object({
        id: identifier,
        episodeId: identifier.nullable().optional(),
        order: z.number().int().min(1).max(100),
        title: bounded(160),
        summary: bounded(2_000),
        location: z.string().trim().max(200).nullable().optional(),
        timeOfDay: z.string().trim().max(100).nullable().optional()
      })
      .strict(),
    changeSummary
  })
  .strict()

export const validateStoryProductionSchema = z
  .object({
    projectId,
    expectedRevision: z.number().int().min(1).optional()
  })
  .strict()
