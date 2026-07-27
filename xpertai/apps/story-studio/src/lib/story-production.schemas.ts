import { z } from 'zod/v3'

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum)
const identifier = bounded(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const projectId = z.string().uuid()
const operationId = bounded(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
const changeSummary = bounded(240)

const candidateSchema = z
  .object({
    id: identifier,
    kind: z.enum(['image', 'video', 'audio']),
    label: bounded(160),
    selected: z.boolean().optional(),
    fileUrl: z.string().url().max(2_000).optional(),
    workspacePath: bounded(1_000).optional(),
    prompt: z.string().trim().max(4_000).optional(),
    providerReceipt: z.record(z.unknown()).optional(),
    originalName: bounded(240).optional(),
    mimeType: bounded(160).optional(),
    size: z.number().int().positive().max(2 * 1024 * 1024 * 1024).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
  })
  .strict()

const sourceMaterialSchema = z
  .object({
    id: identifier,
    title: bounded(240),
    type: z.enum(['text', 'file', 'url']),
    excerpt: bounded(12_000),
    status: z.enum(['imported', 'reviewed'])
  })
  .strict()

const beatSchema = z
  .object({
    id: identifier,
    title: bounded(160),
    summary: bounded(2_000),
    purpose: bounded(1_000)
  })
  .strict()

const storyPlanSchema = z
  .object({
    logline: bounded(2_000),
    theme: bounded(500),
    tone: bounded(500),
    beats: z.array(beatSchema).min(1).max(40)
  })
  .strict()

const episodeSchema = z
  .object({
    id: identifier,
    order: z.number().int().min(1).max(100),
    title: bounded(160),
    summary: bounded(2_000),
    script: bounded(20_000),
    targetDurationSeconds: z.number().min(5).max(1_800).optional()
  })
  .strict()

const assetSchema = z
  .object({
    id: identifier,
    kind: z.enum(['character', 'location', 'prop', 'style']),
    name: bounded(160),
    description: bounded(2_000),
    prompt: bounded(4_000),
    candidates: z.array(candidateSchema).max(12).optional()
  })
  .strict()

const shotSchema = z
  .object({
    id: identifier,
    title: bounded(160),
    composition: bounded(2_000),
    action: bounded(2_000),
    camera: bounded(500),
    dialogue: z.string().trim().max(2_000).optional(),
    dialogueSpeakerId: identifier.optional(),
    dialogueType: z.enum(['dialogue', 'voice_over', 'off_screen']).optional(),
    soundEffects: z.array(bounded(240)).max(12).optional(),
    durationSeconds: z.number().min(1).max(20),
    candidates: z.array(candidateSchema).max(12).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dialogueSpeakerId && !value.dialogue?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dialogueSpeakerId'],
        message: 'dialogueSpeakerId requires dialogue.'
      })
    }
  })

const sceneSchema = z
  .object({
    id: identifier,
    order: z.number().int().min(1).max(100),
    title: bounded(160),
    summary: bounded(2_000),
    location: z.string().trim().max(200).optional(),
    timeOfDay: z.string().trim().max(100).optional(),
    shots: z.array(shotSchema).min(1).max(24)
  })
  .strict()

const characterSchema = z
  .object({
    id: identifier,
    name: bounded(120),
    role: z.string().trim().max(240).optional(),
    visualDescription: z.string().trim().max(2_000).optional(),
    voiceReference: z
      .object({
        url: z.string().url().max(2_000),
        label: bounded(240),
        license: z.string().trim().max(240).optional(),
        sourceUrl: z.string().url().max(2_000).optional()
      })
      .strict()
      .optional()
  })
  .strict()

export const storyProductionDocumentSchema = z
  .object({
    sourceSynopsis: bounded(12_000),
    adaptationGoal: bounded(4_000),
    visualStyle: bounded(2_000),
    audience: z.string().trim().max(500).optional(),
    sourceMaterials: z.array(sourceMaterialSchema).max(100).optional(),
    storyPlan: storyPlanSchema.optional(),
    episodes: z.array(episodeSchema).max(100).optional(),
    assets: z.array(assetSchema).max(160).optional(),
    characters: z.array(characterSchema).max(40),
    scenes: z.array(sceneSchema).min(1).max(40)
  })
  .strict()
  .superRefine((value, context) => {
    uniqueIds(value.characters.map((item) => item.id), 'Character ids', context)
    uniqueIds(
      (value.sourceMaterials ?? []).map((item) => item.id),
      'Source material ids',
      context
    )
    uniqueIds(
      (value.storyPlan?.beats ?? []).map((item) => item.id),
      'Story beat ids',
      context
    )
    uniqueIds(
      (value.episodes ?? []).map((item) => item.id),
      'Episode ids',
      context
    )
    uniqueIds(
      (value.episodes ?? []).map((item) => item.order),
      'Episode order values',
      context
    )
    uniqueIds(
      (value.assets ?? []).map((item) => item.id),
      'Asset ids',
      context
    )
    uniqueIds(value.scenes.map((item) => item.id), 'Scene ids', context)
    uniqueIds(value.scenes.map((item) => item.order), 'Scene order values', context)
    const shots = value.scenes.flatMap((scene) => scene.shots)
    const characterIds = new Set(value.characters.map((item) => item.id))
    value.scenes.forEach((scene, sceneIndex) => {
      scene.shots.forEach((shot, shotIndex) => {
        if (
          shot.dialogueSpeakerId &&
          !characterIds.has(shot.dialogueSpeakerId)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'scenes',
              sceneIndex,
              'shots',
              shotIndex,
              'dialogueSpeakerId'
            ],
            message: `Dialogue speaker ${shot.dialogueSpeakerId} was not found in characters.`
          })
        }
      })
    })
    uniqueIds(shots.map((item) => item.id), 'Shot ids', context)
    uniqueIds(
      [
        ...(value.assets ?? []).flatMap((asset) => asset.candidates ?? []),
        ...shots.flatMap((shot) => shot.candidates ?? [])
      ].map((item) => item.id),
      'Media candidate ids',
      context
    )
    const duration = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0)
    if (duration < 5 || duration > 300) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total shot duration must be between 5 and 300 seconds.'
      })
    }
  })

export const saveStoryProductionSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: z.number().int().min(1),
    production: storyProductionDocumentSchema,
    changeSummary
  })
  .strict()

export const getStoryProductionSchema = z
  .object({ projectId })
  .strict()

export const attachGeneratedVideoSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: z.number().int().min(1),
    sceneId: identifier,
    shotId: identifier,
    candidateId: identifier,
    label: bounded(160),
    file: z.union([bounded(2_000), z.object({}).passthrough()]),
    prompt: z.string().trim().max(4_000).optional(),
    providerReceipt: z
      .object({
        provider: z.literal('seedream_aigc'),
        taskId: bounded(200),
        model: bounded(200).optional(),
        status: bounded(80)
      })
      .strict(),
    select: z.boolean().optional(),
    changeSummary
  })
  .strict()

function uniqueIds(
  values: Array<string | number>,
  label: string,
  context: z.RefinementCtx
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} must be unique.`
    })
  }
}
