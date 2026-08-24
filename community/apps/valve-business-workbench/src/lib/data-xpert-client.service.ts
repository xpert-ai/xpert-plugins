import { Inject, Injectable, Optional } from '@nestjs/common'
import { IPluginConfigResolver, PLUGIN_CONFIG_RESOLVER_TOKEN } from '@xpert-ai/plugin-sdk'
import { VALVE_PLUGIN_NAME } from './constants'
import { resolveValvePluginConfig, type ValvePluginConfig } from './config'
import {
  VALVE_ONTOLOGY_BASE_IRI,
  VALVE_ONTOLOGY_DEFINITION_DESCRIPTION,
  VALVE_ONTOLOGY_DEFINITION_NAME,
  VALVE_ONTOLOGY_MANIFEST,
  VALVE_ONTOLOGY_RESOURCE_ID,
  buildValveOntologyDefinitionDraft,
  type ValveOntologyInitializationResult,
  type ValveOntologyInitializationStatus
} from './domain/valve-ontology'
import type {
  ValveActorScope,
  ValveJsonObject,
  ValveObject360,
  ValveObjectSummary,
  ValveResourceSummary,
  ValveSchemaSummary
} from './types'

interface AgentToolsResource {
  resourceId: string
  resourceStatus: 'active' | 'inactive' | 'error'
  healthStatus: 'ready' | 'pending' | 'publish_failed' | 'projection_failed' | 'missing_snapshot'
  snapshotId?: string | null
  graphVersion?: string | null
  sourceVersion?: string | null
  descriptor: { displayName: string; description?: string | null }
  definitionRef?: { definitionResourceId?: string | null } | null
  updatedAt: string
}

interface AgentToolsSchemaResponse {
  taskId: string
  resourceId: string
  snapshotId: string
  graphVersion: string
  ontologyId: string
  entityTypes: ValveSchemaSummary['entityTypes']
  relationTypes: ValveSchemaSummary['relationTypes']
  affordances: ValveSchemaSummary['actionTypes']
}

interface AgentToolsEntityMatch {
  entityId: string
  entityTypeCode: string
  externalKey: string
  label: string
  score: number
  partitionKey?: string | null
  aliases: string[]
  evidence: ValveJsonObject
  constraintRefs: string[]
  attributes: ValveJsonObject
}

interface AgentToolsNeighborhoodResponse {
  taskId: string
  resourceId: string
  partitionKey?: string | null
  snapshotId: string
  graphVersion: string
  ontologyId: string
  entity: Omit<AgentToolsEntityMatch, 'score' | 'partitionKey'>
  relations: Array<{
    relationId: string
    relationTypeCode: string
    direction: 'outbound' | 'inbound'
    relatedEntityId: string
    relatedEntityTypeCode: string
    relatedEntityExternalKey: string
    relatedEntityLabel: string
    attributes: ValveJsonObject
  }>
  relatedEntities: Array<Omit<AgentToolsEntityMatch, 'score' | 'partitionKey'>>
  affordances: Array<{
    code: string
    name: string
    description?: string
    riskLevel?: string
    requiresApproval?: boolean
    intentTags: string[]
    inputHint?: string
  }>
  constraints: ValveObject360['constraints']
  evidence: ValveJsonObject
}

interface RemoteDefinitionSummary {
  id: string
  resourceId: string
  draftRevision: number
  publishedRevision?: number | null
  currentVersionNo?: number
  updatedAt?: string
  publishedAt?: string | null
}

interface RemoteVersionSummary {
  versionNo: number
  semanticVersion: string
  status: 'publishing' | 'published' | 'failed'
  publishedAt?: string | null
}

interface RemoteResolvedReference {
  definitionId: string
  resourceId: string
  versionNo: number
  semanticVersion: string
}

export interface DataXpertAuditEvent {
  id: string
  requestId: string
  traceId: string
  toolName: string
  status: 'success' | 'failed' | 'partial'
  decisionSummary?: string | null
  evidenceRef: ValveJsonObject
  executedAt: string
}

@Injectable()
export class ValveDataXpertClient {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  getConfig(): ValvePluginConfig {
    const configured = this.pluginConfigResolver?.resolve<ValvePluginConfig>(VALVE_PLUGIN_NAME, { defaults: {} })
    return resolveValvePluginConfig(configured)
  }

