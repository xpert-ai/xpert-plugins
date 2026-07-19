export function classifyExportError(message) {
  const normalized = message.toUpperCase()
  if (normalized.includes('EXPORT_OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('EXPORT_INPUT_INVALID') || normalized.includes('GOAL SPEC VALIDATION FAILED')) return 'EXPORT_INPUT_INVALID'
  if (normalized.includes('TIMEOUT') || normalized.includes('TIMED OUT') || normalized.includes('DEADLINE')) return 'EXPORT_TIMEOUT'
  if (normalized.includes('BROWSER') || normalized.includes('CHROMIUM') || normalized.includes('PLAYWRIGHT')) return 'BROWSER_LAUNCH_FAILED'
  if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM')) return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}
