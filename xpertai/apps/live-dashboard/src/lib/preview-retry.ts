import { createHash } from 'node:crypto'
import type { AgentBuiltInState, ToolCallHandler, ToolCallRequest } from '@xpert-ai/plugin-sdk'

const PREVIEW_TOOLS = new Set(['dashboard_preview', 'dashboard_preview_binding', 'dashboard_test_filter'])

/** Run-local bounds include tool-schema failures, before any discovery or query executes. */
export function createPreviewRetryGuard() {
  const failures = new Map<string, { count: number; message: string }>(), pending = new Set<string>()
  let consecutiveFailures = 0, lastError = ''
  const recordFailure = (key: string, message: string) => {
    failures.set(key, { count: (failures.get(key)?.count ?? 0) + 1, message: message.slice(0, 2000) })
    consecutiveFailures++
    lastError = message.slice(0, 2000)
  }
  const guard = {
    get exhausted() { return consecutiveFailures >= 6 },
    get summary() { return `DASHBOARD_PREVIEW_RETRY_LIMIT: preview validation repeatedly failed. This run has stopped making tool calls. Report the last error and the required repair; do not claim an unconfirmed save. Last error: ${lastError}` },
    async attempt<T>(name: string, args: unknown, handler: () => Promise<T>) {
      const key = createHash('sha256').update(JSON.stringify({ name, args }, (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest('hex')
      if (consecutiveFailures >= 6) throw new Error(this.summary)
      if ((failures.get(key)?.count ?? 0) >= 2) {
        consecutiveFailures++
        throw new Error(`DASHBOARD_PREVIEW_REPEAT_BLOCKED: this exact tool input already failed twice; no query was executed. Correct the input using the previous diagnostic, or stop and report the blocker. Last error: ${failures.get(key)!.message}`)
      }
      // Concurrent duplicate calls must not multiply queries or bypass the per-input bound.
      if (pending.has(key)) throw new Error('DASHBOARD_PREVIEW_IN_PROGRESS: wait for the identical preview already in progress; do not submit duplicates.')
      pending.add(key)
      try {
        const result = await handler()
        if (result && typeof result === 'object' && 'status' in result && result.status === 'error' && 'content' in result) {
          recordFailure(key, typeof result.content === 'string' ? result.content : 'Preview tool returned an error')
        } else {
          failures.delete(key)
          consecutiveFailures = 0
        }
        return result
      } catch (error) {
        recordFailure(key, error instanceof Error ? error.message : 'Preview tool failed')
        throw error
      } finally {
        pending.delete(key)
      }
    }
  }
  return { ...guard,
    get exhausted() { return guard.exhausted },
    get summary() { return guard.summary },
    run(request: ToolCallRequest<AgentBuiltInState>, handler: ToolCallHandler) {
      return PREVIEW_TOOLS.has(request.toolCall.name)
        ? guard.attempt(request.toolCall.name, request.toolCall.args, async () => handler(request)) : handler(request)
    }
  }
}
