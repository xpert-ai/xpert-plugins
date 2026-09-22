import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import { CONTRACT_REVIEW_CONFIG } from './constants.js'
import { resolveConfig, type ContractReviewConfig, type ResolvedContractReviewConfig } from './config.js'
import { validateScope, type ContractScope } from './scope.js'
import { candidatesSchema, intakeSchema, confirmSchema, contractSchema, createSchema, idInputSchema, listSchema, summarySchema, updateSchema, ContractReviewError } from './contracts.js'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
@Injectable()
export class ContractServiceClient {
  private readonly getConfig: () => ContractReviewConfig | undefined
  constructor(@Inject(CONTRACT_REVIEW_CONFIG) config: ContractReviewConfig | (() => ContractReviewConfig | undefined) | undefined) {
    this.getConfig = typeof config === 'function' ? config : () => config
  }

  async create(scope: ContractScope, input: unknown) {
    return this.request(scope, 'POST', '', contractSchema, createSchema.parse(input))
  }
  async intake(scope: ContractScope, input: unknown) {
    return this.request(scope, 'POST', '/intake', contractSchema, intakeSchema.parse(input))
  }
  async candidates(scope: ContractScope, input: unknown) {
    const { contractId, ...body } = candidatesSchema.parse(input)
    return this.request(scope, 'POST', `/${contractId}/candidates`, contractSchema, body)
  }
  async list(scope: ContractScope) { return this.request(scope, 'GET', '', listSchema) }
  async get(scope: ContractScope, input: unknown) {
    const { contractId } = idInputSchema.parse(input)
    return this.request(scope, 'GET', `/${contractId}`, contractSchema)
  }
  async update(scope: ContractScope, input: unknown) {
    const { contractId, ...body } = updateSchema.parse(input)
    return this.request(scope, 'PUT', `/${contractId}`, contractSchema, body)
  }
  async confirm(scope: ContractScope, input: unknown) {
    const { contractId, ...body } = confirmSchema.parse(input)
    return this.request(scope, 'POST', `/${contractId}/confirm`, contractSchema, body)
  }
  async summary(scope: ContractScope, input: unknown) {
    const { contractId } = idInputSchema.parse(input)
    return this.request(scope, 'GET', `/${contractId}/summary`, summarySchema)
  }
  private async request<T>(inputScope: ContractScope, method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const scope = validateScope(inputScope)
    // Credentials are deliberately resolved on first use so the plugin can load in
    // a host before its server-side secret is configured. They never reach metadata or UI.
    const config = resolveConfig(this.getConfig())
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      // Node fetch redirect:error prevents forwarding service credentials to a redirect target.
      // https://nodejs.org/docs/latest-v22.x/api/globals.html#fetch
      const response = await fetch(`${config.serviceUrl}/api/contracts${path}`, {
        method, redirect: 'error', signal: controller.signal,
        headers: {
          authorization: `Bearer ${config.serviceToken}`,
          accept: 'application/json', 'content-type': 'application/json',
          'x-tenant-id': scope.tenantId, 'x-organization-id': scope.organizationId,
          'x-user-id': scope.userId, 'x-assistant-id': scope.assistantId
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      if (!response.ok) {
        await response.body?.cancel()
        const code = ({ 400: 'INVALID_INPUT', 401: 'UNAUTHORIZED', 403: 'UNAUTHORIZED', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_FAILED' } as Record<number, string>)[response.status]
        throw new ContractReviewError(code ?? 'SERVICE_UNAVAILABLE')
      }
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) {
        await response.body?.cancel()
        throw new ContractReviewError('INVALID_RESPONSE')
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new ContractReviewError('INVALID_RESPONSE') }
        chunks.push(value)
      }
      let data: unknown
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ContractReviewError('INVALID_RESPONSE') }
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new ContractReviewError('INVALID_RESPONSE')
      return parsed.data
    } catch (error) {
      if (controller.signal.aborted) throw new ContractReviewError('SERVICE_TIMEOUT')
      if (error instanceof ContractReviewError) throw error
      throw new ContractReviewError('SERVICE_UNAVAILABLE')
    } finally { clearTimeout(timer) }
  }
}
