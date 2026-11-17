import { AsyncLocalStorage } from 'node:async_hooks'

/** Correlates a plugin-owned dispatch intent with the Handoff envelope built in its request. */
export const larkEventDispatch = new AsyncLocalStorage<{
  integrationId: string
  xpertId: string
  runId: string
  record: (runId: string, conversationId?: string) => Promise<void>
}>()
