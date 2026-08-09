import { z } from 'zod/v3'
import { BUILD_STAGES, NEXT_DECISIONS } from './constants.js'
import {
  SculptProceduralGeometrySchema,
  SculptReferenceCameraSchema,
  SculptSpecSchema,
  SculptTransformSchema
} from './domain/sculpt-spec.schema.js'

const uuid = z.string().uuid()
// Audit summaries are model-authored and commonly include several concrete
// visual corrections. Keep them bounded, but do not reject a valid mutation
// merely because the Assistant used more than one short sentence.
const changeSummary = z.string().trim().min(1).max(2000)
// `source` can consume nearly the entire function-call output budget.  Keep an
// auditable fallback for author_code so a complete source payload is not
// discarded merely because the model omitted the trailing summary field.
const authorCodeChangeSummary = changeSummary.default(
  'Assistant authored a complete object-specific Three.js TypeScript replacement.'
)

const deprecatedCallerControlFields = new Set([
  'revision',
  'baseRevision',
  'runRevision',
  'projectRevision',
  'expectedRevision',
  'expectedSourceSha256'
])

/**
 * Keep deprecated caller-managed control fields out of the public schema while
 * silently discarding them when an older conversation replays a stale call.
 * All other unknown fields remain strict errors.
 */
function agentToolObject<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const sanitized = { ...(value as Record<string, unknown>) }
    for (const key of deprecatedCallerControlFields) delete sanitized[key]
    return sanitized
  }, z.object(shape).strict())
}

export const CreateProjectToolSchema = agentToolObject({
  name: z.string().trim().min(1).max(160),
  route: z.enum(['object', 'character']),
  modelingMode: z.enum(['semantic-3d', 'relief']),
  changeSummary
})

export const ListProjectsToolSchema = agentToolObject({
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
})

export const ListEvidenceToolSchema = agentToolObject({
  projectId: uuid
})

export const ReadEvidenceToolSchema = agentToolObject({
  projectId: uuid,
  evidenceId: uuid
})

export const SubmitImagesToolSchema = agentToolObject({
  projectId: uuid,
  images: z.array(z.object({
    filePath: z.string().trim().min(1).max(500)
      .refine((path) => !path.includes('\0') && !path.split('/').includes('..'), 'Unsafe workspace path.'),
    label: z.string().trim().min(1).max(120),
    view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter', 'detail', 'unknown'])
  }).strict()).min(1).max(12),
  changeSummary
})

export const ReadSpecToolSchema = agentToolObject({
  projectId: uuid
})

export const UpdateSpecToolSchema = agentToolObject({
  projectId: uuid,
  spec: SculptSpecSchema,
  confidence: z.number().min(0).max(1),
  changeSummary
})

const boundedSpecId = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/)

export const PatchSpecToolSchema = agentToolObject({
  projectId: uuid,
  sourceSpecVersionId: uuid,
  referenceCamera: SculptReferenceCameraSchema.optional(),
  silhouetteIntent: z.string().trim().min(1).max(1000).optional(),
  componentPatches: z.array(z.object({
    componentId: boundedSpecId,
    parentId: boundedSpecId.nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    semanticType: z.enum(['primary_form', 'secondary_form', 'joint', 'attachment', 'detail_cluster']).optional(),
    primitive: z.enum(['box', 'sphere', 'capsule', 'cylinder', 'cone', 'torus', 'lathe', 'extrude', 'custom']).optional(),
    geometry: SculptProceduralGeometrySchema.nullable().optional(),
    transform: SculptTransformSchema.partial().strict().optional(),
    materialId: boundedSpecId.optional(),
    deformable: z.boolean().optional(),
    confidence: z.number().min(0).max(1).optional()
  }).strict()).max(250).default([]),
  materialPatches: z.array(z.object({
    materialId: boundedSpecId,
    baseColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    roughness: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    transparent: z.boolean().optional(),
    emissive: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    emissiveIntensity: z.number().finite().min(0).max(20).optional(),
    clearcoat: z.number().finite().min(0).max(1).optional(),
    clearcoatRoughness: z.number().finite().min(0).max(1).optional()
  }).strict()).max(250).default([]),
  confidence: z.number().min(0).max(1),
  changeSummary
}).superRefine((value, context) => {
  if (
    value.referenceCamera === undefined &&
    value.silhouetteIntent === undefined &&
    value.componentPatches.length === 0 &&
    value.materialPatches.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['componentPatches'],
      message: 'At least one bounded semantic patch is required.'
    })
  }
  const componentIds = value.componentPatches.map((patch) => patch.componentId)
  if (new Set(componentIds).size !== componentIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['componentPatches'],
      message: 'Each componentId may be patched at most once per call.'
    })
  }
  const materialIds = value.materialPatches.map((patch) => patch.materialId)
  if (new Set(materialIds).size !== materialIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['materialPatches'],
      message: 'Each materialId may be patched at most once per call.'
    })
  }
})

