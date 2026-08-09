import { z } from 'zod/v3'

export const QualityProfileNameSchema = z.enum([
  'reference-fidelity',
  'relief',
  'character',
  'cs2'
])

export type QualityProfileName = z.infer<typeof QualityProfileNameSchema>

export const QualityProfileSchema = z.object({
  name: QualityProfileNameSchema,
  minimumSilhouetteIoU: z.number().min(0).max(1),
  maximumScaleDelta: z.number().min(0).max(1),
  minimumMaskConfidence: z.number().min(0).max(1),
  minimumEdgeOverlap: z.number().min(0).max(1),
  minimumTonalParity: z.number().min(0).max(1),
  minimumFeatureScore: z.number().min(0).max(1),
  minimumTurntableSilhouetteRetention: z.number().min(0).max(1),
  minimumVolumeAxisRatio: z.number().min(0).max(1),
  maximumTriangles: z.number().int().positive(),
  maximumDrawCalls: z.number().int().positive(),
  maximumCorrectionIterations: z.number().int().min(1).max(12),
  requireMaterialGate: z.boolean(),
  requireGeometryIntegrity: z.boolean(),
  requireTurntable: z.boolean()
}).strict().superRefine((profile, ctx) => {
  if (profile.maximumScaleDelta > 1 - profile.minimumSilhouetteIoU) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maximumScaleDelta'],
      message: 'Scale tolerance must be tighter than the silhouette failure margin.'
    })
  }
})

export type QualityProfile = z.infer<typeof QualityProfileSchema>

export const QUALITY_PROFILES: Readonly<Record<QualityProfileName, QualityProfile>> = {
  'reference-fidelity': {
    name: 'reference-fidelity',
    minimumSilhouetteIoU: 0.85,
    maximumScaleDelta: 0.08,
    minimumMaskConfidence: 0.75,
    minimumEdgeOverlap: 0.45,
    minimumTonalParity: 0.8,
    minimumFeatureScore: 0.8,
    minimumTurntableSilhouetteRetention: 0.65,
    minimumVolumeAxisRatio: 0.08,
    maximumTriangles: 250000,
    maximumDrawCalls: 80,
    maximumCorrectionIterations: 6,
    requireMaterialGate: true,
    requireGeometryIntegrity: true,
    requireTurntable: true
  },
  relief: {
    name: 'relief',
    minimumSilhouetteIoU: 0.9,
    maximumScaleDelta: 0.06,
    minimumMaskConfidence: 0.8,
    minimumEdgeOverlap: 0.55,
    minimumTonalParity: 0.85,
    minimumFeatureScore: 0.85,
    minimumTurntableSilhouetteRetention: 0.15,
    minimumVolumeAxisRatio: 0.01,
    maximumTriangles: 100000,
    maximumDrawCalls: 20,
    maximumCorrectionIterations: 4,
    requireMaterialGate: true,
    requireGeometryIntegrity: true,
    requireTurntable: false
  },
  character: {
    name: 'character',
    minimumSilhouetteIoU: 0.82,
    maximumScaleDelta: 0.1,
    minimumMaskConfidence: 0.7,
    minimumEdgeOverlap: 0.4,
    minimumTonalParity: 0.75,
    minimumFeatureScore: 0.75,
    minimumTurntableSilhouetteRetention: 0.55,
    minimumVolumeAxisRatio: 0.06,
    maximumTriangles: 500000,
    maximumDrawCalls: 140,
    maximumCorrectionIterations: 8,
    requireMaterialGate: true,
    requireGeometryIntegrity: true,
    requireTurntable: true
  },
  cs2: {
    name: 'cs2',
    minimumSilhouetteIoU: 0.88,
    maximumScaleDelta: 0.07,
    minimumMaskConfidence: 0.78,
    minimumEdgeOverlap: 0.5,
    minimumTonalParity: 0.82,
    minimumFeatureScore: 0.82,
    minimumTurntableSilhouetteRetention: 0.7,
    minimumVolumeAxisRatio: 0.1,
    maximumTriangles: 350000,
    maximumDrawCalls: 100,
    maximumCorrectionIterations: 6,
    requireMaterialGate: true,
    requireGeometryIntegrity: true,
    requireTurntable: true
  }
} as const

for (const profile of Object.values(QUALITY_PROFILES)) {
  QualityProfileSchema.parse(profile)
}

export function getQualityProfile(name: QualityProfileName): QualityProfile {
  return QUALITY_PROFILES[name]
}
