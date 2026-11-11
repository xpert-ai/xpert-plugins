import { z } from 'zod/v3'

export const draftSchema = z.object({
  title: z.string().trim().min(5).max(80),
  eventType: z.enum(['accident', 'road_blockage', 'hazard', 'weather', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  locationDescription: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(2000),
  occurredAt: z.string().datetime(),
  coordinates: z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90)
  }).strict().nullable().optional(),
  recommendation: z.object({
    summary: z.string().min(10).max(1200),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    actions: z.array(z.object({
      title: z.string().min(2).max(100),
      details: z.string().min(5).max(500),
      priority: z.enum(['immediate', 'high', 'normal'])
    }).strict()).min(1).max(6),
    cautions: z.array(z.string().min(2).max(240)).max(6),
    generatedAt: z.string().datetime(),
    model: z.string().min(1).max(120)
  }).strict().nullable().optional(),
  recommendationAttempt: z.object({
    status: z.enum(['succeeded', 'failed']),
    attemptedAt: z.string().datetime(),
    errorCode: z.enum(['model_unavailable', 'model_error', 'invalid_output']).optional()
  }).strict().nullable().optional(),
  confirmation: z.object({
    status: z.literal('confirmed'),
    confirmedAt: z.string().datetime(),
    confirmedBy: z.string().min(1).max(128)
  }).strict().nullable().optional()
}).strict()

export const recommendationOutputSchema = z.object({
  summary: z.string().min(10).max(1200),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  actions: z.array(z.object({
    title: z.string().min(2).max(100),
    details: z.string().min(5).max(500),
    priority: z.enum(['immediate', 'high', 'normal'])
  }).strict()).min(1).max(6),
  cautions: z.array(z.string().min(2).max(240)).max(6)
}).strict()

export const saveDraftSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  draft: draftSchema
}).strict()

export type RoadEventDraft = z.infer<typeof draftSchema>

export const draftResultSchema = z.object({
  revision: z.number().int().min(0),
  draft: draftSchema.nullable(),
  updatedAt: z.string().datetime().nullable()
}).strict()

export const saveDraftReceiptSchema = z.object({
  revision: z.number().int().min(1),
  updatedAt: z.string().datetime()
}).strict()

export const confirmRecommendationSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
}).strict()

export const confirmRecommendationReceiptSchema = z.object({
  revision: z.number().int().min(1),
  updatedAt: z.string().datetime(),
  confirmation: z.object({
    status: z.literal('confirmed'),
    confirmedAt: z.string().datetime(),
    confirmedBy: z.string().min(1).max(128)
  }).strict()
}).strict()
