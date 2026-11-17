import { z } from 'zod/v3'

const dateText = z.string().max(10)
export const scoringInputSchema = z
  .object({
    evaluationDate: dateText,
    departureCount: z.string().max(9),
    managementStart: dateText,
    managementEnd: dateText,
    managementScopeVerified: z.boolean(),
    pledgeDate: dateText,
    pledgeScopeVerified: z.boolean(),
    debtDate: dateText,
    debtScopeVerified: z.boolean()
  })
  .strict()
export type ScoringInput = z.infer<typeof scoringInputSchema>
export function emptyScoringInput(evaluationDate = ''): ScoringInput {
  return {
    evaluationDate,
    departureCount: '',
    managementStart: '',
    managementEnd: '',
    managementScopeVerified: false,
    pledgeDate: '',
    pledgeScopeVerified: false,
    debtDate: '',
    debtScopeVerified: false
  }
}
export const scoreResultSchema = z.object({
  rulesetVersion: z.literal('admission-three-indicators-v1'),
  inputs: scoringInputSchema,
  complete: z.boolean(),
  total: z.number().int().min(0).max(15).nullable(),
  maximum: z.literal(15),
  items: z.array(
    z.object({
      key: z.enum(['managementStability', 'pledgeRatio', 'debtAssetRatio']),
      score: z.number().int().nullable(),
      maximum: z.number().int(),
      normalizedValue: z.string().nullable(),
      band: z.string(),
      issues: z.array(z.string()),
      evidence: z.array(z.string())
    })
  ),
  veto: z.enum(['hit', 'clear', 'insufficient'])
})
export type ScoreResult = z.infer<typeof scoreResultSchema>
