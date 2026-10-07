/** Persist bounded public completion facts before the guest's protocol spool is cleaned. */
export type CompletionCode = 'completed' | 'protocol_invalid' | 'missing_final_result' |
  'ambiguous_final_result' | 'permission_denied' | 'cli_error' | 'process_exit_nonzero' |
  'process_failed' | 'missing_exit_code' | 'activity_incomplete' | 'runner_unavailable'

export interface CompletionDiagnostic {
  code: CompletionCode
  message: string
  exitCode?: number
  finalEventType?: string
  finalEventSubtype?: string
  permissionDenials?: number
  toolName?: string
  command?: string
}

export type CompletionCheck =
  | { ok: true; text: string; diagnostic: CompletionDiagnostic }
  | { ok: false; diagnostic: CompletionDiagnostic }

/** Do not put unbounded provider messages or credential-bearing command arguments in receipts. */
export function publicDiagnostic(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-|xpt_)[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/(--[\w-]*(?:api[_-]?key|token|password|secret|authorization)\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .slice(0, 1200)
}

export function completionFailure(code: CompletionCode, message: string,
  details: Omit<CompletionDiagnostic, 'code' | 'message'> = {}): CompletionCheck {
  return { ok: false, diagnostic: { ...details, code, message: publicDiagnostic(message) } }
}

export function completionMetadata(value: CompletionDiagnostic) {
  // Explicit JSON projection keeps optional/undefined values out of the durable handle.
  return {
    code: value.code, message: value.message,
    ...(value.exitCode !== undefined ? { exitCode: value.exitCode } : {}),
    ...(value.finalEventType ? { finalEventType: value.finalEventType } : {}),
    ...(value.finalEventSubtype ? { finalEventSubtype: value.finalEventSubtype } : {}),
    ...(value.permissionDenials !== undefined ? { permissionDenials: value.permissionDenials } : {}),
    ...(value.toolName ? { toolName: value.toolName } : {}),
    ...(value.command ? { command: value.command } : {})
  }
}
