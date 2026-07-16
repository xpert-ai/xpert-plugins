import { createHash } from 'node:crypto'

const JOB_ID_DIGEST_LENGTH = 32

function deterministicJobId(prefix: string, parts: readonly string[]): string {
  const digest = createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, JOB_ID_DIGEST_LENGTH)
  return `${prefix}_${digest}`
}

export function buildLarkInboundJobId(messageLogId: string): string {
  return deterministicJobId('lark_inbound', [messageLogId])
}

export function buildLarkCardActionJobId(
  scopeKey: string,
  xpertId: string,
  action: string,
  actionMessageId?: string
): string {
  return deterministicJobId('lark_card_action', [scopeKey, xpertId, actionMessageId ?? '', action])
}

export function buildLarkGroupWindowFlushJobId(windowKey: string): string {
  return deterministicJobId('lark_group_window_flush', [windowKey])
}

export function buildLarkHistoryMaterializeJobId(
  integrationId: string,
  messageLogIds: readonly string[],
  continuation = 0
): string {
  return deterministicJobId('plugin_lark_history_materialize', [
    integrationId,
    ...messageLogIds,
    String(continuation)
  ])
}

export function buildLarkHistoryCleanupJobId(
  integrationId: string,
  dayBucket: string,
  continuation = 0
): string {
  return deterministicJobId('plugin_lark_history_cleanup', [integrationId, dayBucket, String(continuation)])
}
