import { z } from 'zod/v3'
import { keySchema, referenceSchema } from './resource-contract'
const parameterValues = z.record(z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))

/** Source provenance is saved in the Dashboard definition and survives export; it grants no access. */
export const templateOriginSchema = z.object({ schema: z.literal('xpert.library.instance'), version: z.literal(1),
  template: referenceSchema, task: referenceSchema.optional(), theme: referenceSchema.optional(),
  inputs: z.array(z.object({ slot: keySchema, mapping: z.record(keySchema, keySchema),
    source: z.discriminatedUnion('type', [
      referenceSchema.extend({ type: z.literal('library') }).strict(),
      z.object({ type: z.literal('dataset'), artifactId: z.string().uuid(), revision: z.number().int().positive() }).strict()
    ]) }).strict()).max(12), parameters: parameterValues }).strict()
