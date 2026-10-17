import { z } from 'zod/v3'
import type { AnalyticsDiscoveryResult } from '@xpert-ai/contracts'
import { analyticsBindingObjectSchema, analyticsBindingSchema, analyticsOptionsSchema } from '@xpert-ai/plugin-sdk/analytics'
import { dashboardSchema } from './dashboard.schema'
import { jsonEncodedSchema, workspaceRelativeFilePathSchema } from '@xpert-ai/plugin-sdk'
import { libraryRequestsSchema } from './document-libraries'

// LLM tool schemas cannot reliably express recursive JSON unions. Only this model boundary uses JSON text.
const objectJson = z.string().min(2).max(64000).describe('A JSON object encoded as text. Use the exact provider-owned contract from discovery. No Markdown fences.')
const agentControlsSchema = z.array(dashboardSchema.innerType().shape.controls.element.extend({
  defaultValue: dashboardSchema.innerType().shape.controls.element.shape.defaultValue.unwrap()
    .describe('Required: copy the verified Binding parameter defaultValue, including explicit null for an all-values filter.')
})).max(24)
export const discoverToolSchema = z.object({ dataSourceId: z.string().uuid(), providerId: z.string().min(1).max(160),
  requestJson: objectJson.default('{}').describe('JSON text. Start with "{}"; then JSON.stringify the returned inspectRequest/nextRequest directly. Do not wrap it in inspectRequest.') }).strict()
export const agentBindingSchema = analyticsBindingObjectSchema.omit({ payload: true, schemaVersion: true, id: true, operation: true, contractVersion: true }).extend({
  parameters: z.array(analyticsBindingObjectSchema.shape.parameters.element.omit({ controlId: true })).max(24),
  payloadJson: objectJson
}).strict()
export const previewToolSchema = z.object({ binding: agentBindingSchema }).strict()
export const createToolSchema = dashboardSchema.innerType().omit({ schema: true, id: true, bindings: true, presentation: true }).extend({
  controls: jsonEncodedSchema(agentControlsSchema),
  charts: jsonEncodedSchema(dashboardSchema.innerType().shape.charts),
  tables: jsonEncodedSchema(dashboardSchema.innerType().shape.tables),
  previewIds: jsonEncodedSchema(z.array(z.string().min(1)).min(1).max(8).describe('Exact previewId receipts from successful dashboard_preview calls. Do not repeat bindings.'))
}).strict()
export const htmlPathSchema = workspaceRelativeFilePathSchema.refine(path => {
  const name = path.split('/').at(-1) ?? ''
  return path.length <= 300 && /\.html$/i.test(name) && name.slice(0, -5).trim().length > 0 && !name.startsWith('.')
}, 'Use a named HTML file such as dashboards/sales.html; .html alone is not a dashboard filename.')
  .describe('Workspace-relative HTML file created or edited with SandboxFile, for example dashboards/sales.html. Copy the complete htmlPath from dashboard_open when editing.')
export const createHtmlToolSchema = createToolSchema.omit({ charts: true, tables: true }).extend({ path: htmlPathSchema,
  libraries: libraryRequestsSchema.optional().describe('Bundled library IDs from dashboard_libraries. Omit for native SVG/Canvas/DOM; use ["echarts"] for ECharts or ["three"] for Three.js.') }).strict()
export function parseObjectJson(text: string) {
  try { return analyticsOptionsSchema.parse(JSON.parse(text)) } catch { throw new Error('DASHBOARD_INVALID_JSON: supply a JSON object encoded as text, matching the returned provider contract') }
}
export function fromAgentBinding(input: z.infer<typeof agentBindingSchema>, contract: AnalyticsDiscoveryResult['queryContract']) {
  const { payloadJson, ...binding } = input
  return analyticsBindingSchema.parse({ ...binding, schemaVersion: 1, id: input.output.datasetId,
    operation: contract.operation, contractVersion: contract.contractVersion,
    parameters: input.parameters.map(parameter => ({ ...parameter, controlId: parameter.name })), payload: parseObjectJson(payloadJson) })
}
