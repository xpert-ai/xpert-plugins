import { z } from 'zod/v3'
import { keySchema } from './resource-contract'
import { controlsSchema } from '../dashboard.schema'

/** @beta Execution inputs are portable business mappings; host identity is supplied only by trusted context. */
export const templateInputSchema = z.object({ slot: keySchema, mapping: z.record(keySchema, keySchema),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('library'), releaseId: z.string().uuid() }).strict(),
    z.object({ type: z.literal('dataset'), artifactId: z.string().uuid(), revision: z.number().int().positive() }).strict()
  ]) }).strict()
export const instantiateSchema = z.object({ releaseId: z.string().uuid(), requestId: z.string().uuid(), title: z.string().trim().min(1).max(160),
  inputs: z.array(templateInputSchema).max(12).optional().describe('Omit for an unchanged example task: its published recipe already binds the dataset and fields. Supply only when the recipe explicitly includes inputs or the user requests replacement data; use exact declared slot keys and field mappings.'), parameters: controlsSchema.optional(), themeReleaseId: z.string().uuid().optional() }).strict()
export const prepareTaskSchema = z.object({ releaseId: z.string().uuid(), requestId: z.string().uuid() }).strict()
export const executionTargetSchema = z.object({ executionId: z.string().uuid() }).strict()
export type TemplateInput = z.infer<typeof templateInputSchema>
export type TemplateInstantiation = z.infer<typeof instantiateSchema>

/** Matches the published assistant.composer.insert payload; no sending or host navigation authority. */
export const taskDraftV2Schema = z.object({ text: z.string(), workspaceFiles: z.array(z.object({ path: z.string(), name: z.string(),
  mimeType: z.string(), size: z.number().int().nonnegative() }).strict()), skillNames: z.array(z.string()) }).strict()
export type TaskDraftV2 = z.infer<typeof taskDraftV2Schema>
