import { createHash } from 'node:crypto'
import axios from 'axios'
import type { DatabaseImportInput, DatabaseImportReceipt } from '@xpert-ai/plugin-sdk/data-workbench'
import type { DorisAdapterOptions } from './doris.strategy.js'

export function parseStreamLoadReceipt(body: unknown, label: string): DatabaseImportReceipt {
  if (!body || typeof body !== 'object') throw new Error('invalid_stream_load_receipt')
  const value = body as Record<string, unknown>
  const count = (key: string) => { const result = Number(value[key]); if (!Number.isSafeInteger(result) || result < 0) throw new Error('invalid_stream_load_count'); return result }
  const status = value.Status, existing = value.ExistingJobStatus
  if (status === 'Success') return { outcome: 'succeeded', label, loadedRows: count('NumberLoadedRows'), filteredRows: count('NumberFilteredRows'), diagnostics: count('NumberFilteredRows') ? ['filtered_rows_reported'] : [] }
  if (status === 'Publish Timeout') return { outcome: 'pending', label, diagnostics: ['committed_awaiting_visibility_do_not_replay'] }
  if (status === 'Label Already Exists') return { outcome: existing === 'FINISHED' ? 'succeeded' : existing === 'RUNNING' ? 'pending' : 'unknown', label, diagnostics: ['duplicate_label_no_replay', 'original_row_counts_unavailable'] }
  return { outcome: 'unknown', label, diagnostics: ['stream_load_not_confirmed', typeof status === 'string' ? status.slice(0, 80) : 'missing_status'] }
}

export function createDorisStreamLoad(options: DorisAdapterOptions) {
  return async (input: DatabaseImportInput, signal?: AbortSignal): Promise<DatabaseImportReceipt> => {
    if (!input.database || !/^[a-zA-Z0-9_-]{8,128}$/.test(input.operationId)) throw new Error('invalid_stream_load_target')
    if (input.columns.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) throw new Error('stream_load_column_mapping_not_supported')
    const host = options.apiHost || options.host, protocol = options.use_ssl ? 'https:' : 'http:'
    const url = new URL(`${protocol}//${host}:${options.apiPort || 8030}/api/${encodeURIComponent(input.database)}/${encodeURIComponent(input.table)}/_stream_load`)
    const label = `db_studio_${createHash('sha256').update(input.operationId).digest('hex').slice(0, 40)}`
    const body = JSON.stringify(input.rows.map((row) => Object.fromEntries(input.columns.map((name, i) => [name, row[i]]))))
    if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('import_byte_limit_exceeded')
    const headers = { authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`, expect: '100-continue', label, format: 'json', strip_outer_array: 'true', strict_mode: 'true', max_filter_ratio: '0', 'content-type': 'application/json', timeout: '120' }
    // Redirects never forward credentials to an unconfigured host. Deployments with separate
    // BE hosts must explicitly allow them in server-only datasource options.
    const allow = new Set([url.hostname, ...(options.streamLoadHosts ?? [])])
    // Node fetch rejects Expect headers; the existing Axios HTTP transport supports
    // Doris FE's 100-continue handshake while keeping redirects under our control.
    const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(125000)]) : AbortSignal.timeout(125000)
    const request = (target: URL) => axios.request<unknown>({
      url: target.toString(), method: 'PUT', adapter: 'http', headers, data: body,
      maxRedirects: 0, proxy: false, validateStatus: () => true,
      maxBodyLength: 8 * 1024 * 1024, maxContentLength: 8 * 1024 * 1024,
      timeout: 125000, signal: boundedSignal
    })
    try {
      let response = await request(url)
      if (response.status === 307) {
        const location = response.headers.location
        if (typeof location !== 'string' || !location) throw new Error('stream_load_redirect_missing')
        const target = new URL(location, url)
        if (target.protocol !== url.protocol || !allow.has(target.hostname) || target.pathname !== url.pathname) throw new Error('stream_load_redirect_denied')
        // Doris FE may echo credentials in Location. Ignore URL credentials and
        // keep the configured Authorization header for the allowlisted BE host.
        target.username = ''
        target.password = ''
        response = await request(target)
      }
      if (response.status < 200 || response.status >= 300) return { outcome: 'unknown', label, diagnostics: [`http_${response.status}`, 'verify_label_before_retry'] }
      return parseStreamLoadReceipt(response.data, label)
    } catch {
      return { outcome: 'unknown', label, diagnostics: ['transport_interrupted_verify_label_before_retry'] }
    }
  }
}
