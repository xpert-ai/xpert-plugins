import type {
  ConnectorConnectionPollInput, ConnectorConnectionPollResult
} from '@xpert-ai/plugin-sdk/connector'

export type PollingDriverOptions<T extends Record<string, unknown>> = {
  kind: 'polling'
  assertAuthMethod: (id: string) => void
  readPending: (metadata: Record<string, unknown> | null | undefined) => T
  expiresAt: (pending: T) => string
  expiredMessage: string
  intervalSeconds: number
  poll: (pending: T, input: ConnectorConnectionPollInput) => Promise<ConnectorConnectionPollResult>
}

/** Each call is stateless. Pending state stays in the host's encrypted connection. */
export function createPollingDriver<T extends Record<string, unknown>>(options: PollingDriverOptions<T>) {
  if (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds <= 0) {
    throw new Error('A positive polling interval is required')
  }
  return {
    kind: options.kind,
    async pollConnection(input: ConnectorConnectionPollInput): Promise<ConnectorConnectionPollResult> {
      options.assertAuthMethod(input.authMethodId)
      const pending = options.readPending(input.metadata)
      const result = await pollBeforeDeadline({ expiresAt: options.expiresAt(pending), expiredMessage: options.expiredMessage },
        () => options.poll(pending, input))
      return result.status === 'pending'
        ? { ...result, metadata: result.metadata ?? pending, pollIntervalSeconds: result.pollIntervalSeconds ?? options.intervalSeconds }
        : result
    }
  }
}

/** Also accepts the legacy host polling result without translating its credential shape. */
export async function pollBeforeDeadline<T>(
  options: { expiresAt?: string; expiredMessage: string; allowMissingDeadline?: boolean },
  poll: () => Promise<T>
): Promise<T | { status: 'error'; error: string }> {
  const expires = options.expiresAt === undefined && options.allowMissingDeadline
    ? Infinity : Date.parse(options.expiresAt ?? '')
  if (Number.isNaN(expires) || Date.now() >= expires) return { status: 'error', error: options.expiredMessage }
  return poll()
}
