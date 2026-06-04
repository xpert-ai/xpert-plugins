import { Inject, Injectable, Optional } from '@nestjs/common'
import { IPluginConfigResolver, PLUGIN_CONFIG_RESOLVER_TOKEN, RequestContext } from '@xpert-ai/plugin-sdk'
import {
  ResolvedSalesOntologyPluginConfig,
  SalesOntologyPluginConfig,
  resolveSalesOntologyPluginConfig
} from './sales-ontology.config.js'
import { SALES_ONTOLOGY_PLUGIN_NAME } from './constants.js'
import type {
  SalesOntologyEvidence,
  SalesOntologyActionInput,
  SalesOntologyEntityInput,
  SalesOntologyManifest,
  SalesOntologyRelationInput
} from './types.js'

export type SalesOntologyJsonPrimitive = string | number | boolean | null
export type SalesOntologyJsonValue =
  | SalesOntologyJsonPrimitive
  | SalesOntologyJsonValue[]
  | SalesOntologyJsonObject
export interface SalesOntologyJsonObject {
  [key: string]: SalesOntologyJsonValue
}

export interface SalesOntologyBusinessOntologyPublishRequest {
  manifest: SalesOntologyManifest
  entities?: Array<SalesOntologyEntityInput | SalesOntologyEntityPublishRecord>
  relations?: Array<SalesOntologyRelationInput | SalesOntologyRelationPublishRecord>
  actions?: Array<SalesOntologyActionInput | SalesOntologyActionPublishRecord>
  syncMode?: 'replace_snapshot' | 'merge'
  sourcePlugin?: string
  domainKey?: string
  sourceVersion?: string
}

export interface SalesOntologyEntityPublishRecord extends SalesOntologyEntityInput {
  displayName?: string | null
  evidence?: SalesOntologyJsonObject
  provenance?: SalesOntologyProvenanceRecord[]
}

export interface SalesOntologyRelationPublishRecord extends SalesOntologyRelationInput {
  evidence?: SalesOntologyJsonObject
  provenance?: SalesOntologyProvenanceRecord[]
}

export interface SalesOntologyActionPublishRecord {
  actionTypeCode: string
  actionRef?: string
  target?: SalesOntologyBusinessOntologyEntityRefResponse
  entity?: SalesOntologyBusinessOntologyEntityRefResponse
  status?: string
  payload?: SalesOntologyJsonObject
  result?: SalesOntologyJsonObject
  inputPayload?: SalesOntologyJsonObject
  resultPayload?: SalesOntologyJsonObject
  evidence?: SalesOntologyJsonObject
  provenance?: SalesOntologyEvidence[]
  occurredAt?: string
}

export interface SalesOntologyProvenanceRecord {
  ref?: string
  source?: string
  evidence?: SalesOntologyJsonObject
}

export interface SalesOntologyBusinessOntologyPublishResponse {
  resourceId?: string
  published?: boolean
  skipped?: boolean
  status?: string
  message?: string
  syncMode?: 'replace_snapshot' | 'merge'
  summary?: SalesOntologyBusinessOntologyPublishSummary
  counts?: SalesOntologyBusinessOntologyPublishSummary
  result?: SalesOntologyJsonObject
}

export interface SalesOntologyBusinessOntologyPublishSummary {
  entities?: number
  relations?: number
  actions?: number
  states?: number
  rules?: number
}

export interface SalesOntologyBusinessOntologyQueryEntitiesRequest {
  entityTypeCode?: string
  query?: string
  limit?: number
}

export interface SalesOntologyBusinessOntologyQueryRelationsRequest {
  relationTypeCode?: string
  source?: SalesOntologyBusinessOntologyEntityRefResponse
  target?: SalesOntologyBusinessOntologyEntityRefResponse
  query?: string
  limit?: number
}

export interface SalesOntologyBusinessOntologyEntityRefResponse {
  entityTypeCode?: string
  typeCode?: string
  entityType?: string
  externalKey?: string
  externalId?: string
  external_key?: string
  id?: string
}

export interface SalesOntologyBusinessOntologyEntityRecord extends SalesOntologyBusinessOntologyEntityRefResponse {
  label?: string
  displayName?: string | null
  name?: string
  currentStateCode?: string
  attributes?: SalesOntologyJsonObject
  properties?: SalesOntologyJsonObject
  evidence?: SalesOntologyJsonObject
  provenance?: SalesOntologyEvidence[]
}

export interface SalesOntologyBusinessOntologyRelationRecord {
  id?: string
  relationTypeCode?: string
  relationType?: string
  type?: string
  typeCode?: string
  code?: string
  source?: SalesOntologyBusinessOntologyEntityRefResponse | string
  target?: SalesOntologyBusinessOntologyEntityRefResponse | string
  sourceEntity?: SalesOntologyBusinessOntologyEntityRefResponse
  targetEntity?: SalesOntologyBusinessOntologyEntityRefResponse
  sourceNode?: SalesOntologyBusinessOntologyEntityRefResponse
  targetNode?: SalesOntologyBusinessOntologyEntityRefResponse
  sourceRef?: SalesOntologyBusinessOntologyEntityRefResponse
  targetRef?: SalesOntologyBusinessOntologyEntityRefResponse
  sourceEntityTypeCode?: string
  targetEntityTypeCode?: string
  sourceTypeCode?: string
  targetTypeCode?: string
  sourceEntityType?: string
  targetEntityType?: string
  sourceExternalKey?: string
  targetExternalKey?: string
  sourceExternalId?: string
  targetExternalId?: string
  sourceId?: string
  targetId?: string
  attributes?: SalesOntologyJsonObject
  properties?: SalesOntologyJsonObject
  provenance?: SalesOntologyEvidence[]
}

