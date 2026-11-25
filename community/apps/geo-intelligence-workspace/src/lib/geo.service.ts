import { Injectable } from '@nestjs/common'

export class GeoRequestError extends Error {
  constructor(readonly status: number, readonly detail: string) { super(detail) }
}

export interface GeoRun {
  run_id: string
  query: string
  brand: string
  aliases?: string[]
  competitors?: string[]
  model: string
  raw_answer: string
  status: string
  suggestion: string
  evidence_ids: string[]
  metrics: {
    brand_mentioned: boolean
    competitor_mentions: string[]
    brand_evidence: string | null
    citations_available: boolean
    citation_urls: string[]
  }
  retry_of: string | null
  error_code: string | null
}

@Injectable()
export class GeoEngineClient {
  assertScope(context: { tenantId?: string | null; organizationId?: string | null }) {
    const tenant = process.env['GEO_TENANT_ID']
    const organization = process.env['GEO_ORGANIZATION_ID']
    if (!tenant || !organization || tenant !== context.tenantId || organization !== context.organizationId) {
      throw new Error('GEO organization binding is missing or does not match')
    }
  }
  private readonly baseUrl = (process.env['GEO_ENGINE_URL'] || 'http://host.docker.internal:8765').replace(/\/$/, '')
  private readonly token = process.env['GEO_INTERNAL_TOKEN'] || ''

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.token) throw new Error('GEO_INTERNAL_TOKEN is not configured for the Xpert plugin')
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-GEO-TOKEN': this.token, ...init?.headers },
      signal: AbortSignal.timeout(120000)
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { detail?: unknown }
      throw new GeoRequestError(response.status, typeof body.detail === 'string' ? body.detail : 'Invalid request')
    }
    return (await response.json()) as T
  }

  listPrompts(): Promise<Record<string, unknown>[]> { return this.request('/prompts') }

  savePrompt(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('/prompts', { method: 'POST', body: JSON.stringify(input) })
  }

  listRuns(): Promise<GeoRun[]> {
    return this.request<GeoRun[]>('/runs')
  }

  getRun(runId: string): Promise<GeoRun> {
    return this.request<GeoRun>(`/runs/${encodeURIComponent(runId)}`)
  }

  monitor(input: { query: string; brand: { name: string; aliases?: string[]; competitors?: string[] }; run_id?: string; retry_of?: string }): Promise<GeoRun> {
    return this.request<GeoRun>('/monitor', { method: 'POST', body: JSON.stringify(input) })
  }

  saveContent(input: { run_id: string; text: string; actor: string; evidence_ids: string[]; previous_version_id?: string }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/content', { method: 'POST', body: JSON.stringify(input) })
  }

  approveContent(contentId: string, reviewer: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/content/${encodeURIComponent(contentId)}/approve`, {
      method: 'POST', body: JSON.stringify({ reviewer })
    })
  }

  listContent(runId: string): Promise<Record<string, unknown>[]> {
    return this.request<Record<string, unknown>[]>(`/runs/${encodeURIComponent(runId)}/content`)
  }
}
