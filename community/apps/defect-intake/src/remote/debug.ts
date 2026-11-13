let enabled = false
export const configureDebug = (value: boolean) => { enabled = value }
/** Only enumerated checkpoints and primitive counts: no payload/identity/credentials. */
export function trace(event: 'bridge.init' | 'analysis.poll' | 'analysis.merge' | 'analysis.conflict', counts: Record<string, number | boolean> = {}) {
  if (enabled) console.debug('[defect_intake]', event, counts)
}
