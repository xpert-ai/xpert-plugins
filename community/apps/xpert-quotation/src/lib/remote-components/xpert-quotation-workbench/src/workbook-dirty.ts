import type { IExecutionOptions } from '@univerjs/core'

const PERSISTENT_VALUE_COMMAND_IDS = new Set([
  'sheet.mutation.set-range-values',
  'sheet.mutation.move-range',
  'sheet.mutation.remove-worksheet-merge',
  'sheet.mutation.add-worksheet-merge',
  'sheet.mutation.reorder-range',
  'sheet.mutation.set-worksheet-default-style',
  'sheet.mutation.set-row-data',
  'sheet.mutation.set-col-data',
  'sheet.mutation.set-worksheet-range-theme-style',
  'sheet.mutation.delete-worksheet-range-theme-style'
])

export function isUserWorkbookValueChange(event: { id: string; options?: IExecutionOptions }) {
  if (!PERSISTENT_VALUE_COMMAND_IDS.has(event.id)) return false
  return !event.options?.onlyLocal && !event.options?.fromChangeset && !event.options?.syncOnly
}
