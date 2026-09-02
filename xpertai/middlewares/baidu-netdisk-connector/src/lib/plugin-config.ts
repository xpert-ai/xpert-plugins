import { Inject, Injectable } from '@nestjs/common'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'
import {
  BAIDU_NETDISK_API_ORIGIN,
  BAIDU_NETDISK_AUTHORIZE_URL,
  BAIDU_NETDISK_PLUGIN_CONFIG_TOKEN,
  BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES,
  BAIDU_NETDISK_DEFAULT_SCOPES,
  BAIDU_NETDISK_DEFAULT_TIMEOUT_MS,
  BAIDU_NETDISK_MAX_PAGE_SIZE,
  BAIDU_NETDISK_TOKEN_URL,
  BAIDU_NETDISK_UPLOAD_ORIGIN
} from './constants.js'
import { BaiduNetdiskConnectorError } from './errors.js'

const url = (value: string, allowedHosts: string[]) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') throw new Error('HTTPS is required')
    if (!allowedHosts.includes(parsed.hostname)) throw new Error('Unexpected host')
    return value
  } catch {
    throw new BaiduNetdiskConnectorError(
      'CONFIGURATION_INVALID',
      `URL must be an approved HTTPS endpoint (${allowedHosts.join(', ')}).`
    )
  }
}

const scope = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const BaiduNetdiskOAuthConfigSchema = z
  .object({
    appKey: z.string().trim().min(1).max(256),
    secretKey: z.string().min(1).max(1_024),
    authorizationUrl: z.string().url().default(BAIDU_NETDISK_AUTHORIZE_URL),
    tokenUrl: z.string().url().default(BAIDU_NETDISK_TOKEN_URL),
    apiBaseUrl: z.string().url().default(BAIDU_NETDISK_API_ORIGIN),
    uploadBaseUrl: z.string().url().default(BAIDU_NETDISK_UPLOAD_ORIGIN),
    scopes: z
      .array(scope)
      .min(1)
      .max(8)
      .default([...BAIDU_NETDISK_DEFAULT_SCOPES]),
    timeoutMs: z.number().int().min(1_000).max(60_000).default(BAIDU_NETDISK_DEFAULT_TIMEOUT_MS),
    responseMaxBytes: z
      .number()
      .int()
      .min(1_024)
      .max(16 * 1024 * 1024)
      .default(BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES)
  })
  .strict()

/** Credentials owned by a tenant System Integration. */
export const BaiduNetdiskOAuthIntegrationOptionsSchema = z
  .object({
    appKey: z.string().trim().min(1).max(256),
    secretKey: z.string().min(1).max(1_024),
    scopes: z
      .array(scope)
      .min(1)
      .max(8)
      .default([...BAIDU_NETDISK_DEFAULT_SCOPES])
  })
  .strict()

export const BaiduNetdiskPathPolicySchema = z
  .object({
    mode: z.enum(['app_folder', 'authorized_root']).default('app_folder'),
    appFolder: z.string().trim().min(1).max(512).default('/apps/xpert'),
    allowOutsideAppFolder: z.boolean().default(false)
  })
  .strict()

export const BaiduNetdiskCapabilitiesSchema = z
  .object({
    uploadWorkspaceFile: z.boolean().default(true),
    uploadText: z.boolean().default(true),
    semanticSearch: z.boolean().default(true),
    delete: z.boolean().default(false)
  })
  .strict()

export const BaiduNetdiskLimitsSchema = z
  .object({
    maxPageSize: z.number().int().min(1).max(BAIDU_NETDISK_MAX_PAGE_SIZE).default(BAIDU_NETDISK_MAX_PAGE_SIZE),
    maxBatchSize: z.number().int().min(1).max(100).default(50),
    maxUploadBytes: z
      .number()
      .int()
      .positive()
      .max(1024 * 1024 * 1024)
      .default(100 * 1024 * 1024)
  })
  .strict()

export const BaiduNetdiskPluginConfigSchema = z
  .object({
    pathPolicy: BaiduNetdiskPathPolicySchema.default({}),
    capabilities: BaiduNetdiskCapabilitiesSchema.default({}),
    limits: BaiduNetdiskLimitsSchema.default({})
  })
  .strict()

export type BaiduNetdiskOAuthConfig = z.infer<typeof BaiduNetdiskOAuthConfigSchema>
export type BaiduNetdiskOAuthIntegrationOptions = z.infer<typeof BaiduNetdiskOAuthIntegrationOptionsSchema>
export type BaiduNetdiskPathPolicy = z.infer<typeof BaiduNetdiskPathPolicySchema>
export type BaiduNetdiskCapabilities = z.infer<typeof BaiduNetdiskCapabilitiesSchema>
export type BaiduNetdiskLimits = z.infer<typeof BaiduNetdiskLimitsSchema>
export type BaiduNetdiskPluginConfig = z.infer<typeof BaiduNetdiskPluginConfigSchema>

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export const BaiduNetdiskPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    pathPolicy: {
      type: 'object',
      title: text('Path policy', '路径策略'),
      properties: {
        mode: { type: 'string', enum: ['app_folder', 'authorized_root'], default: 'app_folder' },
        appFolder: { type: 'string', title: text('App folder', '应用目录'), default: '/apps/xpert' },
        allowOutsideAppFolder: { type: 'boolean', default: false }
      }
    },
    capabilities: {
      type: 'object',
      title: text('Capabilities', '能力开关'),
      properties: {
        uploadWorkspaceFile: { type: 'boolean', default: true },
        uploadText: { type: 'boolean', default: true },
        semanticSearch: { type: 'boolean', default: true },
        delete: { type: 'boolean', default: false }
      }
    },
    limits: {
      type: 'object',
      title: text('Operation limits', '操作限额'),
      properties: {
        maxPageSize: {
          type: 'number',
          minimum: 1,
          maximum: BAIDU_NETDISK_MAX_PAGE_SIZE,
          default: BAIDU_NETDISK_MAX_PAGE_SIZE
        },
        maxBatchSize: { type: 'number', minimum: 1, maximum: 100, default: 50 },
        maxUploadBytes: { type: 'number', minimum: 1, maximum: 1024 * 1024 * 1024, default: 100 * 1024 * 1024 }
      }
    }
  }
}

@Injectable()
export class BaiduNetdiskConfigService {
  constructor(@Inject(BAIDU_NETDISK_PLUGIN_CONFIG_TOKEN) private readonly pluginConfig: BaiduNetdiskPluginConfig) {}

  get config(): BaiduNetdiskPluginConfig {
    return this.pluginConfig
  }

  buildOAuthConfig(options: BaiduNetdiskOAuthIntegrationOptions): BaiduNetdiskOAuthConfig {
    const integration = BaiduNetdiskOAuthIntegrationOptionsSchema.parse(options)
    return BaiduNetdiskOAuthConfigSchema.parse({
      ...integration,
      authorizationUrl: url(BAIDU_NETDISK_AUTHORIZE_URL, ['openapi.baidu.com']),
      tokenUrl: url(BAIDU_NETDISK_TOKEN_URL, ['openapi.baidu.com']),
      apiBaseUrl: url(BAIDU_NETDISK_API_ORIGIN, ['pan.baidu.com']),
      uploadBaseUrl: url(BAIDU_NETDISK_UPLOAD_ORIGIN, ['d.pcs.baidu.com'])
    })
  }
}
