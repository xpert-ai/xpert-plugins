import type { AutoOntologyPort, AutoSnapshotInput, AutoTermCertification } from './types.js'

interface HttpOptions {
  baseUrl: string
  token: string
  databaseIds?: string[]
  source?: string
  fetchImpl?: typeof fetch
}

export function createHttpAutoOntologyPort(options: HttpOptions): AutoOntologyPort {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.baseUrl.replace(/\/$/, '')
  const call = async (path: string, init?: RequestInit): Promise<Response> => {
    const response = await fetchImpl(base + path, {
      ...init,
      headers: { 'x-api-key': options.token, ...(init?.headers ?? {}) },
    })
    if (!response.ok) throw new Error('auto_http_' + String(response.status) + ':' + path)
    return response
  }
  return {
    async readSnapshot(): Promise<AutoSnapshotInput> {
      const exported = await call('/api/model/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ databases: options.databaseIds ?? [], format: 'auto_ontology' }),
      })
      const yaml = await exported.text()
      const listed = await call('/api/terms')
      const body = await listed.json() as { data?: AutoTermCertification[] }
      if (!Array.isArray(body.data)) throw new Error('auto_terms_shape')
      return { yaml, terms: body.data, source: options.source, adapterVersion: 'auto-native-v1' }
    },
  }
}
