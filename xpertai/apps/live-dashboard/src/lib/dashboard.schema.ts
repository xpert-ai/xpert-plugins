import { z } from 'zod/v3'
import { analyticsBindingSchema } from '@xpert-ai/plugin-sdk/analytics'
import { artifactDocumentHtml, artifactDocumentDependencyLocks } from '@xpert-ai/plugin-sdk/artifact-document'

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/)
export const dashboardSchema = z.object({
  schema: z.literal('xpert.live-dashboard'), id: z.string().uuid(), title: z.string().min(1).max(160),
  bindings: z.array(analyticsBindingSchema).min(1).max(8),
  presentation: z.object({ type: z.literal('html'), html: artifactDocumentHtml, dependencies: artifactDocumentDependencyLocks.optional() }).strict().optional(),
  controls: z.array(z.object({ controlId: id, type: z.enum(['string', 'number', 'boolean', 'date']),
    defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    allowedValues: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(200).optional(),
    label: z.string().min(1).max(160) }).strict()).max(24),
  charts: z.array(z.object({ id, title: z.string().min(1).max(160), type: z.enum(['bar', 'line', 'area', 'pie', 'scatter']),
    datasetId: id, x: id, y: id, color: id.optional() }).strict()).max(20),
  tables: z.array(z.object({ id, title: z.string().min(1).max(160), datasetId: id, fields: z.array(id).min(1).max(30) }).strict()).max(20)
}).strict().superRefine((manifest, ctx) => {
  const unique = (values: string[], name: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', message: `Duplicate ${name}` })
  }
  unique(manifest.bindings.map((binding) => binding.id), 'binding')
  unique(manifest.bindings.map((binding) => binding.output.datasetId), 'dataset')
  unique(manifest.controls.map((control) => control.controlId), 'control')
  unique([...manifest.charts, ...manifest.tables].map((view) => view.id), 'view')
  if (!manifest.presentation && !manifest.charts.length && !manifest.tables.length) ctx.addIssue({ code: 'custom', message: 'At least one chart or table is required' })
  if (manifest.presentation && (manifest.charts.length || manifest.tables.length)) ctx.addIssue({ code: 'custom', message: 'HTML presentation owns its charts; use empty charts/tables arrays' })
  for (const control of manifest.controls) {
    const parameters = manifest.bindings.flatMap((binding) => binding.parameters.filter((parameter) => parameter.controlId === control.controlId))
    if (!parameters.length) ctx.addIssue({ code: 'custom', message: 'Control is not bound to a query parameter' })
    const values = [...(control.defaultValue !== undefined ? [control.defaultValue] : []), ...(control.allowedValues ?? [])]
    if (values.some((value) => value !== null && (control.type === 'number' ? typeof value !== 'number' || !Number.isFinite(value) :
      control.type === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string')))
      ctx.addIssue({ code: 'custom', message: 'Control value has an incompatible type' })
    if (control.allowedValues && control.defaultValue !== undefined && !control.allowedValues.includes(control.defaultValue))
      ctx.addIssue({ code: 'custom', message: 'Default control value is not allowed' })
    for (const parameter of parameters) {
      if (parameter.defaultValue !== undefined && control.defaultValue !== undefined && parameter.defaultValue !== control.defaultValue)
        ctx.addIssue({ code: 'custom', message: 'Control and parameter defaults disagree' })
      // Match platform resolveAnalyticsParameters: null is governed by required, not the scalar allowlist.
      if (values.some((value) => value === null ? parameter.required : parameter.allowedValues && !parameter.allowedValues.includes(value)))
        ctx.addIssue({ code: 'custom', message: 'Control values conflict with parameter restrictions' })
    }
  }
  for (const binding of manifest.bindings) for (const parameter of binding.parameters) {
    const control = manifest.controls.find((control) => control.controlId === parameter.controlId)
    if (!control || control.type !== parameter.type) ctx.addIssue({ code: 'custom', message: 'Control mapping is missing or has an incompatible type' })
  }
  for (const view of [...manifest.charts, ...manifest.tables]) {
    const output = manifest.bindings.find((binding) => binding.output.datasetId === view.datasetId)?.output
    const fields = 'fields' in view ? view.fields : [view.x, view.y, ...(view.color ? [view.color] : [])]
    if (!output || fields.some((id) => !output.fields.some((field) => field.id === id))) ctx.addIssue({ code: 'custom', message: 'View references an undeclared Dataset field' })
    if ('y' in view && !output?.fields.some((field) => field.id === view.y && ['float64', 'int64', 'decimal'].includes(field.logicalType)))
      ctx.addIssue({ code: 'custom', message: 'Chart measure must be numeric' })
    if ('y' in view && view.type !== 'scatter' && output?.grain.some((id) => id !== view.x && id !== view.color))
      ctx.addIssue({ code: 'custom', message: 'Chart must encode every Dataset grain dimension in x/color; use another aggregated binding for totals' })
  }
})
/** Plugin-owned, versioned presentation definition. Bindings use the platform protocol unchanged;
 * native query payloads stay opaque here and belong to their provider. Saved versions contain no rows.
 */
export type DashboardManifest = z.output<typeof dashboardSchema>
/** Updates never choose identity or source scope; those come from the authorized saved version. */
export const dashboardChangesSchema = dashboardSchema.innerType().pick({ title: true, bindings: true,
  controls: true, charts: true, tables: true, presentation: true }).partial().strict()
export type DashboardChanges = z.output<typeof dashboardChangesSchema>
export const controlsSchema = z.record(z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))
export const saveSchema = z.object({ manifest: dashboardSchema, expectedVersionId: z.string().uuid().nullable(), expectedRevision: z.number().int().nonnegative().default(0) }).strict()
export const querySchema = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid().optional(), draftRevision: z.number().int().positive().optional(), controls: controlsSchema.default({}) }).strict()
/** Generated pages select a saved Binding by ID. Query text, provider and source overrides are rejected. */
export const queryBindingSchema = querySchema.extend({ bindingId: id }).strict()
