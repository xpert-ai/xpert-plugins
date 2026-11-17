import { z } from 'zod/v3'

const field = z.string().min(1).max(160)
/** Presentation choices only. Dataset rows, SQL, source identity and execution scope are never model input. */
export const analysisSceneSchema = z.object({
  previewId: z.string().min(1).max(128).describe('Exact successful dashboard_preview or dashboard_preview_binding receipt from this run.'),
  title: z.string().trim().min(1).max(120),
  view: z.enum(['bar', 'line', 'table', 'metrics']).describe('One analysis scene. Metrics requires a single aggregate row; charts never aggregate or sort rows implicitly.'),
  fields: z.array(field).min(1).max(6).describe('Exact returned field IDs. Charts require [xField, yField]; tables and metrics use the selected fields.'),
  orderBy: z.object({ field, direction: z.enum(['asc', 'desc']) }).strict().optional().describe('Explicit numeric measure ordering BEFORE maxRows. Required when asking for top/bottom N; truncation alone is not ranking. Applies only to the returned query result, not omitted source data.'),
  language: z.enum(['zh-Hans', 'en']).optional().describe('Use the conversation language for result labels: zh-Hans for Chinese, en for English.'),
  maxRows: z.number().int().min(1).max(20).default(10),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.fields).size !== value.fields.length) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Choose distinct field IDs.' })
  if (['bar', 'line'].includes(value.view) && value.fields.length !== 2) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Charts require exactly [xField, yField].' })
})
/** Current-run query receipt plus explicit presentation; no persistence or query authorization is implied. */
export type AnalysisSceneInput = z.infer<typeof analysisSceneSchema>
