import { KDOCS_MAX_DOCUMENT_CONTENT_CHARS } from '../constants.js'
import { KdocsConnectorError } from '../errors.js'

export type KdocsPayload = Record<string, unknown>

export function mapFilePage(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  const rawItems = readArray(data.items)
  const items = rawItems.slice(0, 100).map((item) => {
    const record = requireRecord(item, 'WPS file list item is invalid')
    return mapFileSummary(readRecord(record.file) ?? record)
  })
  const nextPageToken = readString(data.next_page_token)
  return {
    status: items.length > 0 ? 'ok' : 'empty',
    items,
    nextPageToken,
    hasMore: !!nextPageToken,
    total: readNonNegativeInteger(data.total)
  }
}

export function mapFileInfo(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  const permission = readRecord(data.permission)
  return {
    ...mapFileSummary(data),
    permissions: permission
      ? {
          canPreview: readBoolean(permission.preview),
          canUpdate: readBoolean(permission.update),
          canDownload: readBoolean(permission.download),
          canRename: readBoolean(permission.rename),
          canMove: readBoolean(permission.move),
          canShare: readBoolean(permission.share)
        }
      : undefined
  }
}

export function mapFileSummary(value: KdocsPayload) {
  return {
    fileId: requireString(value.id, 'WPS file response did not include a file ID'),
    name: requireString(value.name, 'WPS file response did not include a file name'),
    type: readString(value.type),
    driveId: readString(value.drive_id),
    parentId: readString(value.parent_id),
    size: readNonNegativeInteger(value.size),
    version: readNonNegativeInteger(value.version),
    createdAt: epochToIso(value.ctime),
    modifiedAt: epochToIso(value.mtime),
    shared: readBoolean(value.shared)
  }
}

export function mapFileLink(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  const link = readString(data.link_url) ?? readString(data.url) ?? readString(data.link)
  if (!link) throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS file link response did not include a link')
  const parsed = new URL(link)
  if (parsed.protocol !== 'https:' || !isWpsHostname(parsed.hostname)) {
    throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS returned an untrusted file link')
  }
  return { fileId: readString(data.id) ?? readString(data.file_id), link: parsed.toString() }
}

export function mapDocumentContent(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  const status = readString(data.task_status) ?? 'success'
  const rawContent = readString(data.markdown) ?? readString(data.plain) ?? ''
  const content = rawContent.slice(0, KDOCS_MAX_DOCUMENT_CONTENT_CHARS)
  return {
    status,
    taskId: readString(data.task_id),
    sourceFormat: readString(data.src_format),
    format: readString(data.dst_format),
    version: readString(data.version),
    content,
    truncated: rawContent.length > content.length
  }
}

export function mapSheets(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  return {
    sheets: readArray(data.sheetsInfo ?? data.sheets_info).slice(0, 200).map((value) => {
      const sheet = requireRecord(value, 'WPS sheet response contains an invalid item')
      return {
        sheetId: requireNonNegativeInteger(sheet.sheetId ?? sheet.sheet_id, 'WPS sheet response is missing sheetId'),
        index: readNonNegativeInteger(sheet.sheetIdx ?? sheet.sheet_idx),
        name: requireString(sheet.sheetName ?? sheet.sheet_name, 'WPS sheet response is missing sheetName'),
        type: readString(sheet.sheetType ?? sheet.sheet_type),
        empty: readBoolean(sheet.isEmpty ?? sheet.is_empty),
        visible: readBoolean(sheet.isVisible ?? sheet.is_visible),
        rowFrom: readNonNegativeInteger(sheet.rowFrom ?? sheet.row_from),
        rowTo: readNonNegativeInteger(sheet.rowTo ?? sheet.row_to),
        colFrom: readNonNegativeInteger(sheet.colFrom ?? sheet.col_from),
        colTo: readNonNegativeInteger(sheet.colTo ?? sheet.col_to)
      }
    })
  }
}

export function mapSheetRange(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  const detail = readRecord(data.detail) ?? data
  return {
    cells: readArray(detail.rangeData ?? detail.range_data).slice(0, 5_000).map((value) => {
      const cell = requireRecord(value, 'WPS cell response contains an invalid item')
      return {
        row: requireNonNegativeInteger(cell.rowFrom ?? cell.row_from, 'WPS cell response is missing a row'),
        col: requireNonNegativeInteger(cell.colFrom ?? cell.col_from, 'WPS cell response is missing a column'),
        text: boundedString(cell.cellText ?? cell.cell_text, 10_000),
        value: boundedString(cell.originalCellValue ?? cell.original_cell_value, 10_000),
        formula: boundedString(cell.fmlaText ?? cell.formula, 10_000),
        numberFormat: boundedString(cell.numFormat ?? cell.num_format, 200),
        picture: readBoolean(cell.isCellPic ?? cell.is_cell_pic) === true
      }
    })
  }
}

