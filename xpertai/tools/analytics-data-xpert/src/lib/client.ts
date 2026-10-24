import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue, AnalyticsDiscoveryResult } from '@xpert-ai/contracts'
import { dataXpertDiscoveryRequestSchema, dataXpertQueryContract } from './discovery'
import {
  ActorTokenRuntimeFactoryCapability, analyticsDiscoveryResultSchema, AnalyticsProvider, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

export type DataXpertClientContext = Pick<AnalyticsProviderContext, 'actor' | 'options' | 'signal' | 'deadlineAt' | 'maxRows'>

const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const json: z.ZodType<JSONValue> = z.lazy(() => z.union([scalar, z.array(json), z.record(json)]))
/** Native Action arguments stay plugin-owned; the host only interprets Dataset/Binding. */
export const dataXpertPayloadSchema = z.object({
  resourceId: z.string().min(1).max(160), actionTypeCode: z.string().min(1).max(160),
  target: z.object({
    entityId: z.string().trim().min(1).max(256).optional(),
    entityTypeCode: z.string().trim().min(1).max(256).optional(),
    entityRef: z.string().trim().min(1).max(512).optional()
  }).strict().refine(target => Boolean(target.entityId || target.entityRef), 'Target reference is required'),
  params: z.record(json),
  parameterPaths: z.record(z.array(z.string().min(1)).min(1).max(8)).default({})
}).strict()
/** Trusted DataSource configuration; never merge it with payloads, controls or discovery requests. */
const optionsSchema = z.object({
  baseUrl: z.string().url(), audience: z.string().min(1),
  assistantCode: z.string().min(1), assistantXpertId: z.string().uuid(), workspaceId: z.string().uuid()
}).strict()
const responseSchema = z.object({
  effect: z.object({ version: z.literal(2), kind: z.enum(['rows', 'series', 'entity']),
    columns: z.array(z.object({ key: z.string(), semanticRef: z.string().optional() })),
    rows: z.array(z.record(scalar)),
    summary: z.object({ rowCount: z.number().int().nonnegative(), returnedRowCount: z.number().int().nonnegative(), truncated: z.boolean() }) }),
  fetchedAt: z.string().datetime(), executionId: z.string(), auditRef: z.string(), fromCache: z.literal(false)
})

@Injectable()
export class DataXpertAnalyticsClient {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async discover(request: JSONValue, context: DataXpertClientContext): Promise<AnalyticsDiscoveryResult> {
    const empty = request && typeof request === 'object' && !Array.isArray(request) && Object.keys(request).length === 0
    const parsed = dataXpertDiscoveryRequestSchema.parse(empty ? { kind: 'resources' } : request)
    const response = await this.request('discover', context, { request: parsed })
    const result = z.object({ items: z.array(z.unknown()),
      nextRequest: json.optional() }).strict().parse(await boundedJson(response))
    return analyticsDiscoveryResultSchema.parse({ ...result,  queryContract: dataXpertQueryContract })
  }
  private async request(endpoint: 'query' | 'discover', context: DataXpertClientContext, body: Record<string, JSONValue>) {
    context.signal.throwIfAborted()
    const options = optionsSchema.parse(context.options)
    const base = new URL(options.baseUrl)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('DATAX_URL_INVALID')
    const token = await this.runtime.require(ActorTokenRuntimeFactoryCapability).createScopedApi(context.actor).getToken({ audience: options.audience })
    context.signal.throwIfAborted()
    const response = await fetch(`${base.href.replace(/\/$/, '')}/agent-workbench/analytics/${endpoint}`, {
      method: 'POST', redirect: 'error', signal: context.signal,
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json', 'organization-id': context.actor.organizationId },
      body: JSON.stringify({ assistant: { code: options.assistantCode, xpertId: options.assistantXpertId, workspaceId: options.workspaceId }, ...body })
    })
    if (!response.ok) {
      // Do not retain an unconsumed upstream error stream or expose its potentially sensitive body.
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`DATAX_QUERY_HTTP_${response.status}`)
    }
    return response
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: DataXpertClientContext): Promise<AnalyticsProviderResult> {
    const payload = dataXpertPayloadSchema.parse(binding.payload)
    const response = await this.request('query', context, {
      binding: { id: binding.id, resourceId: payload.resourceId, actionTypeCode: payload.actionTypeCode, target: payload.target,
        params: bindParameters(payload.params, payload.parameterPaths, parameters) }, maxRows: context.maxRows })
    const result = responseSchema.parse(await boundedJson(response))
    return { columns: result.effect.columns, rows: result.effect.rows,
      completeness: { returnedRows: result.effect.summary.returnedRowCount, totalRows: result.effect.summary.rowCount,
        totalAccuracy: result.effect.summary.truncated ? 'unknown' : 'exact', scope: result.effect.summary.truncated ? 'page' : 'full_query_result',
        truncated: result.effect.summary.truncated }, sourceFetchedAt: result.fetchedAt,
      upstreamExecutionId: result.executionId, auditRef: result.auditRef }
  }
}

/** Typed paths replace whole parameter values, never splice text into SQL/MDX/OData. */
export function bindParameters(params: Record<string, JSONValue>, paths: Record<string, string[]>, parameters: Record<string, AnalyticsValue>) {
  const result = structuredClone(params)
  if (Object.keys(parameters).some((name) => !Object.hasOwn(paths, name)) || Object.keys(paths).some((name) => !Object.hasOwn(parameters, name)))
    throw new Error('DATAX_PARAMETER_MAPPING_INVALID')
  if (new Set(Object.values(paths).map((path) => JSON.stringify(path))).size !== Object.keys(paths).length)
    throw new Error('DATAX_PARAMETER_MAPPING_INVALID')
  for (const [name, path] of Object.entries(paths)) {
    let current: JSONValue = result
    for (const [index, key] of path.entries()) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || !current || typeof current !== 'object' || !Object.hasOwn(current, key))
        throw new BadRequestException('DATAX_PARAMETER_PATH_INVALID: parameterPaths are relative to params. Omit the leading params segment and target an existing scalar, for example ["slicers","1","value"].')
      if (Array.isArray(current)) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length) throw new Error('DATAX_PARAMETER_PATH_INVALID')
        const position = Number(key)
        if (index === path.length - 1) {
          if (current[position] !== null && typeof current[position] === 'object') throw new Error('DATAX_PARAMETER_PATH_NOT_SCALAR')
          current[position] = parameters[name]
        } else current = current[position]
      } else if (index === path.length - 1) {
        if (current[key] !== null && typeof current[key] === 'object') throw new Error('DATAX_PARAMETER_PATH_NOT_SCALAR')
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