export const PatchRuntimeContractToolSchema = agentToolObject({
  projectId: uuid,
  sourceSpecVersionId: uuid,
  minimumRuntimeMeshCount: z.number().int().min(1).max(250),
  confidence: z.number().min(0).max(1),
  changeSummary
})

export const ValidateSpecToolSchema = agentToolObject({
  projectId: uuid
})

export const ReadCodeToolSchema = agentToolObject({
  projectId: uuid,
  codeVersionId: uuid,
  includeSource: z.boolean().default(false)
})

const workspaceCodePath = z.string().trim().min(1).max(500)
  .refine((path) => !path.includes('\0') && !path.split('/').includes('..'), 'Unsafe workspace path.')
  .refine((path) => /\.(?:ts|mts)$/i.test(path), 'Three.js source file must use a .ts or .mts extension.')

export const InspectCodeFileToolSchema = agentToolObject({
  projectId: uuid,
  sourceFilePath: workspaceCodePath
})

export const AuthorCodeFileToolSchema = agentToolObject({
  projectId: uuid,
  specVersionId: uuid,
  mode: z.enum(['create', 'refine']),
  baseCodeVersionId: uuid.nullable(),
  sourceFilePath: workspaceCodePath,
  changeSummary: authorCodeChangeSummary
}).superRefine((value, context) => {
  if (value.mode === 'create' && value.baseCodeVersionId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseCodeVersionId'],
      message: 'create mode requires baseCodeVersionId=null.'
    })
  }
  if (value.mode === 'refine' && value.baseCodeVersionId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseCodeVersionId'],
      message: 'refine mode requires the exact current baseCodeVersionId.'
    })
  }
})

export const AuthorCodeToolSchema = agentToolObject({
  projectId: uuid,
  specVersionId: uuid,
  mode: z.enum(['create', 'refine']),
  baseCodeVersionId: uuid.nullable(),
  source: z.string().min(500).max(1_000_000),
  changeSummary: authorCodeChangeSummary
}).superRefine((value, context) => {
  if (value.mode === 'create' && value.baseCodeVersionId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseCodeVersionId'],
      message: 'create mode requires baseCodeVersionId=null.'
    })
  }
  if (value.mode === 'refine' && value.baseCodeVersionId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseCodeVersionId'],
      message: 'refine mode requires the exact current baseCodeVersionId.'
    })
  }
})

export const RevalidateCodeToolSchema = agentToolObject({
  projectId: uuid,
  codeVersionId: uuid,
  changeSummary
})

export const PatchCodeToolSchema = agentToolObject({
  projectId: uuid,
  codeVersionId: uuid,
  replacements: z.array(z.object({
    oldText: z.string().min(1).max(20_000),
    newText: z.string().max(20_000),
    allOccurrences: z.boolean().optional()
  }).strict()).min(1).max(8),
  changeSummary
})

export const RefineCodeToolSchema = agentToolObject({
  projectId: uuid,
  codeVersionId: uuid,
  sourceFilePath: workspaceCodePath,
  changeSummary
})

export const EnqueueStageToolSchema = agentToolObject({
  projectId: uuid,
  stage: z.enum(BUILD_STAGES),
  changeSummary
})

export const WaitRunToolSchema = agentToolObject({
  projectId: uuid,
  cursor: z.string().regex(/^[a-f0-9]{24}$/)
})

export const GetStatusToolSchema = agentToolObject({
  projectId: uuid
})

export const SubmitReviewToolSchema = agentToolObject({
  projectId: uuid,
  runId: uuid,
  humanReviewStatus: z.enum(['pending', 'approved', 'changes_requested', 'rejected']),
  decision: z.enum(NEXT_DECISIONS),
  notes: z.string().trim().max(2000).optional(),
  changeSummary
})

export const ReadVisualDiagnosticsToolSchema = agentToolObject({
  projectId: uuid,
  runId: uuid.optional(),
  view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter']).optional(),
  includeComparison: z.boolean().default(true),
  includeRender: z.boolean().default(true)
}).refine(
  (value) => value.includeComparison || value.includeRender,
  { message: 'At least one diagnostic image must be requested.' }
)

export const ReadArtifactToolSchema = agentToolObject({
  projectId: uuid
})

export const ExportArtifactToolSchema = agentToolObject({
  projectId: uuid,
  changeSummary
})

export const CancelRunToolSchema = agentToolObject({
  projectId: uuid,
  runId: uuid,
  changeSummary
})

export const RetryRunToolSchema = agentToolObject({
  projectId: uuid,
  runId: uuid,
  changeSummary
})

export const ChangeSummaryProbeSchema = z.object({
  changeSummary
}).passthrough()
