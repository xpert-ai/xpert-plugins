import { z } from 'zod/v3'
import type { AnalyticsCertification } from '@xpert-ai/contracts'

/** Host-response boundary only; authored dashboard JSON cannot supply this proof. */
export const certificationSchema: z.ZodType<AnalyticsCertification> = z.discriminatedUnion('status', [
  z.object({ kind: z.literal('business_metric'), subjectId: z.string().min(1).max(160),
    verifiedAt: z.string().datetime(), status: z.literal('legacy_unverified') }).strict(),
  z.object({ kind: z.literal('business_metric'), subjectId: z.string().min(1).max(160),
    verifiedAt: z.string().datetime(), status: z.literal('verified'),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    dependency: z.object({ id: z.string().min(1).max(160), version: z.number().int().nonnegative() }).strict(),
    certifiedBy: z.string().min(1).max(160), certifiedAt: z.string().datetime() }).strict()
])
