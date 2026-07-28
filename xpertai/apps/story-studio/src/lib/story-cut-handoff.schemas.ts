import { z } from 'zod/v3'
import { STORY_CUT_HANDOFF_STATUSES } from './story-cut-handoff.types.js'

const projectId = z
  .string()
  .uuid()
  .describe('Story Studio project UUID from story_get_project_summary.')
const handoffId = z
  .string()
  .uuid()
  .describe('StoryCutHandoff UUID from story_prepare_cut_handoff.')
const operationId = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
const changeSummary = z.string().trim().min(1).max(240)

export const prepareStoryCutHandoffSchema = z
  .object({
    projectId,
    operationId,
    expectedRevision: z.number().int().positive(),
    fps: z.union([z.literal(24), z.literal(30)]).optional(),
    changeSummary
  })
  .strict()

export const getStoryCutHandoffSchema = z
  .object({
    projectId,
    handoffId: handoffId.optional()
  })
  .strict()

export const recordStoryCutHandoffDeliverySchema = z
  .object({
    projectId,
    handoffId,
    operationId,
    baseHandoffRevision: z.number().int().positive(),
    status: z.enum(STORY_CUT_HANDOFF_STATUSES).refine(
      (status) => status !== 'ready',
      'Delivery status must be delivered, proposal_ready, or failed.'
    ),
    cutProjectId: z.string().uuid().optional(),
    cutProjectRevision: z.number().int().positive().optional(),
    cutProposalId: z.string().uuid().optional(),
    failureCode: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
    failureMessage: z.string().trim().min(1).max(2_000).optional(),
    changeSummary
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'failed') {
      if (!value.failureCode) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['failureCode'],
          message: 'failureCode is required when status is failed.'
        })
      }
      if (!value.failureMessage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['failureMessage'],
          message: 'failureMessage is required when status is failed.'
        })
      }
      return
    }
    if (!value.cutProjectId || !value.cutProjectRevision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cutProjectId'],
        message:
          'cutProjectId and cutProjectRevision are required after a successful delivery.'
      })
    }
    if (value.status === 'proposal_ready' && !value.cutProposalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cutProposalId'],
        message: 'cutProposalId is required for proposal_ready.'
      })
    }
  })