  async listResources(scope: ValveActorScope): Promise<ValveResourceSummary[]> {
    const config = this.getConfig()
    if (!config.enabled) return []
    const response = await this.requestJson<{ taskId: string; items: AgentToolsResource[] }>(
      scope,
      'POST',
      '/uose/agent-tools/list-ontology-resources',
      {
        definitionResourceId: config.dataXpert.definitionResourceId,
        healthStatuses: ['ready'],
        limit: 100
      }
    )
    const whitelist = config.dataXpert.resourceIds
    const candidates = response.items.filter(
      (item) =>
        item.resourceStatus === 'active' &&
        item.healthStatus === 'ready' &&
        (!whitelist?.length || whitelist.includes(item.resourceId))
    )
    const inspected = await Promise.all(
      candidates.map(async (resource): Promise<ValveResourceSummary | null> => {
        const schema = await this.querySchemaRaw(scope, resource.resourceId)
        if (!schema.entityTypes.some((item) => item.code === config.dataXpert.rootEntityTypeCode)) return null
        return {
          resourceId: resource.resourceId,
          displayName: resource.descriptor.displayName,
          description: resource.descriptor.description,
          definitionResourceId: resource.definitionRef?.definitionResourceId,
          snapshotId: resource.snapshotId ?? schema.snapshotId,
          graphVersion: resource.graphVersion ?? schema.graphVersion,
          sourceVersion: resource.sourceVersion,
          updatedAt: resource.updatedAt,
          rootEntityTypeCode: config.dataXpert.rootEntityTypeCode
        }
      })
    )
    return inspected.filter((item): item is ValveResourceSummary => item !== null)
  }

  async getOntologyInitializationStatus(scope: ValveActorScope): Promise<ValveOntologyInitializationStatus> {
    const config = this.getConfig()
    if (!config.enabled || !config.dataXpert.apiBaseUrl.trim()) return this.ontologyStatusBase(false, 'unconfigured')
    const current = await this.resolveOntologyReference(scope)
    if (current) {
      return {
        ...this.ontologyStatusBase(true, 'current'),
        definitionId: current.definitionId,
        currentVersionNo: current.versionNo,
        currentSemanticVersion: current.semanticVersion,
        versionStatus: 'published'
      }
    }
    const existing = await this.findOntologyDefinition(scope)
    if (!existing) return this.ontologyStatusBase(true, 'missing')
    const versions = await this.listOntologyDefinitionVersions(scope, existing.id)
    const target = versions.items.find((item) => item.semanticVersion === VALVE_ONTOLOGY_MANIFEST.version.semanticVersion)
    if (target?.status === 'publishing' || target?.status === 'failed') {
      return this.ontologyStatusFromDefinition(existing, target, target.status)
    }
    const latest = versions.items.find((item) => item.status === 'published')
    return this.ontologyStatusFromDefinition(existing, latest, latest ? 'outdated' : 'draft')
  }