export function mapMutationReceipt(
  payload: KdocsPayload,
  operation: string,
  options?: { verified?: boolean; fileId?: string; details?: KdocsPayload }
) {
  const data = unwrapProviderData(payload)
  return {
    status: 'completed',
    operation,
    fileId: options?.fileId ?? readString(data.id) ?? readString(data.file_id),
    name: readString(data.name),
    verified: options?.verified === true,
    details: options?.details
  }
}

export function extractFileId(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  return requireString(data.id ?? data.file_id, 'WPS mutation response did not include a file ID')
}

export function extractDownload(payload: KdocsPayload) {
  const data = unwrapProviderData(payload)
  const url = requireString(data.url, 'WPS download response did not include a URL')
  const hashes = readArray(data.hashes).slice(0, 10).flatMap((value) => {
    const hash = readRecord(value)
    const type = readString(hash?.type)
    const sum = readString(hash?.sum)
    return type && sum ? [{ type, sum }] : []
  })
  return { url, hashes }
}

export function assertProviderSuccess(payload: KdocsPayload) {
  let current = payload
  for (let depth = 0; depth < MAX_PROVIDER_ENVELOPE_DEPTH; depth += 1) {
    assertProviderLevelSuccess(current)
    const nested = readRecord(current.data)
    if (!nested || readProviderCode(nested.code) == null) return
    current = nested
  }
  throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS response contains too many nested envelopes')
}

export function unwrapProviderData(payload: KdocsPayload) {
  let current = payload
  let unwrapped = false
  for (let depth = 0; depth < MAX_PROVIDER_ENVELOPE_DEPTH; depth += 1) {
    assertProviderLevelSuccess(current)
    const nested = readRecord(current.data)
    if (!nested || (unwrapped && readProviderCode(current.code) == null)) return current
    current = nested
    unwrapped = true
  }
  throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS response contains too many nested envelopes')
}

export function readRecord(value: unknown): KdocsPayload | undefined {
  return isRecord(value) ? value : undefined
}

export function providerFailureMessage(payload: KdocsPayload) {
  for (const record of providerEnvelopeRecords(payload)) {
    const error = readRecord(record.error)
    const message = readString(record.msg) ?? readString(record.message) ?? readString(error?.message)
    if (message) return message
  }
  return undefined
}

export function providerFailureCode(payload: KdocsPayload) {
  for (const record of providerEnvelopeRecords(payload)) {
    const error = readRecord(record.error)
    const code = readProviderCode(record.code) ?? readProviderCode(error?.code)
    if (code && code !== '0' && code !== '200') return code
  }
  return undefined
}

export function isWpsHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  return ['wps.cn', 'kdocs.cn', 'wps365.com'].some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))
}

function requireRecord(value: unknown, message: string): KdocsPayload {
  const result = readRecord(value)
  if (!result) throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', message)
  return result
}

function assertProviderLevelSuccess(payload: KdocsPayload) {
  const code = readProviderCode(payload.code)
  if (code == null || code === '0' || code === '200') return
  const message = readString(payload.msg) ?? readString(payload.message) ?? `WPS request failed with code ${code}`
  if (code === '400006' || code === '401') {
    throw new KdocsConnectorError('TOKEN_EXPIRED', 'WPS connector authorization has expired')
  }
  if (code === '429001' || code === '429') throw new KdocsConnectorError('RATE_LIMITED', message, true)
  if (code === '429002') throw new KdocsConnectorError('CIRCUIT_OPEN', message, true)
  throw new KdocsConnectorError('MCP_TOOL_FAILED', message)
}

function providerEnvelopeRecords(payload: KdocsPayload) {
  const records: KdocsPayload[] = []
  let current: KdocsPayload | undefined = payload
  for (let depth = 0; current && depth < MAX_PROVIDER_ENVELOPE_DEPTH; depth += 1) {
    records.push(current)
    const nested = readRecord(current.data)
    current = nested && readProviderCode(nested.code) != null ? nested : undefined
  }
  return records
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function boundedString(value: unknown, maximum: number) {
  const text = readString(value)
  return text ? text.slice(0, maximum) : undefined
}

function requireString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', message)
  return result
}

function readProviderCode(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return readString(value)
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function requireNonNegativeInteger(value: unknown, message: string) {
  const result = readNonNegativeInteger(value)
  if (result == null) throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', message)
  return result
}

function epochToIso(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  const milliseconds = value > 10_000_000_000 ? value : value * 1_000
  const date = new Date(milliseconds)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function isRecord(value: unknown): value is KdocsPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const MAX_PROVIDER_ENVELOPE_DEPTH = 5
