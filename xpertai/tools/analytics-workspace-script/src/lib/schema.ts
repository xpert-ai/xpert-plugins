import { z } from 'zod/v3'
import type { AnalyticsBinding } from '@xpert-ai/contracts'
import { analyticsBindingObjectSchema, analyticsBindingSchema } from '@xpert-ai/plugin-sdk/analytics'
export const PLUGIN = '@xpert-ai/plugin-analytics-workspace-script'
export const PROVIDER = 'workspace_script.query'
export const ACTION = 'workspace_script.execute'
export const ACTION_VERSION = '1.0.0'
// Keep the host validator and all its bounds. Anchor its inferred type to the public wire contract;
// SDK declarations emitted without strictNullChecks otherwise mark required nested fields optional.
const outputSchema = analyticsBindingObjectSchema.shape.output as z.ZodType<AnalyticsBinding['output']>
const alias = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)
export const filePath = z.string().min(1).max(400).refine(path => !path.includes('\0') && !path.includes('\\') &&
  !path.split('/').includes('..') && (!path.startsWith('/') || path.startsWith('/workspace/')), 'Use a relative Workspace file path')
const reference = z.object({ source: z.literal('platform.workspace.files'), filePath, workspacePath: z.string(),
  tenantId: z.string().uuid(), organizationId: z.string().uuid().nullish(), userId: z.string().uuid().nullish(),
  catalog: z.enum(['users', 'xperts', 'user-xperts', 'projects']), scopeId: z.string().uuid().nullish(),
  xpertId: z.string().uuid().nullish(), projectId: z.string().uuid().nullish(), isolateByUser: z.boolean().nullish(),
  originalName: z.string().nullish(), name: z.string().nullish(), mimeType: z.string().nullish(), size: z.number().nullish()
}).strip()
export const registrationSchema = z.object({
  title: z.string().min(1).max(160), path: filePath, language: z.enum(['python', 'javascript']), mode: z.enum(['pinned', 'current']).default('pinned'),
  files: z.array(z.object({ alias, path: filePath }).strict()).max(8).default([]),
  sources: z.array(z.object({ alias, binding: analyticsBindingSchema }).strict()).max(4).default([]),
  parameters: analyticsBindingObjectSchema.shape.parameters, output: outputSchema
}).strict().superRefine((value, context) => {
  if (new Set(value.files.map(f => f.alias)).size !== value.files.length || new Set(value.sources.map(s => s.alias)).size !== value.sources.length)
    context.addIssue({ code: 'custom', message: 'Duplicate aliases' })
  if (value.sources.some(s => s.binding.providerId === PROVIDER)) context.addIssue({ code: 'custom', message: 'Recursive script sources are not supported' })
})
/** Versioned plugin definition. Authorization retains the original workspace reference even for pinned code. */
export const definitionSchema = z.object({ schema: z.literal('xpert.analytics-script/v1'), title: z.string(),
  runtime: z.object({ action: z.literal(ACTION), actionVersion: z.literal(ACTION_VERSION) }).default({ action: ACTION, actionVersion: ACTION_VERSION }),
  language: z.enum(['python', 'javascript']), mode: z.enum(['pinned', 'current']),
  authorization: reference, script: reference, scriptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(z.object({ alias, reference })), sources: z.array(z.object({ alias, binding: analyticsBindingSchema })),
  parameters: analyticsBindingObjectSchema.shape.parameters, output: outputSchema
}).strict()
export const payloadSchema = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid() }).strict()
/** Listing and exact-version inspection are distinct; a partial version reference must fail. */
export const discoverySchema = z.union([
  z.object({ page: z.number().int().min(1).max(1000000).default(1) }).strict(),
  payloadSchema
])
export const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
/** Scripts return cells only. The host issues provenance, freshness and completeness from observed inputs. */
export const resultSchema = z.object({ columns: z.array(z.object({ key: z.string().min(1).max(256) }).strict()).max(80),
  rows: z.array(z.record(scalar)).max(1000) }).strict()
export const invocationSchema = z.object({ alias, controls: z.record(scalar).default({}) }).strict()
export type Definition = z.infer<typeof definitionSchema>
