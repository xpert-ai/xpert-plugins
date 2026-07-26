import { z } from 'zod/v3'
import { BUILD_STAGES, NEXT_DECISIONS } from './constants.js'
import { SculptSpecSchema } from './domain/sculpt-spec.schema.js'

const uuid = z.string().uuid()
const revision = z.number().int().positive()
const changeSummary = z.string().trim().min(1).max(180)

export const CreateProjectToolSchema = z.object({
  name: z.string().trim().min(1).max(160),
  route: z.enum(['object', 'character']),
  modelingMode: z.enum(['semantic-3d', 'relief']),
  changeSummary
}).strict()

export const ListProjectsToolSchema = z.object({
  status: z.enum([
    'awaiting_images',
    'awaiting_spec',
    'spec_ready',
    'queued',
    'building',
    'review_required',
    'completed',
    'failed',
    'cancelled'
  ]).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(20).default(10)
}).strict()

export const ListEvidenceToolSchema = z.object({
  projectId: uuid,
  expectedRevision: revision.optional()
}).strict()

export const ReadEvidenceToolSchema = z.object({
  projectId: uuid,
  evidenceId: uuid,
  expectedRevision: revision
}).strict()

export const SubmitImagesToolSchema = z.object({
  projectId: uuid,
  baseRevision: revision,
  images: z.array(z.object({
    filePath: z.string().trim().min(1).max(500)
      .refine((path) => !path.includes('\0') && !path.split('/').includes('..'), 'Unsafe workspace path.'),
    label: z.string().trim().min(1).max(120),
    view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter', 'detail', 'unknown'])
  }).strict()).min(1).max(12),
  changeSummary
}).strict()

export const ReadSpecToolSchema = z.object({
  projectId: uuid,
  expectedRevision: revision.optional()
}).strict()

export const UpdateSpecToolSchema = z.object({
  projectId: uuid,
  baseRevision: revision,
  spec: SculptSpecSchema,
  confidence: z.number().min(0).max(1),
  changeSummary
}).strict()

export const ValidateSpecToolSchema = z.object({
  projectId: uuid,
  expectedRevision: revision.optional()
}).strict()

export const RefineCodeToolSchema = z.object({
  projectId: uuid,
  codeVersionId: uuid,
  baseRevision: revision,
  sourceFilePath: z.string().trim().min(1).max(500)
    .refine((path) => !path.includes('\0') && !path.split('/').includes('..'), 'Unsafe workspace path.'),
  expectedSourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  changeSummary
}).strict()

export const EnqueueStageToolSchema = z.object({
  projectId: uuid,
  baseRevision: revision,
  stage: z.enum(BUILD_STAGES),
  changeSummary
}).strict()

export const WaitRunToolSchema = z.object({
  projectId: uuid,
  cursor: z.string().regex(/^[a-f0-9]{24}$/)
}).strict()

export const GetStatusToolSchema = z.object({
  projectId: uuid
}).strict()

export const SubmitReviewToolSchema = z.object({
  projectId: uuid,
  runId: uuid,
  baseRevision: revision,
  humanReviewStatus: z.enum(['pending', 'approved', 'changes_requested', 'rejected']),
  decision: z.enum(NEXT_DECISIONS),
  notes: z.string().trim().max(2000).optional(),
  changeSummary
}).strict()

export const ReadArtifactToolSchema = z.object({
  projectId: uuid
}).strict()

export const ExportArtifactToolSchema = z.object({
  projectId: uuid,
  changeSummary
}).strict()

export const CancelRunToolSchema = z.object({
  projectId: uuid,
  runId: uuid,
  baseRevision: revision,
  changeSummary
}).strict()

export const RetryRunToolSchema = z.object({
  projectId: uuid,
  runId: uuid,
  baseRevision: revision,
  changeSummary
}).strict()

export const ChangeSummaryProbeSchema = z.object({
  changeSummary
}).passthrough()
