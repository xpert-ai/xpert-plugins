export interface RemoteDebugConfig { enabled?: boolean; production?: boolean }

let enabled = false

export function configureRemoteDebug(config?: RemoteDebugConfig) {
  enabled = config?.enabled === true && config.production !== true
}

/** Only fixed metadata is accepted; business payloads and error messages never enter logs. */
export function debugCheckpoint(event: 'init' | 'host-event' | 'request' | 'response' | 'timeout', details: {
  requestType?: string; actionKey?: string; commandKey?: string; outcome?: 'ok' | 'error'
} = {}) {
  if (!enabled) return
  console.debug('[resume-screening]', event, {
    ...(details.requestType ? { requestType: details.requestType } : {}),
    ...(details.actionKey ? { actionKey: details.actionKey } : {}),
    ...(details.commandKey ? { commandKey: details.commandKey } : {}),
    ...(details.outcome ? { outcome: details.outcome } : {})
  })
}
