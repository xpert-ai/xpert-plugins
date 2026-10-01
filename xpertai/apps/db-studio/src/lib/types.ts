import { z } from 'zod/v3'
import type { DataSourceActor } from '@xpert-ai/plugin-sdk/data-workbench'
export interface StudioScope extends DataSourceActor {
  workspaceId: string
  xpertId: string
}
export const locationSchema = z
  .object({
    database: z.string().max(256).optional(),
    schema: z.string().max(256).optional(),
    engineCatalog: z.string().max(256).optional(),
  })
  .strict()
export const targetSchema = locationSchema
  .extend({ dataSourceId: z.string().min(1).max(160), sessionId: z.string().uuid().optional() })
  .strict()
export const objectSchema = locationSchema
  .extend({ name: z.string().min(1).max(256), kind: z.enum(['table', 'view']) })
  .strict()
export const valueSchema = z.union([z.string().max(1_000_000), z.number().finite(), z.boolean(), z.null()])
export const querySchema = targetSchema
  .extend({
    executionId: z.string().uuid().optional(),
    sql: z.string().min(1).max(100000),
    parameters: z.array(valueSchema).max(1000).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).max(100000).optional(),
    timeoutMs: z.number().int().min(1).max(120000).optional(),
  })
  .strict()
export const changeSchema = querySchema
  .omit({ limit: true, offset: true, timeoutMs: true, executionId: true })
  .extend({ reason: z.string().min(1).max(2000), operationId: z.string().uuid() })
  .strict()
export const importSchema = targetSchema
  .extend({
    table: z.string().min(1).max(256),
    columns: z.array(z.string().min(1).max(256)).min(1).max(500),
    rows: z.array(z.array(valueSchema).max(500)).min(1).max(10000),
    operationId: z.string().uuid(),
  })
  .strict()
export const artifactSchema = z
  .object({
    id: z.string().uuid().optional(),
    revision: z.number().int().min(0).optional(),
    kind: z.enum(['draft', 'favorite', 'chart', 'dashboard', 'snapshot']),
    title: z.string().min(1).max(200),
    target: targetSchema.optional(),
    content: z.string().max(2_000_000),
  })
  .strict()
export const policySchema = targetSchema
  .pick({ dataSourceId: true })
  .extend({
    revision: z.number().int().min(0),
    autoActions: z.array(z.enum(['row-update', 'import'])).max(2),
    objects: z.array(objectSchema).max(100),
    readOnly: z.boolean(),
  })
  .strict()
export type QueryInput = z.infer<typeof querySchema>
export type ChangeInput = z.infer<typeof changeSchema>
export type ImportInput = z.infer<typeof importSchema>
export type Target = z.infer<typeof targetSchema>
export type ArtifactInput = z.infer<typeof artifactSchema>
export type PolicyInput = z.infer<typeof policySchema>
// Parse persisted plans before showing or accepting a human approval.
export const planPayloadSchema = z.object({
  target: targetSchema,
  sql: z.string().optional(),
  parameters: z.array(valueSchema).optional(),
  transfer: importSchema.optional(),
  reason: z.string(),
  action: z.enum(['sql', 'row-update', 'import']),
  object: objectSchema.optional(),
  policyRevision: z.number().int(),
  digest: z.string(),
  expiresAt: z.string().datetime(),
  approvedBy: z.string().optional(),
  receipt: z.unknown().optional(),
})
export type PlanPayload = z.infer<typeof planPayloadSchema>
