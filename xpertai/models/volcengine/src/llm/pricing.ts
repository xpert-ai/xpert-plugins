import type { LLMPriceContext } from '@xpert-ai/contracts'

export const ARK_TIME_PRICED_MODELS = new Set([
  'deepseek-v4-1-flash-260910',
  'deepseek-v4-1-flash-261017',
  'deepseek-v4-1-flash-economy-261017'
])

/** Ark charges at completion time: weekdays 09–12 and 14–18 in Beijing. */
export function getArkPriceMode(at: Date | string = new Date()): 'ark_peak' | 'ark_off_peak' {
  const instant = new Date(at)
  if (!Number.isFinite(instant.getTime())) throw new Error('pricingTime must be a valid date')
  const beijing = new Date(instant.getTime() + 8 * 60 * 60 * 1000)
  const day = beijing.getUTCDay()
  const hour = beijing.getUTCHours()
  return day >= 1 && day <= 5 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18))
    ? 'ark_peak'
    : 'ark_off_peak'
}

export function resolveArkPriceContext(model: string, context: LLMPriceContext): LLMPriceContext {
  if (!ARK_TIME_PRICED_MODELS.has(model)) return context
  // A completion callback has already selected the mode; offline pricing uses its supplied timestamp.
  const mode = context.mode === 'ark_peak' || context.mode === 'ark_off_peak'
    ? context.mode
    : getArkPriceMode(context.pricingTime)
  return { ...context, mode }
}
