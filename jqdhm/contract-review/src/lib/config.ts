import { z } from 'zod/v3'
import { ContractReviewError } from './contracts.js'

export const configSchema = z.object({
  serviceUrl: z.string().url().default('http://127.0.0.1:8097'),
  serviceToken: z.string().optional(),
  timeoutMs: z.number().int().min(100).max(30000).default(10000)
}).strict()
export type ContractReviewConfig = z.input<typeof configSchema>
export type ResolvedContractReviewConfig = z.output<typeof configSchema>
export function resolveConfig(input: unknown, env: NodeJS.ProcessEnv = process.env): ResolvedContractReviewConfig {
  try {
    const config = configSchema.parse(input ?? {})
    const url = new URL(config.serviceUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('invalid service URL')
    }
    const serviceToken = config.serviceToken ?? env.CONTRACT_SERVICE_TOKEN
    if (!serviceToken || !/^[\x21-\x7e]{1,4096}$/.test(serviceToken)) throw new Error('invalid service token')
    return { ...config, serviceUrl: url.origin, serviceToken }
  } catch { throw new ContractReviewError('INVALID_CONFIG') }
}
