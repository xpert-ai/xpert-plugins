import type { AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import type { AnalyticsProviderResult, RestClientRuntimeApi, RestClientScope } from '@xpert-ai/plugin-sdk'
import { readPath, type RestDatasetDefinition, type RestPayload } from './schema'
import { mapCell, validTimestamp } from './result'

type PageParameter = { in: 'query' | 'body'; name: string }
function writeParameter(args: Record<string, JSONValue>, parameter: PageParameter, value: JSONValue) {
  const group = args[parameter.in] ?? {}
  if (typeof group !== 'object' || group === null || Array.isArray(group)) throw new Error('REST_DATASET_PAGINATION_ARGUMENT_INVALID')
  group[parameter.name] = value
  args[parameter.in] = group
}

export function paginationDefaults(dataset: RestDatasetDefinition): Record<string, JSONValue> {
  const args = structuredClone(dataset.defaultArguments), page = dataset.pagination
  if (page.type !== 'none') {
    writeParameter(args, page.limit, page.pageSize)
    writeParameter(args, page.type === 'offset' ? page.offset : page.cursor, page.type === 'offset' ? 0 : page.initialCursor)
  }
  return args
}

/** Narrow the native schema with catalog-owned constants so Agents do not optimize page sizes. */
export function bindingInputSchema(native: Record<string, JSONValue>, dataset: RestDatasetDefinition): Record<string, JSONValue> {
  const page = dataset.pagination
  if (page.type === 'none') return native
  const groups: Record<string, JSONValue> = {}
  for (const parameter of [page.limit, page.type === 'offset' ? page.offset : page.cursor]) {
    const lockedValue = parameter === page.limit ? page.pageSize : page.type === 'offset' ? 0 : page.initialCursor
    groups[parameter.name + ':' + parameter.in] = { type: 'object', properties: { [parameter.in]: { type: 'object', properties: {
      [parameter.name]: { const: lockedValue, description: 'Server-managed pagination value: preserve this exact default; do not bind to a control.' }
    } } } }
  }
  return { ...native, allOf: [...(Array.isArray(native.allOf) ? native.allOf : []), ...Object.values(groups)] }
}

/** Pagination is selected by the catalog owner; controls cannot change limits, offsets or cursors. */
export function checkPaginationArguments(dataset: RestDatasetDefinition, payload: RestPayload) {
  const page = dataset.pagination
  if (page.type === 'none') return
  const defaults = paginationDefaults(dataset)
  for (const parameter of [page.limit, page.type === 'offset' ? page.offset : page.cursor]) {
    const path = [parameter.in, parameter.name]
    if (Object.values(payload.parameterPaths).some(segments => path.every((part, i) => segments[i] === part)))
      throw new BadRequestException({ code: 'REST_DATASET_PAGINATION_CONTROL_DENIED', message: 'REST_DATASET_PAGINATION_CONTROL_DENIED: pagination is server-managed. Remove pagination fields from parameterPaths and bind only business filters.' })
    const group = payload.arguments[parameter.in]
    if (group !== null && typeof group === 'object' && !Array.isArray(group) && Object.hasOwn(group, parameter.name) &&
      group[parameter.name] !== readPath(defaults, path)) throw new BadRequestException({ code: 'REST_DATASET_PAGINATION_OVERRIDE_DENIED',
        message: 'REST_DATASET_PAGINATION_OVERRIDE_DENIED: copy the exact pagination defaults from discovery bindingPayload.arguments. Do not increase the limit or change the offset/cursor. The provider automatically fetches all pages within its limits.' })
  }
}

export async function queryPages(api: RestClientRuntimeApi, scope: RestClientScope, dataset: RestDatasetDefinition,
  payload: RestPayload, args: Record<string, JSONValue>, maxRows: number): Promise<AnalyticsProviderResult> {
  const page = dataset.pagination, selectors = dataset.result
  const rows: Record<string, AnalyticsValue>[] = []
  const cursors = new Set<string>()
  let exhausted = false, truncated = false, total: number | undefined, dataAsOf: string | undefined, sourceFetchedAt = ''
  let position: JSONValue = page.type === 'cursor' ? page.initialCursor : 0
  const count = page.type === 'none' ? 1 : page.maxPages
  for (let index = 0; index < count; index++) {
    scope.signal.throwIfAborted()
    if (Date.now() >= scope.deadlineAt) throw new Error('REST_DATASET_DEADLINE_EXCEEDED')
    if (page.type !== 'none') {
      writeParameter(args, page.limit, page.pageSize)
      writeParameter(args, page.type === 'offset' ? page.offset : page.cursor, position)
    }
    const response = await api.operations.call(scope, { operationId: dataset.operationId,
      contractHash: payload.operationContractHash, arguments: args })
    scope.signal.throwIfAborted()
    sourceFetchedAt = response.sourceFetchedAt
    const sourceRows = readPath(response.body, selectors.rowsPath)
    if (!Array.isArray(sourceRows)) throw new Error('REST_DATASET_ROWS_INVALID')
    const pageTotal = selectors.totalPath ? readPath(response.body, selectors.totalPath) : undefined
    if (pageTotal !== undefined) {
      if (typeof pageTotal !== 'number' || !Number.isSafeInteger(pageTotal) || pageTotal < rows.length + sourceRows.length ||
          (total !== undefined && total !== pageTotal)) throw new Error('REST_DATASET_TOTAL_INVALID')
      total = pageTotal
    }
    const timestamp = selectors.dataAsOfPath ? readPath(response.body, selectors.dataAsOfPath) : undefined
    if (timestamp !== undefined) {
      if (!validTimestamp(timestamp) || (dataAsOf !== undefined && dataAsOf !== timestamp)) throw new Error('REST_DATASET_FRESHNESS_INVALID')
      dataAsOf = timestamp
    }
    const reportedTruncation = selectors.truncatedPath ? readPath(response.body, selectors.truncatedPath) : false
    if (typeof reportedTruncation !== 'boolean') throw new Error('REST_DATASET_TRUNCATION_INVALID')
    truncated ||= reportedTruncation || rows.length + sourceRows.length > maxRows
    rows.push(...sourceRows.slice(0, maxRows - rows.length).map(row => Object.fromEntries(selectors.columns.map(column => [column.key, mapCell(row, column)]))))
    if (page.type === 'none') exhausted = true
    else if (page.type === 'offset') {
      const hasMore = readPath(response.body, page.hasMorePath)
      if (typeof hasMore !== 'boolean') throw new Error('REST_DATASET_PAGINATION_INVALID')
      exhausted = !hasMore
      position = Number(position) + sourceRows.length
    } else {
      const cursor = readPath(response.body, page.nextCursorPath)
      if (cursor !== null && (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 2000))
        throw new Error('REST_DATASET_PAGINATION_INVALID')
      exhausted = cursor === null
      if (typeof cursor === 'string') {
        if (cursor === position || cursors.has(cursor)) throw new Error('REST_DATASET_PAGINATION_LOOP')
        cursors.add(cursor)
      }
      position = cursor
    }
    if (!exhausted && sourceRows.length === 0) throw new Error('REST_DATASET_PAGINATION_EMPTY_PAGE')
    if (exhausted || truncated || rows.length >= maxRows) break
  }
  truncated ||= !exhausted
  const complete = selectors.scope === 'full_query_result' && !truncated
  if (complete && total !== undefined && total !== rows.length) throw new Error('REST_DATASET_TOTAL_INVALID')
  return {
    columns: selectors.columns.map(({ key, semanticRef }) => ({ key, ...(semanticRef ? { semanticRef } : {}) })), rows,
    completeness: { returnedRows: rows.length, scope: complete ? 'full_query_result' : 'page', truncated,
      totalAccuracy: total !== undefined || complete ? 'exact' : 'unknown',
      ...(total !== undefined ? { totalRows: total } : complete ? { totalRows: rows.length } : {}) },
    sourceFetchedAt, ...(dataAsOf ? { dataAsOf } : {})
  }
}
