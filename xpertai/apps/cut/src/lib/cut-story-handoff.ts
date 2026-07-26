import { z } from 'zod/v3'

const boundedId = z.string().trim().min(1).max(160)
const workspacePath = z
  .string()
  .trim()
  .min(1)
  .max(4_096)
  .describe(
    'Scoped Workspace path from story_get_cut_handoff. Never pass a provider URL or host filesystem path.'
  )

export const storyCutHandoffContractSchema = z
  .object({
    contractVersion: z.literal('1.0'),
    handoffId: z.string().uuid(),
    source: z
      .object({
        projectId: z.string().uuid(),
        revision: z.number().int().positive(),
        title: z.string().trim().min(1).max(200),
        brief: z.string().trim().min(1).max(4_000),
        visualStyle: z.string().trim().min(1).max(4_000)
      })
      .strict(),
    sequence: z
      .object({
        aspectRatio: z.enum([
          '9:16',
          '16:9',
          '1:1',
          '4:3',
          '3:4',
          'custom'
        ]),
        width: z.number().int().min(16).max(7_680),
        height: z.number().int().min(16).max(4_320),
        fps: z.union([z.literal(24), z.literal(30)]),
        durationSeconds: z.number().positive().max(600)
      })
      .strict(),
    target: z
      .object({
        mode: z.enum(['create', 'proposal']),
        cutProjectId: z.string().uuid().nullable()
      })
      .strict(),
    shots: z
      .array(
        z
          .object({
            sceneId: boundedId,
            shotId: boundedId,
            title: z.string().trim().min(1).max(240),
            startSeconds: z.number().min(0).max(600),
            durationSeconds: z.number().min(0.1).max(30),
            camera: z.string().trim().min(1).max(1_000),
            action: z.string().trim().min(1).max(2_000),
            dialogue: z.string().trim().max(2_000).nullable(),
            file: z
              .object({
                workspacePath,
                originalName: z.string().trim().min(1).max(240),
                mimeType: z.literal('video/mp4'),
                size: z.number().int().positive().max(2_147_483_648),
                sha256: z.string().regex(/^[a-f0-9]{64}$/)
              })
              .strict()
          })
          .strict()
      )
      .min(1)
      .max(24)
  })
  .strict()
  .superRefine((contract, context) => {
    if (contract.target.mode === 'create' && contract.target.cutProjectId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target', 'cutProjectId'],
        message: 'Initial handoff must not provide a Cut project id.'
      })
    }
    if (contract.target.mode === 'proposal' && !contract.target.cutProjectId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target', 'cutProjectId'],
        message: 'Proposal handoff requires the existing Cut project id.'
      })
    }
    let cursor = 0
    for (const [index, shot] of contract.shots.entries()) {
      if (Math.abs(shot.startSeconds - cursor) > 0.001) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shots', index, 'startSeconds'],
          message: 'Handoff shots must be contiguous and ordered.'
        })
      }
      cursor += shot.durationSeconds
    }
    if (Math.abs(cursor - contract.sequence.durationSeconds) > 0.001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sequence', 'durationSeconds'],
        message: 'Sequence duration must equal the ordered shot duration.'
      })
    }
  })

export const cutAcceptStoryHandoffSchema = z
  .object({
    handoff: storyCutHandoffContractSchema,
    changeSummary: z.string().trim().min(1).max(240)
  })
  .strict()

export type StoryCutHandoffContract = z.infer<
  typeof storyCutHandoffContractSchema
>
export type AcceptStoryCutHandoffInput = z.infer<
  typeof cutAcceptStoryHandoffSchema
>
