import { z } from 'zod/v3'
const str = z.string(),
  num = z.number(),
  strings = z.array(str)
const role = z.enum([
  'coordinator',
  'intake',
  'engineering',
  'standardization',
  'quality',
  'impact',
  'governance',
  'publisher',
])
const status = z.enum([
  'open',
  'active',
  'blocked',
  'review_required',
  'approved',
  'completed',
  'rejected',
])
const relation = z.enum([
  'same_identity',
  'local_alias',
  'substitute',
  'revision_successor',
  'different',
  'uncertain',
])
const kind = z.enum(['duplicate_codes', 'code_collision', 'drawing_request'])
const evidence = z
  .object({
    id: str,
    system: str,
    reference: str,
    field: str,
    value: str,
    excerpt: str,
    observedAt: str,
    page: num.optional(),
  })
  .strict()
const material = z
  .object({
    id: str,
    system: str,
    plant: str,
    code: str,
    name: str,
    category: str,
    drawing: str,
    revision: str,
    attributes: z.array(
      z
        .object({
          key: str,
          label: str,
          value: str,
          unit: str.nullable(),
          critical: z.boolean(),
          evidenceIds: strings,
        })
        .strict(),
    ),
    supplier: str,
    quantity: num,
    unitCost: num,
  })
  .strict()
const proposal = z
  .object({
    revision: num,
    operation: z.enum([
      'map_aliases',
      'split_identity',
      'reuse_existing',
      'new_identity',
    ]),
    summary: str,
    goldenIds: strings,
    mappings: z.array(
      z
        .object({
          sourceId: str,
          localCode: str,
          plant: str,
          goldenId: str,
          relation,
        })
        .strict(),
    ),
    safeguards: strings,
    evidenceIds: strings,
    confidence: num.optional(),
  })
  .strict()
export const governanceCaseSchema = z
  .object({
    id: str,
    caseKey: str,
    title: str,
    kind,
    status,
    revision: num,
    templateKey: str,
    templateVersion: num,
    createdAt: str,
    updatedAt: str,
    materials: z.array(material),
    sourceSnapshotHash: str,
    drawings: z.array(
      z
        .object({
          id: str,
          sourceId: str,
          title: str,
          mediaType: z.literal('image/svg+xml'),
          content: str,
          sha256: str,
        })
        .strict(),
    ),
    evidence: z.array(evidence),
    candidates: z.array(
      z
        .object({
          id: str,
          code: str,
          name: str,
          relation,
          score: num,
          hardFilterPassed: z.boolean(),
          differences: z.array(
            z
              .object({
                key: str,
                label: str,
                source: str,
                candidate: str,
                result: z.enum(['match', 'conflict', 'missing']),
                critical: z.boolean(),
              })
              .strict(),
          ),
          evidenceIds: strings,
          rationale: str,
        })
        .strict(),
    ),
    impacts: z.array(
      z
        .object({
          system: str,
          reference: str,
          type: z.enum(['bom', 'inventory', 'purchase', 'quality']),
          description: str,
          quantity: num,
          amount: num,
          action: str,
        })
        .strict(),
    ),
    artifacts: z.array(
      z
        .object({
          key: str,
          revision: num,
          status: z.enum(['accepted', 'failed']),
          roleKey: role,
          summary: str,
          evidenceIds: strings,
          at: str,
        })
        .strict(),
    ),
    criticalConflict: z.boolean().nullable(),
    proposal: proposal.nullable(),
    approval: z
      .object({
        proposalRevision: num,
        decision: z.enum(['approved', 'rejected']),
        actor: str,
        reason: str,
        at: str,
      })
      .strict()
      .nullable(),
    publications: z.array(
      z
        .object({
          system: str,
          operationId: str,
          status: z.enum(['confirmed', 'failed']),
          externalReference: str.nullable(),
          errorCode: str.nullable(),
          at: str,
        })
        .strict(),
    ),
    mockMode: z.literal(true),
  })
  .strict()
export const readResultSchema = z.union([
  z
    .object({
      items: z.array(
        z
          .object({
            id: str,
            caseKey: str,
            title: str,
            kind,
            status,
            revision: num,
            updatedAt: str,
          })
          .strict(),
      ),
      total: num,
      page: num,
      pageSize: num,
    })
    .strict(),
  z
    .object({
      caseId: str,
      caseKey: str,
      revision: num,
      status,
      roleKey: role,
      case: governanceCaseSchema,
      executableNodes: z.array(
        z
          .object({
            nodeKey: str,
            title: str,
            executionMode: z.enum(['assistant_task', 'human', 'system']),
          })
          .strict(),
      ),
      executionId: str.optional(),
      projectStatus: z.enum(['pending', 'ready', 'failed']),
      blocker: str.nullable(),
      simulation: z.boolean(),
    })
    .strict(),
])
