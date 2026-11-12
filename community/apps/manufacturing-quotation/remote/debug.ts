let enabled = false
const kinds = new Set(['requestData', 'executeAction', 'executeFileAction', 'invokeClientCommand',
  'data', 'actionResult', 'fileActionResult', 'clientCommandResult'])

export function configureRemoteDebug(config?: { enabled: boolean }) {
  enabled = config?.enabled === true
}

// Allowlisted bridge metadata only; never log payloads, identities, source text or errors.
function redactDebugData(data: { kind?: string; pending?: number }) {
  return {
    ...(data.kind && kinds.has(data.kind) ? { kind: data.kind } : {}),
    ...(Number.isSafeInteger(data.pending) && data.pending! >= 0 ? { pending: data.pending } : {})
  }
}

export function debugBridge(event: 'init' | 'request' | 'response' | 'timeout' | 'cancel',
  data: { kind?: string; pending?: number } = {}) {
  if (enabled) console.debug('[manufacturing-quotation]', event, redactDebugData(data))
}
