import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsValue, JSONValue, AnalyticsDiscoveryResult } from '@xpert-ai/contracts'
import { dataXpertDiscoveryRequestSchema, dataXpertQueryContract } from './discovery'
import { dataXpertParameterError, readAnalyticsHttpError } from './diagnostic'
import { dataXpertPayloadSchema } from './payload'
export { dataXpertPayloadSchema } from './payload'
import { importTargetRequest, discoverImportTargets } from './import-targets'
import { createDataXpertDatasetId, createDataXpertOutput, dataXpertResultColumnSchema } from './result-schema'
import {
  ActorTokenRuntimeFactoryCapability, analyticsDiscoveryResultSchema, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

export type DataXpertClientContext = Pick<AnalyticsProviderContext, 'actor' | 'options' | 'signal' | 'deadlineAt' | 'maxRows'>

const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const json: z.ZodType<JSONValue> = z.lazy(() => z.union([scalar, z.array(json), z.record(json)]))
const querySchemaRequestSchema = z.object({
  kind: z.literal('query-schema'), datasetId: z.string().min(1).max(512).optional(),
  payload: dataXpertPayloadSchema, parameters: z.record(scalar).default({})
}).strict()
/** Trusted DataSource configuration; never merge it with payloads, controls or discovery requests. */
const optionsSchema = z.object({
  resourceId: z.string().min(1).max(160).optional(), baseUrl: z.string().url(), audience: z.string().min(1),
  assistantCode: z.string().min(1), assistantXpertId: z.string().uuid(), workspaceId: z.string().uuid()
}).strict()

function assertModel(options: DataXpertClientContext['options'], resourceId:string) {
  if (options.resourceId !== undefined && options.resourceId !== resourceId) throw Error('DATAX_MODEL_UNAVAILABLE')
}

const certificationSchema = z.discriminatedUnion('status', [
  z.object({ kind: z.literal('business_metric'), subjectId: z.string().min(1).max(160),
    verifiedAt: z.string().datetime(), status: z.literal('legacy_unverified') }).strict(),
  z.object({ kind: z.literal('business_metric'), subjectId: z.string().min(1).max(160),
    verifiedAt: z.string().datetime(), status: z.literal('verified'),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    dependency: z.object({ id: z.string().min(1).max(160), version: z.number().int().nonnegative() }).strict(),
    certifiedBy: z.string().min(1).max(160), certifiedAt: z.string().datetime() }).strict()
])

const responseSchema = z.object({
  effect: z.object({ version: z.literal(2), kind: z.enum(['rows', 'series', 'entity']),
    columns: z.array(dataXpertResultColumnSchema),
    rows: z.array(z.record(scalar)),
    summary: z.object({ rowCount: z.number().int().nonnegative(), returnedRowCount: z.number().int().nonnegative(), truncated: z.boolean() }) }),
  fetchedAt: z.string().datetime(), executionId: z.string(), auditRef: z.string(), fromCache: z.literal(false),
  sourceVersion: z.string().min(1).max(256).optional(),
  certification: certificationSchema.optional()
})

@Injectable()
export class DataXpertAnalyticsClient {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  /**
   * Ask Data Xpert to validate disclosure authority using the current human's scoped token.
   * This metadata-only check neither executes the binding nor grants future query access.
   */
  async authorizeGroupSharing(binding: AnalyticsBinding, context: DataXpertClientContext) {
    const payload = dataXpertPayloadSchema.parse(binding.payload)
    assertModel(context.options, payload.resourceId)
    const response = await this.request('authorize-group-sharing', context, {
      binding: {
        id: binding.id,
        resourceId: payload.resourceId,
        actionTypeCode: payload.actionTypeCode,
        target: payload.target,
        params: payload.params
      },
      maxRows: 1
    })
    z.object({ authorized: z.literal(true) })
      .strict()
      .parse(await boundedJson(response))
  }
  async discover(request: JSONValue, context: DataXpertClientContext): Promise<AnalyticsDiscoveryResult> {
    const importing = importTargetRequest.safeParse(request)
    if (importing.success) return discoverImportTargets(importing.data, (browse) => this.discover(browse, context))
    if (request && typeof request === 'object' && !Array.isArray(request) && request.kind === 'query-schema') {
      const parsed = querySchemaRequestSchema.parse(request)
      const datasetId = createDataXpertDatasetId(parsed.payload, parsed.datasetId)
      const result = await this.query(datasetId, parsed.payload, parsed.parameters, context)
      return analyticsDiscoveryResultSchema.parse({
        items: [
          {
            id: datasetId,
            name: datasetId,
            kind: 'dataset',
            metadata: { payload: parsed.payload, output: createDataXpertOutput(datasetId, result.effect.columns) }
          }
        ],
        queryContract: dataXpertQueryContract
      })
    }
    const empty =
      request && typeof request === 'object' && !Array.isArray(request) && Object.keys(request).length === 0
    const parsed = dataXpertDiscoveryRequestSchema.parse(empty ? { kind: 'resources' } : request)
    if (parsed.kind !== 'resources') assertModel(context.options, parsed.resourceId)
    const response = await this.request('discover', context, { request: parsed })
    const result = z
      .object({ items: z.array(z.unknown()), nextRequest: json.optional() })
      .strict()
      .parse(await boundedJson(response))
    const page = analyticsDiscoveryResultSchema.parse({ ...result, queryContract: dataXpertQueryContract })
    if (parsed.kind === 'resources' && context.options.resourceId !== undefined)
      page.items = page.items.filter((item) => item.id === context.options.resourceId)
    return page
  }
  async managementRequest(
    connection: { baseUrl: string; audience: string }, actor: DataXpertClientContext['actor'],
    signal: AbortSignal, path: string, method = 'GET', body?: unknown
  ): Promise<unknown> {
    const base = new URL(connection.baseUrl)
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash ||
        !/^\/[a-z0-9]/.test(path) || path.includes('..')) throw Error('DATAX_URL_INVALID')
    signal.throwIfAborted()
    const session = await this.runtime.require(ActorTokenRuntimeFactoryCapability).createScopedApi(actor)
      .getToken({ audience: connection.audience })
    const res = await fetch(base.href.replace(/\/$/, '') + path, {
      method, signal, redirect: 'error', headers: { authorization: 'Bearer ' + session.token,
        'organization-id': actor.organizationId, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!res.ok) throw Error('DATAX_MANAGEMENT_HTTP_' + res.status)
    return res.status === 204 ? null : boundedJson(res)
  }

  async effectiveSetupIdentity(
    connection: { baseUrl: string; audience: string },
    actor: DataXpertClientContext['actor'],
    signal: AbortSignal,
    prefetchOrganizationReader = false
  ) {
    const token = await this.runtime
      .require(ActorTokenRuntimeFactoryCapability)
      .createScopedApi(actor)
      .getToken({ audience: connection.audience })
    const base = connection.baseUrl.replace(/\/$/, '') + '/assistant-management'
    const readIdentity = async (path: string) => {
      const response = await fetch(base + path, {
        signal,
        redirect: 'error',
        headers: { Authorization: 'Bearer ' + token.token, 'organization-id': actor.organizationId }
      })
      if (response.status === 404 && path.startsWith('/effective/')) throw Error('DATAX_ORGANIZATION_READER_MISSING')
      if (!response.ok) throw Error('DATAX_ORGANIZATION_IDENTITY_UNAVAILABLE')
      return boundedJson(response)
    }
    const identity = z.object({
      configured: z.literal(true),
      tenantId: z.literal(actor.tenantId),
      organizationId: z.literal(actor.organizationId),
      workspaceId: z.string().uuid(),
      xpertId: z.string().uuid()
    })
    const readerCode = 'analytics-reader-' + actor.organizationId
    const readCustom = () => readIdentity('/effective/' + encodeURIComponent(readerCode))
    const prefetched = prefetchOrganizationReader ? Promise.allSettled([readCustom()]) : undefined
    const builtIn = await readIdentity('/ontology/effective')
    const existing = identity.extend({ sourceScope: z.literal('organization') }).safeParse(builtIn)
    if (existing.success)
      return {
        assistantCode: existing.data.xpertId,
        assistantXpertId: existing.data.xpertId,
        workspaceId: existing.data.workspaceId
      }
    if (!z.object({ sourceScope: z.literal('none'), configured: z.literal(false) }).safeParse(builtIn).success)
      throw Error('DATAX_ORGANIZATION_IDENTITY_UNAVAILABLE')
    // Data Xpert assistant codes are unique within a tenant. The organization-specific
    // reader is explicitly provisioned and Data Xpert checks its resource grants on every read.
    const cached = prefetched ? (await prefetched)[0] : undefined
    if (cached?.status === 'rejected') throw cached.reason
    const resolved = cached ? cached.value : await readCustom()
    if (z.object({ configured: z.literal(false) }).safeParse(resolved).success) throw Error('DATAX_ORGANIZATION_READER_MISSING')
    const reader = identity.extend({
      code: z.literal(readerCode),
      scopeType: z.literal('organization'),
      allowed: z.literal(true),
      enabled: z.literal(true),
      resourceIds: z.array(z.string().min(1)).min(1)
    }).safeParse(resolved)
    if (!reader.success) throw Error('DATAX_ORGANIZATION_IDENTITY_UNAVAILABLE')
    return {
      assistantCode: reader.data.code,
      assistantXpertId: reader.data.xpertId,
      workspaceId: reader.data.workspaceId
    }
  }
  previewApplicationQuery(
    key: string,
    payload: z.output<typeof dataXpertPayloadSchema>,
    ctx: DataXpertClientContext
  ) {
    return this.query(key, payload, {}, ctx)
  }
  private async request(
    endpoint: 'query' | 'discover' | 'authorize-group-sharing',
    context: DataXpertClientContext,
    body: Record<string, JSONValue>
  ) {
    context.signal.throwIfAborted()
    const options = optionsSchema.parse(context.options)
    const base = new URL(options.baseUrl)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      throw new Error('DATAX_URL_INVALID')
    const token = await this.runtime
      .require(ActorTokenRuntimeFactoryCapability)
      .createScopedApi(context.actor)
      .getToken({ audience: options.audience })
    context.signal.throwIfAborted()
    const response = await fetch(`${base.href.replace(/\/$/, '')}/agent-workbench/analytics/${endpoint}`, {
      method: 'POST',
      redirect: 'error',
      signal: context.signal,
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'organization-id': context.actor.organizationId
      },
      body: JSON.stringify({
        assistant: {
          code: options.assistantCode,
          xpertId: options.assistantXpertId,
          workspaceId: options.workspaceId
        },
        ...body
      })
    })
    if (!response.ok) {
      const error = await readAnalyticsHttpError(response, context.signal, context.deadlineAt)
      context.signal.throwIfAborted()
      throw error ?? new Error(`DATAX_QUERY_HTTP_${response.status}`)
    }
    return response
  }
  async execute(
    binding: AnalyticsBinding,
    parameters: Record<string, AnalyticsValue>,
    context: DataXpertClientContext
  ): Promise<AnalyticsProviderResult> {
    const payload = dataXpertPayloadSchema.parse(binding.payload)
    const result = await this.query(binding.id, payload, parameters, context)
    return {
      columns: result.effect.columns,
      rows: result.effect.rows,
      completeness: {
        returnedRows: result.effect.summary.returnedRowCount,
        totalRows: result.effect.summary.rowCount,
        totalAccuracy: result.effect.summary.truncated ? 'unknown' : 'exact',
        scope: result.effect.summary.truncated ? 'page' : 'full_query_result',
        truncated: result.effect.summary.truncated
      },
      sourceFetchedAt: result.fetchedAt,
      upstreamExecutionId: result.executionId,
      auditRef: result.auditRef,
      sourceVersion: result.sourceVersion,
      ...(result.certification ? { certification: result.certification } : {})
    }
  }
  private async query(
    id: string,
    payload: z.output<typeof dataXpertPayloadSchema>,
    parameters: Record<string, AnalyticsValue>,
    context: DataXpertClientContext
  ) {
    assertModel(context.options, payload.resourceId)
    const response = await this.request('query', context, {
      binding: {
        id,
        resourceId: payload.resourceId,
        actionTypeCode: payload.actionTypeCode,
        target: payload.target,
        params: bindParameters(payload.params, payload.parameterPaths, parameters)
      },
      maxRows: context.maxRows
    })
    return responseSchema.parse(await boundedJson(response))
  }
}

/** Typed paths replace whole parameter values, never splice text into SQL/MDX/OData. */
export function bindParameters(params: Record<string, JSONValue>, paths: Record<string, string[]>, parameters: Record<string, AnalyticsValue>) {
  const result = structuredClone(params)
  if (Object.keys(parameters).some((name) => !Object.hasOwn(paths, name)) || Object.keys(paths).some((name) => !Object.hasOwn(parameters, name)))
    throw dataXpertParameterError('DATAX_PARAMETER_MAPPING_INVALID')
  if (new Set(Object.values(paths).map((path) => JSON.stringify(path))).size !== Object.keys(paths).length)
    throw dataXpertParameterError('DATAX_PARAMETER_MAPPING_INVALID')
  for (const [name, path] of Object.entries(paths)) {
    let current: JSONValue = result
    for (const [index, key] of path.entries()) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || !current || typeof current !== 'object' || !Object.hasOwn(current, key))
        throw dataXpertParameterError('DATAX_PARAMETER_PATH_INVALID')
      if (Array.isArray(current)) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length) throw dataXpertParameterError('DATAX_PARAMETER_PATH_INVALID')
        const position = Number(key)
        if (index === path.length - 1) {
          if (current[position] !== null && typeof current[position] === 'object') throw dataXpertParameterError('DATAX_PARAMETER_PATH_NOT_SCALAR')
          current[position] = parameters[name]
        } else current = current[position]
      } else if (index === path.length - 1) {
        if (current[key] !== null && typeof current[key] === 'object') throw dataXpertParameterError('DATAX_PARAMETER_PATH_NOT_SCALAR')
        current[key] = parameters[name]
      } else current = current[key]
    }
  }
  return result
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('DATAX_EMPTY_RESPONSE')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 2_500_000) throw new Error('DATAX_RESPONSE_TOO_LARGE')
      chunks.push(chunk.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel() }
}
