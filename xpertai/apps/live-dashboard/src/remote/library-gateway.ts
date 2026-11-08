import { z } from 'zod/v3'
import { requestHost, captureViewScope } from './bridge'
import { taskDraftV2Schema } from '../lib/library/execution-contract'

export async function libraryAction<T>(actionKey: string, input: object, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const result = z.object({ success: z.literal(true), data: z.unknown() }).parse(await requestHost('executeAction', { actionKey, input }))
  return schema.parse(result.data)
}

export async function libraryCommand(commandKey: string, payload: object) {
  const result = z.object({ success: z.boolean(), message: z.string().optional(), code: z.string().optional() }).parse(await requestHost('invokeClientCommand', { commandKey, payload }))
  if (!result.success) throw new Error(result.message ?? result.code ?? 'DASHBOARD_NAVIGATION_FAILED')
}

export async function useResourceTask(releaseId: string, requestId: string) {
  const assertCurrent = captureViewScope()
  const draft = await libraryAction('resource-prepare-task', { releaseId, requestId }, taskDraftV2Schema)
  assertCurrent()
  await libraryCommand('assistant.composer.insert', draft)
}
