import { z } from 'zod/v3'
import { STORY_SHOT_TRANSITIONS } from './production-types.js'

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum)
const identifier = bounded(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const projectId = z.string().uuid()
const operationId = bounded(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
const changeSummary = bounded(240)
const dialogueTypeSchema = z.enum(['dialogue', 'voice_over', 'off_screen'])
const shotTransitionSchema = z.enum(STORY_SHOT_TRANSITIONS)
const shotContinuitySubjectStateSchema = z.object({
  assetId: identifier,
  visible: z.boolean().optional(),
  location: z.string().trim().max(500).optional(),
  pose: z.string().trim().max(500).optional(),
  actionPhase: z.string().trim().max(500).optional(),
  facing: z.string().trim().max(240).optional(),
  screenPosition: z.string().trim().max(240).optional(),
  heldPropAssetIds: z.array(identifier).max(12).optional(),
  wardrobe: z.string().trim().max(500).optional(),
  emotion: z.string().trim().max(500).optional()
}).strict()
const shotContinuityStateSchema = z.object({
  summary: z.string().trim().max(1_000).optional(),
  environment: z.string().trim().max(1_000).optional(),
  subjects: z.array(shotContinuitySubjectStateSchema).max(16).optional()
}).strict()
const shotContinuitySchema = z.object({
  transition: shotTransitionSchema,
  fromShotId: identifier.optional(),
  startState: shotContinuityStateSchema.optional(),
  endState: shotContinuityStateSchema.optional()
}).strict()

const assetReferenceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('continuity_view'),
      key: z.enum([
        'front',
        'three_quarter',
        'profile',
        'back',
        'wide',
        'reverse',
        'detail',
        'alternate'
      ])
    })
    .strict(),
  z
    .object({
      type: z.literal('expression'),
      key: z.enum(['neutral', 'happy', 'sad', 'angry'])
    })
    .strict(),
  z.object({ type: z.literal('general') }).strict()
])

const generatedAssetReferenceSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value
    const serialized = value.trim()
    if (!serialized.startsWith('{') || !serialized.endsWith('}')) {
      return value
    }
    try {
      return JSON.parse(serialized)
    } catch {
      return value
    }
  },
  assetReferenceSchema
)

const shotVideoSettingsSchema = z
  .object({
    generatorId: identifier.optional(),
    model: bounded(200).optional(),
    resolution: bounded(80).optional(),
    aspectRatio: bounded(40).optional(),
    fps: z.number().int().min(1).max(120).optional(),
    takeCount: z.number().int().min(1).max(4).optional(),
    referenceAssetIds: z.array(identifier).max(8).optional(),
    referenceImageCandidateIds: z.array(identifier).max(12).optional()
  })
  .strict()

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
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    assetReference: assetReferenceSchema.optional()
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

const adaptationSuggestionSchema = z
  .object({
    id: identifier,
    episodeId: identifier,
    sceneId: identifier.optional(),
    shotId: identifier.optional(),
    originalText: bounded(4_000),
    suggestedText: bounded(4_000),
    reason: bounded(1_000),
    status: z.enum(['pending', 'accepted', 'dismissed']),
    createdBy: z.enum(['assistant', 'user']),
    createdAt: bounded(64)
  })
  .strict()

const storyPlanSchema = z
  .object({
    logline: bounded(2_000),
    theme: bounded(500),
    tone: bounded(500),
    beats: z.array(beatSchema).min(1).max(40),
    adaptationSuggestions: z
      .array(adaptationSuggestionSchema)
      .max(40)
      .optional()
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
    negativePrompt: z.string().trim().max(2_000).optional(),
    continuityNotes: z.string().trim().max(2_000).optional(),
    categoryDetails: z
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
      .optional(),
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
    dialogueType: dialogueTypeSchema.optional(),
    soundEffects: z.array(bounded(240)).max(12).optional(),
    generationPrompt: z.string().trim().max(4_000).optional(),
    emotion: z.string().trim().max(1_000).optional(),
    lens: z.string().trim().max(240).optional(),
    lighting: z.string().trim().max(500).optional(),
    colorTone: z.string().trim().max(500).optional(),
    weather: z.string().trim().max(240).optional(),
    continuity: shotContinuitySchema.optional(),
    videoSettings: shotVideoSettingsSchema.optional(),
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
    episodeId: identifier.optional(),
    order: z.number().int().min(1).max(100),
    title: bounded(160),
    summary: bounded(2_000),
    location: z.string().trim().max(200).optional(),
    timeOfDay: z.string().trim().max(100).optional(),
    shots: z.array(shotSchema).min(1).max(24)
  })
  .strict()

const shotDialogueInputSchema = z
  .object({
    text: bounded(2_000),
    speakerId: identifier.optional(),
    type: dialogueTypeSchema.optional()
  })
  .strict()

const productionShotUpsertFields = {
  id: identifier,
  title: bounded(160).optional(),
  composition: bounded(2_000).optional(),
  action: bounded(2_000).optional(),
  camera: bounded(500).optional(),
  dialogue: shotDialogueInputSchema.nullable().optional(),
  soundEffects: z.array(bounded(240)).max(12).optional(),
  generationPrompt: z.string().trim().max(4_000).optional(),
  emotion: z.string().trim().max(1_000).optional(),
  lens: z.string().trim().max(240).optional(),
  lighting: z.string().trim().max(500).optional(),
  colorTone: z.string().trim().max(500).optional(),
  weather: z.string().trim().max(240).optional(),
  continuity: shotContinuitySchema.optional(),
  durationSeconds: z.number().min(1).max(20).optional()
}

