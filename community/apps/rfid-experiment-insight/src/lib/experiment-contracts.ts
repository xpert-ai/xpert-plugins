import { z } from 'zod'

export const CSV_COLUMNS = ['experiment_id', 'distance_m', 'angle_deg', 'environment', 'accuracy', 'rssi_std', 'phase_dispersion'] as const
export const analysisStatusSchema = z.enum(['DRAFT', 'ANALYZING', 'COMPLETED', 'FAILED'])
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>
export const experimentRowSchema = z.object({
  experiment_id: z.string().trim().min(1).max(200),
  distance_m: z.number().finite().nonnegative(),
  angle_deg: z.number().finite().min(-360).max(360),
  environment: z.string().trim().min(1).max(200),
  accuracy: z.number().finite().min(0).max(1),
  rssi_std: z.number().finite().nonnegative(),
  phase_dispersion: z.number().finite().nonnegative()
}).strict()
export type ExperimentRow = z.infer<typeof experimentRowSchema>
export interface ConditionStatistics {
  distance_m: number
  angle_deg: number
  environment: string
  record_count: number
  average_accuracy: number
  average_rssi_std: number
  average_phase_dispersion: number
}
export interface ExperimentStatistics {
  record_count: number
  average_accuracy: number
  conditions: ConditionStatistics[]
  best_condition: ConditionStatistics
  worst_condition: ConditionStatistics
  accuracy_drop_vs_best: number
  rssi_std_change: number
  phase_dispersion_change: number
}
export const aiSummarySchema = z.object({
  overallTrend: z.string().trim().min(1).max(4000),
  mostDegradedCondition: z.string().trim().min(1).max(4000),
  signalQualityObservation: z.string().trim().min(1).max(4000),
  suggestedFollowUp: z.string().trim().min(1).max(4000)
}).strict()
export type AiSummary = z.infer<typeof aiSummarySchema>
export interface ExperimentScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId: string
}
export const rfidConfigSchema = z.object({}).strict()
export const analysisIdSchema = z.object({ analysisId: z.string().uuid() }).strict()
export const analysisAttemptSchema = analysisIdSchema.extend({ attemptId: z.string().uuid() }).strict()
export type AnalysisAttempt = z.infer<typeof analysisAttemptSchema>
export const saveInterpretationSchema = analysisAttemptSchema.extend({ aiSummary: aiSummarySchema }).strict()
export interface PreparedAnalysis extends AnalysisAttempt {
  command: { type: 'assistant-message'; commandKey: 'assistant.chat.send_message'; payload: { text: string } }
}
export const importCsvSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  csv: z.string().min(1).max(1024 * 1024)
}).strict()
export const saveAnalysisSchema = z.object({
  analysisId: z.string().uuid(),
  confirmed: z.literal(true)
}).strict()