export interface SalesOntologyBusinessOntologyActionRecord extends Partial<SalesOntologyActionInput> {
  id?: string
  actionName?: string
  status?: string
  attributes?: SalesOntologyJsonObject
}

export interface SalesOntologyBusinessOntologyQueryEntitiesResponse {
  items: SalesOntologyBusinessOntologyEntityRecord[]
  total?: number
  page?: number
  pageSize?: number
}

export interface SalesOntologyBusinessOntologyQueryRelationsResponse {
  items: SalesOntologyBusinessOntologyRelationRecord[]
  total?: number
  page?: number
  pageSize?: number
}

export interface SalesOntologyBusinessOntologyNeighborhoodResponse {
  entity?: SalesOntologyBusinessOntologyEntityRecord
  nodes?: SalesOntologyBusinessOntologyEntityRecord[]
  entities?: SalesOntologyBusinessOntologyEntityRecord[]
  relations?: SalesOntologyBusinessOntologyRelationRecord[]
  edges?: SalesOntologyBusinessOntologyRelationRecord[]
  links?: SalesOntologyBusinessOntologyRelationRecord[]
  actions?: SalesOntologyBusinessOntologyActionRecord[]
  neighborhood?: SalesOntologyBusinessOntologyNeighborhoodSnapshot
}

export interface SalesOntologyBusinessOntologyNeighborhoodSnapshot {
  nodes?: SalesOntologyBusinessOntologyEntityRecord[]
  entities?: SalesOntologyBusinessOntologyEntityRecord[]
  relations?: SalesOntologyBusinessOntologyRelationRecord[]
  edges?: SalesOntologyBusinessOntologyRelationRecord[]
  links?: SalesOntologyBusinessOntologyRelationRecord[]
  actions?: SalesOntologyBusinessOntologyActionRecord[]
}

@Injectable()
export class SalesOntologyClientService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  isConfigured(): boolean {
    return Boolean(this.resolveApiBase())
  }

  defaultResourceId(): string {
    return this.resolveDataXpertConfig().defaultResourceId ?? 'sales-ontology'
  }

  async publish(resourceId: string | undefined, request: SalesOntologyBusinessOntologyPublishRequest): Promise<SalesOntologyBusinessOntologyPublishResponse> {
    return this.requestJson<SalesOntologyBusinessOntologyPublishResponse>(
      'POST',
      `/uose/business-ontology/resources/${encodeURIComponent(resourceId ?? this.defaultResourceId())}/publish`,
      request
    )
  }

  async queryEntities(
    resourceId: string | undefined,
    request: SalesOntologyBusinessOntologyQueryEntitiesRequest
  ): Promise<SalesOntologyBusinessOntologyQueryEntitiesResponse> {
    return this.requestJson<SalesOntologyBusinessOntologyQueryEntitiesResponse>(
      'POST',
      `/uose/business-ontology/resources/${encodeURIComponent(resourceId ?? this.defaultResourceId())}/entities/query`,
      request
    )
  }

  async queryRelations(
    resourceId: string | undefined,
    request: SalesOntologyBusinessOntologyQueryRelationsRequest
  ): Promise<SalesOntologyBusinessOntologyQueryRelationsResponse> {
    return this.requestJson<SalesOntologyBusinessOntologyQueryRelationsResponse>(
      'POST',
      `/uose/business-ontology/resources/${encodeURIComponent(resourceId ?? this.defaultResourceId())}/relations/query`,
      request
    )
  }

  async getNeighborhood(
    resourceId: string | undefined,
    entityTypeCode: string,
    externalKey: string
  ): Promise<SalesOntologyBusinessOntologyNeighborhoodResponse> {
    return this.requestJson<SalesOntologyBusinessOntologyNeighborhoodResponse>(
      'GET',
      `/uose/business-ontology/resources/${encodeURIComponent(resourceId ?? this.defaultResourceId())}/entities/${encodeURIComponent(entityTypeCode)}/${encodeURIComponent(externalKey)}/neighborhood`
    )
  }

  private async requestJson<TResponse extends object>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<TResponse> {
    const config = this.resolveDataXpertConfig()
    const apiBase = this.resolveApiBase(config)
    if (!apiBase) {
      throw new Error('data-xpert API base URL is not configured')
    }

    const token = RequestContext.currentToken()
    if (!token) {
      throw new Error('current OIDC token is not available')
    }

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), config.timeoutMs)
    let response: Response
    try {
      response = await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        signal: abortController.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`data-xpert business ontology request failed with HTTP ${response.status}${text ? `: ${text}` : ''}`)
    }

    const payload = (await response.json().catch(() => ({}))) as unknown
    return isObjectPayload(payload) ? (payload as TResponse) : ({} as TResponse)
  }

  private resolveApiBase(config = this.resolveDataXpertConfig()): string | undefined {
    const raw = config.apiBaseUrl
    if (!raw?.trim()) {
      return undefined
    }
    const normalized = raw.trim().replace(/\/+$/, '')
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`
  }

  private resolveDataXpertConfig(): ResolvedSalesOntologyPluginConfig {
    const pluginConfig =
      this.pluginConfigResolver?.resolve<SalesOntologyPluginConfig>(SALES_ONTOLOGY_PLUGIN_NAME, {
        defaults: {}
      }) ?? {}
    return resolveSalesOntologyPluginConfig(pluginConfig)
  }
}

function isObjectPayload(value: unknown): value is object {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
