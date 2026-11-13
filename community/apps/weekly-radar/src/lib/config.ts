import { z } from 'zod/v3'

export const WeeklyRadarPluginConfigSchema = z.object({
  /** Days a pending-confirm entry may sit before the radar reports it. */
  pendingConfirmDays: z.number().int().min(1).max(30).default(3),
  /** Grace days before an overdue entry is reported. */
  overdueGraceDays: z.number().int().min(0).max(14).default(0),
  /** Days an untouched open entry must age before it becomes high risk. */
  crossWeekHighDays: z.number().int().min(1).max(60).default(7),
  /** Days an untouched open entry must age before it becomes medium risk. */
  crossWeekMediumDays: z.number().int().min(1).max(60).default(3)
})

export type WeeklyRadarPluginConfig = z.infer<typeof WeeklyRadarPluginConfigSchema>

export function readWeeklyRadarPluginEnvDefaults(): Partial<WeeklyRadarPluginConfig> {
  const defaults: Partial<WeeklyRadarPluginConfig> = {}
  const pendingConfirmDays = Number(process.env.WEEKLY_RADAR_PENDING_CONFIRM_DAYS)
  if (Number.isFinite(pendingConfirmDays) && pendingConfirmDays > 0) {
    defaults.pendingConfirmDays = Math.floor(pendingConfirmDays)
  }
  const overdueGraceDays = Number(process.env.WEEKLY_RADAR_OVERDUE_GRACE_DAYS)
  if (Number.isFinite(overdueGraceDays) && overdueGraceDays >= 0) {
    defaults.overdueGraceDays = Math.floor(overdueGraceDays)
  }
  return defaults
}
