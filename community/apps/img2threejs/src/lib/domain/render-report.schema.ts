import { z } from 'zod/v3'

const unit = z.number().finite().min(0).max(1)

const featureResultSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  criticality: z.enum(['critical', 'important']),
  metric: z.enum(['silhouette', 'edge', 'color', 'luminance']),
  score: unit,
  threshold: unit,
  passed: z.boolean()
}).strict()

export const SandboxRenderQualitySchema = z.object({
  triangles: z.number().int().nonnegative(),
  drawCalls: z.number().int().nonnegative(),
  maximumTriangles: z.number().int().positive(),
  maximumDrawCalls: z.number().int().positive(),
  minimumVisiblePixelRatio: unit.optional(),
  minimumSilhouetteFillRatio: unit.optional(),
  visiblePixelRatio: unit.optional(),
  silhouetteFillRatio: unit.optional(),
  views: z.array(z.object({
    view: z.string().trim().min(1).max(40),
    visiblePixelRatio: unit,
    silhouetteFillRatio: unit,
    silhouetteWidthRatio: unit.optional(),
    silhouetteHeightRatio: unit.optional()
  }).strict()).min(2).max(7).optional(),
  referenceAlignment: z.object({
    evidenceId: z.string().uuid(),
    view: z.string().trim().min(1).max(40),
    maskConfidence: unit,
    silhouetteIoU: unit,
    scaleScore: unit,
    edgeScore: unit,
    perceptualScore: unit,
    hardGateEligible: z.boolean(),
    passed: z.boolean()
  }).strict().optional(),
  featureResults: z.array(featureResultSchema).max(40).optional(),
  multiAngle: z.object({
    minimumSilhouetteRetention: unit,
    minimumVolumeAxisRatio: unit,
    silhouetteRetention: unit,
    volumeAxisRatio: unit,
    degenerateView: z.boolean(),
    passed: z.boolean()
  }).strict().optional(),
  failureCodes: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  passed: z.boolean()
}).strict()

export const SandboxRenderReportSchema = z.object({
  contractVersion: z.literal('1'),
  action: z.literal('img2threejs.review-render'),
  actionVersion: z.literal('1.0.0'),
  projectName: z.string().trim().min(1).max(160),
  codeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  quality: SandboxRenderQualitySchema
}).passthrough()
