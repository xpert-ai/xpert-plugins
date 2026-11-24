import { z } from 'zod/v3'

const textField = z.string().max(8000)
export const reportSchema = z.object({
  title: z.string().max(200), entry: textField, environment: textField, steps: textField,
  expected: textField, actual: textField, occurredAt: textField, frequency: textField,
  impact: textField, questions: textField
}).strict()
export type Report = z.infer<typeof reportSchema>
export const reportKeys = reportSchema.keyof().options
export const emptyReport = (): Report => ({ title: '', entry: '', environment: '', steps: '', expected: '', actual: '', occurredAt: '', frequency: '', impact: '', questions: '' })