  async initializeOntology(
    scope: ValveActorScope,
    input: { confirmOverwrite: boolean }
  ): Promise<ValveOntologyInitializationResult> {
    const current = await this.resolveOntologyReference(scope)
    if (current) {
      return {
        changed: false,
        operation: 'already_current',
        status: await this.getOntologyInitializationStatus(scope),
        definitionId: current.definitionId,
        versionNo: current.versionNo,
        semanticVersion: current.semanticVersion,
        snapshotId: '',
        graphVersion: '',
        ontologyId: ''
      }
    }

    const existing = await this.findOntologyDefinition(scope)
    if (existing && !input.confirmOverwrite) throw new Error('VALVE_ONTOLOGY_DRAFT_OVERWRITE_CONFIRMATION_REQUIRED')
    if (existing) {
      const versions = await this.listOntologyDefinitionVersions(scope, existing.id)
      const duplicate = versions.items.find((item) => item.semanticVersion === VALVE_ONTOLOGY_MANIFEST.version.semanticVersion)
      if (duplicate) throw new Error(`VALVE_ONTOLOGY_VERSION_ALREADY_EXISTS:${duplicate.semanticVersion}:${duplicate.status}`)
    }

    const definition =
      existing ??
      (await this.requestJson<RemoteDefinitionSummary>(scope, 'POST', '/uose/ontology-definitions', {
        resourceId: VALVE_ONTOLOGY_RESOURCE_ID,
        name: VALVE_ONTOLOGY_DEFINITION_NAME,
        description: VALVE_ONTOLOGY_DEFINITION_DESCRIPTION,
        templateKey: 'blank'
      }))
    const updated = await this.requestJson<RemoteDefinitionSummary>(
      scope,
      'PUT',
      `/uose/ontology-definitions/${encodeURIComponent(definition.id)}/draft`,
      {
        expectedRevision: definition.draftRevision,
        name: VALVE_ONTOLOGY_DEFINITION_NAME,
        description: VALVE_ONTOLOGY_DEFINITION_DESCRIPTION,
        draft: buildValveOntologyDefinitionDraft()
      }
    )
    const validation = await this.requestJson<{
      valid: boolean
      issues?: Array<{ code?: string; severity: 'error' | 'warning'; path?: string; message: string }>
    }>(scope, 'POST', `/uose/ontology-definitions/${encodeURIComponent(definition.id)}/validate`)
    if (!validation.valid) {
      const details = (validation.issues ?? [])
        .filter((item) => item.severity === 'error')
        .slice(0, 3)
        .map((item) => `${item.code ?? 'VALIDATION_ERROR'}@${item.path ?? '$'}`)
        .join(',')
      throw new Error(`VALVE_ONTOLOGY_VALIDATION_FAILED${details ? `:${details}` : ''}`)
    }
    const published = await this.requestJson<{
      definition: RemoteDefinitionSummary
      version: RemoteVersionSummary
      snapshot: { snapshotId: string; graphVersion: string; ontologyId: string }
    }>(scope, 'POST', `/uose/ontology-definitions/${encodeURIComponent(definition.id)}/publish`, {
      expectedRevision: updated.draftRevision,
      semanticVersion: VALVE_ONTOLOGY_MANIFEST.version.semanticVersion,
      releaseNotes: VALVE_ONTOLOGY_MANIFEST.version.notes
    })
    return {
      changed: true,
      operation: existing ? 'updated_and_published' : 'created_and_published',
      status: this.ontologyStatusFromDefinition(published.definition, published.version, 'current'),
      definitionId: published.definition.id,
      versionNo: published.version.versionNo,
      semanticVersion: published.version.semanticVersion,
      snapshotId: published.snapshot.snapshotId,
      graphVersion: published.snapshot.graphVersion,
      ontologyId: published.snapshot.ontologyId
    }
  }

  async getSchema(scope: ValveActorScope, resourceId: string): Promise<ValveSchemaSummary> {
    await this.assertReadyResource(scope, resourceId)
    return this.toSchemaSummary(await this.querySchemaRaw(scope, resourceId))
  }

  async searchObjects(
    scope: ValveActorScope,
    input: { resourceId: string; entityTypeCode?: string; query?: string; partitionKey?: string; limit?: number }
  ): Promise<{ taskId: string; resourceId: string; snapshotId?: string | null; graphVersion?: string | null; items: ValveObjectSummary[] }> {
    const schema = await this.getSchema(scope, input.resourceId)
    const entityTypeCode = input.entityTypeCode ?? schema.rootEntityTypeCode
    if (!schema.entityTypes.some((item) => item.code === entityTypeCode)) {
      throw new Error(`UNKNOWN_ENTITY_TYPE:${entityTypeCode}`)
    }
    const configuredLimit = this.getConfig().dataXpert.resultLimit
    const limit = Math.min(input.limit ?? configuredLimit, 100)
    const response = await this.requestJson<{
      taskId: string
      resourceId: string
      snapshotId?: string | null
      graphVersion?: string | null
      partitionKey?: string | null
      items: AgentToolsEntityMatch[]
    }>(scope, 'POST', '/uose/agent-tools/query-entities', {
      resourceId: input.resourceId,
      intent: 'Browse valve engineering objects in the governed workbench',
      scope: {
        entityTypeCode,
        query: input.query,
        partitionKey: input.partitionKey,
        limit
      }
    })
    return {
      taskId: response.taskId,
      resourceId: response.resourceId,
      snapshotId: response.snapshotId,
      graphVersion: response.graphVersion,
      items: response.items.map((item) => ({
        entityId: item.entityId,
        entityTypeCode: item.entityTypeCode,
        externalKey: item.externalKey,
        label: item.label,
        score: item.score,
        snapshotId: response.snapshotId,
        graphVersion: response.graphVersion,
        partitionKey: item.partitionKey ?? response.partitionKey,
        attributes: item.attributes,
        constraintRefs: item.constraintRefs,
        evidence: item.evidence
      }))
    }
  }

