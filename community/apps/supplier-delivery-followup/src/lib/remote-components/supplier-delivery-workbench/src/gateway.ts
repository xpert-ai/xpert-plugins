// The only data boundary the components use. Preview (fixture) and production (view provider)
// answer the same envelopes behind the host bridge, so nothing here knows which one it talks to.
import type {
  WorkbenchActionInput,
  WorkbenchActionKey,
  WorkbenchActionResult,
  WorkbenchClientCommand,
  WorkbenchDataResponse,
  WorkbenchTable
} from '../../../workbench-contract'
import { executeAction, invokeClientCommand, requestData } from './bridge'

export class WorkbenchRequestError extends Error {
  constructor(
    readonly code: string,
    readonly params?: Record<string, string | number>
  ) {
    super(code)
    this.name = 'WorkbenchRequestError'
  }
}

interface QueryOptions {
  id?: string
  page?: number
  pageSize?: number
  search?: string
}

async function query<T extends WorkbenchTable>(
  table: T,
  options: QueryOptions = {}
): Promise<WorkbenchDataResponse[T]> {
  const response = (await requestData({
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 100,
    search: options.search ?? '',
    // View queries only carry scalar parameters.
    parameters: options.id ? { table, id: options.id } : { table }
  })) as { meta?: WorkbenchDataResponse[T]; error?: { code: string } } | undefined
  if (response?.error) throw new WorkbenchRequestError(response.error.code)
  if (!response?.meta) throw new WorkbenchRequestError('empty_response')
  return response.meta
}

export const gateway = {
  overview: () => query('overview'),
  replies: () => query('replies'),
  reply: (id: string) => query('reply', { id }),
  orderLines: (search = '') => query('orderLines', { search }),
  orderLine: (id: string) => query('orderLine', { id }),

  async action<K extends WorkbenchActionKey>(
    key: K,
    targetId: string,
    input: WorkbenchActionInput[K]
  ): Promise<WorkbenchActionResult<K>> {
    const result = (await executeAction(key, targetId, input)) as WorkbenchActionResult<K> | undefined
    if (!result || typeof result !== 'object' || !('success' in result))
      return { success: false, code: 'empty_response' }
    return result
  },

  invokeCommand(command: WorkbenchClientCommand) {
    return invokeClientCommand(command.commandKey, command.payload)
  }
}