const productionShotFullUpsertSchema = z
  .object({
    ...productionShotUpsertFields,
    title: bounded(160),
    composition: bounded(2_000),
    action: bounded(2_000),
    camera: bounded(500),
    durationSeconds: z.number().min(1).max(20)
  })
  .strict()

const productionShotPatchSchema = z
  .object(productionShotUpsertFields)
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'id'),
    'At least one shot field besides id must be provided.'
  )

const productionSceneUpsertSchema = z
  .object({
    id: identifier,
    episodeId: identifier.optional(),
    order: z.number().int().min(1).max(100),
    title: bounded(160),
    summary: bounded(2_000),
    location: z.string().trim().max(200).optional(),
    timeOfDay: z.string().trim().max(100).optional(),
    shots: z.array(productionShotFullUpsertSchema).min(1).max(24)
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
        sourceUrl: z.string().url().max(2_000).optional(),
        workspacePath: bounded(2_000).optional(),
        originalName: bounded(500).optional(),
        mimeType: bounded(200).optional(),
        size: z.number().int().positive().max(20 * 1024 * 1024).optional()
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
      (value.storyPlan?.adaptationSuggestions ?? []).map(
        (item) => item.id
      ),
      'Adaptation suggestion ids',
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
    const episodeIds = new Set((value.episodes ?? []).map((item) => item.id))
    const sceneIds = new Set(value.scenes.map((item) => item.id))
    const shotIds = new Set(shots.map((item) => item.id))
    value.scenes.forEach((scene, sceneIndex) => {
      if (scene.episodeId && !episodeIds.has(scene.episodeId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', sceneIndex, 'episodeId'],
          message: `Episode ${scene.episodeId} was not found.`
        })
      }
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
    ;(value.storyPlan?.adaptationSuggestions ?? []).forEach(
      (suggestion, suggestionIndex) => {
        if (!episodeIds.has(suggestion.episodeId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'storyPlan',
              'adaptationSuggestions',
              suggestionIndex,
              'episodeId'
            ],
            message: `Suggestion episode ${suggestion.episodeId} was not found.`
          })
        }
        if (suggestion.sceneId && !sceneIds.has(suggestion.sceneId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'storyPlan',
              'adaptationSuggestions',
              suggestionIndex,
              'sceneId'
            ],
            message: `Suggestion scene ${suggestion.sceneId} was not found.`
          })
        }
        if (suggestion.shotId && !shotIds.has(suggestion.shotId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'storyPlan',
              'adaptationSuggestions',
              suggestionIndex,
              'shotId'
            ],
            message: `Suggestion shot ${suggestion.shotId} was not found.`
          })
        }
      }
    )
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

export const startStoryProductionSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: z.number().int().min(1),
    sourceSynopsis: bounded(12_000),
    adaptationGoal: bounded(4_000),
    visualStyle: bounded(2_000),
    audience: z.string().trim().max(500).optional(),
    sourceMaterials: z.array(sourceMaterialSchema).max(100).optional(),
    storyPlan: storyPlanSchema.optional(),
    episodes: z.array(episodeSchema).max(100).optional(),
    assets: z.array(assetSchema).max(160).optional(),
    characters: z.array(characterSchema).max(40),
    firstScene: productionSceneUpsertSchema,
    changeSummary
  })
  .strict()

export const upsertStoryProductionSceneSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: z.number().int().min(1),
    scene: productionSceneUpsertSchema,
    changeSummary
  })
  .strict()

export const upsertStoryProductionShotSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: z.number().int().min(1),
    sceneId: identifier,
    insertAfterShotId: identifier.optional(),
    shot: productionShotPatchSchema,
    changeSummary
  })
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

const attachAssetImageFields = {
  projectId,
  operationId,
  baseRevision: z.number().int().min(1),
  assetId: identifier,
  candidateId: identifier,
  label: bounded(160),
  assetReference: assetReferenceSchema.optional(),
  prompt: z.string().trim().max(4_000).optional(),
  providerReceipt: z
    .object({
      provider: z.enum(['seedream_aigc', 'manual_upload']),
      taskId: bounded(200),
      model: bounded(200).optional(),
      status: bounded(80)
    })
    .strict(),
  select: z.boolean().optional(),
  replaceReference: z.boolean().optional(),
  changeSummary
}

export const attachAssetImageSchema = z
  .object(attachAssetImageFields)
  .strict()

export const attachGeneratedAssetImageSchema = z
  .object({
    ...attachAssetImageFields,
    assetReference: generatedAssetReferenceSchema,
    providerReceipt: attachAssetImageFields.providerReceipt.refine(
      (receipt) => receipt.provider === 'seedream_aigc',
      'Generated asset images require the seedream_aigc provider.'
    ),
    file: z.union([bounded(2_000), z.object({}).passthrough()])
  })
  .strict()

export const attachShotReferenceImageSchema = z
  .object({
    projectId,
    operationId,
    baseRevision: z.number().int().min(1),
    sceneId: identifier,
    shotId: identifier,
    candidateId: identifier,
    label: bounded(160),
    prompt: z.string().trim().max(4_000).optional(),
    providerReceipt: z
      .object({
        provider: z.literal('manual_upload'),
        taskId: bounded(200),
        status: bounded(80)
      })
      .strict(),
    changeSummary
  })
  .strict()

export const uploadStoryVoiceReferenceSchema = z
  .object({
    projectId,
    assetId: identifier,
    referenceId: identifier,
    label: bounded(240)
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