  async getObject360(
    scope: ValveActorScope,
    input: {
      resourceId: string
      partitionKey?: string
      target: { entityId?: string; entityTypeCode?: string; entityRef?: string }
    }
  ): Promise<ValveObject360> {
    await this.assertReadyResource(scope, input.resourceId)
    const response = await this.requestJson<AgentToolsNeighborhoodResponse>(
      scope,
      'POST',
      '/uose/agent-tools/get-entity-neighborhood',
      input
    )
    const grouped = new Map<string, ValveObject360['relationGroups'][number]>()
    for (const relation of response.relations) {
      const key = `${relation.relationTypeCode}:${relation.direction}`
      const group = grouped.get(key) ?? {
        relationTypeCode: relation.relationTypeCode,
        direction: relation.direction,
        items: []
      }
      group.items.push({
        relationId: relation.relationId,
        relatedEntityId: relation.relatedEntityId,
        relatedEntityTypeCode: relation.relatedEntityTypeCode,
        relatedEntityExternalKey: relation.relatedEntityExternalKey,
        relatedEntityLabel: relation.relatedEntityLabel,
        attributes: relation.attributes
      })
      grouped.set(key, group)
    }
    return {
      resourceId: response.resourceId,
      snapshotId: response.snapshotId,
      graphVersion: response.graphVersion,
      ontologyId: response.ontologyId,
      partitionKey: response.partitionKey,
      entity: {
        entityId: response.entity.entityId,
        entityTypeCode: response.entity.entityTypeCode,
        externalKey: response.entity.externalKey,
        label: response.entity.label,
        attributes: response.entity.attributes,
        constraintRefs: response.entity.constraintRefs,
        evidence: response.entity.evidence
      },
      relationGroups: [...grouped.values()],
      relatedObjects: response.relatedEntities.map((item) => ({
        entityId: item.entityId,
        entityTypeCode: item.entityTypeCode,
        externalKey: item.externalKey,
        label: item.label,
        attributes: item.attributes,
        constraintRefs: item.constraintRefs,
        evidence: item.evidence
      })),
      constraints: response.constraints,
      evidence: response.evidence,
      availableActions: response.affordances
    }
  }

  async getAuditTrace(scope: ValveActorScope, taskId: string): Promise<DataXpertAuditEvent[]> {
    const response = await this.requestJson<{ taskId: string; events: DataXpertAuditEvent[] }>(
      scope,
      'GET',
      `/uose/agent-tools/audit-trace/${encodeURIComponent(taskId)}`
    )
    return response.events
  }

  private async assertReadyResource(scope: ValveActorScope, resourceId: string) {
    const config = this.getConfig()
    if (config.dataXpert.resourceIds?.length && !config.dataXpert.resourceIds.includes(resourceId)) {
      throw new Error('RESOURCE_NOT_ALLOWED')
    }
    const resources = await this.listReadyResourcesRaw(scope)
    if (!resources.some((item) => item.resourceId === resourceId)) throw new Error('RESOURCE_NOT_READY')
    const schema = await this.querySchemaRaw(scope, resourceId)
    if (!schema.entityTypes.some((item) => item.code === config.dataXpert.rootEntityTypeCode)) {
      throw new Error(`ROOT_ENTITY_TYPE_MISSING:${config.dataXpert.rootEntityTypeCode}`)
    }
  }

  private async listReadyResourcesRaw(scope: ValveActorScope) {
    const config = this.getConfig()
    const response = await this.requestJson<{ taskId: string; items: AgentToolsResource[] }>(
      scope,
      'POST',
      '/uose/agent-tools/list-ontology-resources',
      {
        definitionResourceId: config.dataXpert.definitionResourceId,
        healthStatuses: ['ready'],
        limit: 100
      }
    )
    return response.items.filter((item) => item.healthStatus === 'ready' && item.resourceStatus === 'active')
  }

  private querySchemaRaw(scope: ValveActorScope, resourceId: string) {
    return this.requestJson<AgentToolsSchemaResponse>(scope, 'POST', '/uose/agent-tools/query-ontology-schema', {
      resourceId
    })
  }

  private toSchemaSummary(response: AgentToolsSchemaResponse): ValveSchemaSummary {
    return {
      resourceId: response.resourceId,
      snapshotId: response.snapshotId,
      graphVersion: response.graphVersion,
      ontologyId: response.ontologyId,
      rootEntityTypeCode: this.getConfig().dataXpert.rootEntityTypeCode,
      entityTypes: response.entityTypes,
      relationTypes: response.relationTypes,
      actionTypes: response.affordances
    }
  }

  private async resolveOntologyReference(scope: ValveActorScope): Promise<RemoteResolvedReference | undefined> {
    const query = new URLSearchParams({
      resourceId: VALVE_ONTOLOGY_RESOURCE_ID,
      semanticVersion: VALVE_ONTOLOGY_MANIFEST.version.semanticVersion
    })
    return this.requestOptionalJson<RemoteResolvedReference>(
      scope,
      'GET',
      `/uose/ontology-definitions/resolve-reference?${query}`
    )
  }

  private async findOntologyDefinition(scope: ValveActorScope): Promise<RemoteDefinitionSummary | undefined> {
    const query = new URLSearchParams({ query: VALVE_ONTOLOGY_RESOURCE_ID })
    const list = await this.requestJson<{ items: RemoteDefinitionSummary[] }>(
      scope,
      'GET',
      `/uose/ontology-definitions?${query}`
    )
    return list.items.find((item) => item.resourceId === VALVE_ONTOLOGY_RESOURCE_ID)
  }

  private listOntologyDefinitionVersions(scope: ValveActorScope, definitionId: string) {
    return this.requestJson<{ items: RemoteVersionSummary[] }>(
      scope,
      'GET',
      `/uose/ontology-definitions/${encodeURIComponent(definitionId)}/versions`
    )
  }

  private ontologyStatusBase(
    apiConfigured: boolean,
    state: ValveOntologyInitializationStatus['state']
  ): ValveOntologyInitializationStatus {
    const draft = buildValveOntologyDefinitionDraft()
    return {
      apiConfigured,
      state,
      resourceId: VALVE_ONTOLOGY_RESOURCE_ID,
      semanticVersion: VALVE_ONTOLOGY_MANIFEST.version.semanticVersion,
      baseIri: VALVE_ONTOLOGY_BASE_IRI,
      counts: {
        entityTypes: draft.entityTypes.length,
        relationTypes: draft.relationTypes.length,
        actionTypes: draft.actionTypes.length,
        instances: draft.instances.length,
        relations: draft.relations.length
      }
    }
  }

  private ontologyStatusFromDefinition(
    definition: RemoteDefinitionSummary,
    version: RemoteVersionSummary | undefined,
    state: ValveOntologyInitializationStatus['state']
  ): ValveOntologyInitializationStatus {
    return {
      ...this.ontologyStatusBase(true, state),
      definitionId: definition.id,
      draftRevision: definition.draftRevision,
      publishedRevision: definition.publishedRevision,
      currentVersionNo: definition.currentVersionNo,
      currentSemanticVersion: version?.semanticVersion,
      versionStatus: version?.status,
      updatedAt: definition.updatedAt,
      publishedAt: version?.publishedAt ?? definition.publishedAt
    }
  }

  private requestOptionalJson<T>(
    scope: ValveActorScope,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown
  ): Promise<T | undefined> {
    return this.request<T>(scope, method, path, body, true)
  }

  private requestJson<T>(
    scope: ValveActorScope,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown
  ): Promise<T> {
    return this.request<T>(scope, method, path, body, false) as Promise<T>
  }

  private async request<T>(
    scope: ValveActorScope,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    allowNotFound: boolean
  ): Promise<T | undefined> {
    if (!scope.organizationId) throw new Error('ORGANIZATION_REQUIRED')
    const config = this.getConfig()
    const token = (await scope.actorTokenProvider?.())?.trim()
    if (!token) throw new Error('ACTOR_TOKEN_REQUIRED')
    const base = config.dataXpert.apiBaseUrl.trim().replace(/\/+$/, '')
    const apiBase = base.endsWith('/api') ? base : `${base}/api`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.dataXpert.timeoutMs)
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'organization-id': scope.organizationId,
          ...(scope.tenantId ? { 'tenant-id': scope.tenantId } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      })
      if (allowNotFound && response.status === 404) return undefined
      if (!response.ok) throw new Error(`DATA_XPERT_HTTP_${response.status}`)
      return (await response.json()) as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('DATA_XPERT_TIMEOUT')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}
