import { JsonSchemaObjectType } from '@metad/contracts'
import type { ISchemaSecretField } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'

export const LARK_CLI_SKILL_MIDDLEWARE_NAME = 'LarkCLISkill'

export const DEFAULT_LARK_CLI_SKILLS_DIR = '/workspace/.xpert/skills/lark-cli'
export const DEFAULT_LARK_CLI_SECRETS_DIR = '/workspace/.xpert/secrets'
export const DEFAULT_LARK_CLI_STAMP_PATH = '/workspace/.xpert/.lark-cli-bootstrap.json'
export const DEFAULT_LARK_BOOTSTRAP_SCRIPT_PATH = `${DEFAULT_LARK_CLI_SKILLS_DIR}/scripts/lark-bootstrap.sh`
export const DEFAULT_LARK_CLI_APP_ID_PATH = `${DEFAULT_LARK_CLI_SECRETS_DIR}/lark_app_id`
export const DEFAULT_LARK_CLI_APP_SECRET_PATH = `${DEFAULT_LARK_CLI_SECRETS_DIR}/lark_app_secret`
export const LARK_CLI_BOOTSTRAP_SCHEMA_VERSION = 2

// Authentication mode enum
export const LarkAuthMode = {
  USER: 'user',
  BOT: 'bot'
} as const

export type LarkAuthModeType = (typeof LarkAuthMode)[keyof typeof LarkAuthMode]

const OptionalConfigStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional()
)

const RequiredConfigStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1)
)

// Plugin-level config schema for organization-wide download settings
export const LarkCliPluginConfigSchema = z.object({
  proxy: OptionalConfigStringSchema,
  npmRegistryUrl: OptionalConfigStringSchema
})

export type LarkCliPluginConfig = z.infer<typeof LarkCliPluginConfigSchema>

// Middleware-level configuration schema for user-level authentication
export const LarkUserAuthConfigSchema = z.object({
  authMode: z.literal(LarkAuthMode.USER).optional().default(LarkAuthMode.USER)
})

// Middleware-level configuration schema for bot-level authentication
export const LarkBotAuthConfigSchema = z.object({
  authMode: z.literal(LarkAuthMode.BOT),
  appId: RequiredConfigStringSchema,
  appSecret: RequiredConfigStringSchema
})

export const LarkCliMiddlewareConfigSchema = z.discriminatedUnion('authMode', [
  LarkUserAuthConfigSchema,
  LarkBotAuthConfigSchema
])

export type LarkCliMiddlewareConfig = z.infer<typeof LarkCliMiddlewareConfigSchema>

const LarkCliUserConfigSchema = LarkUserAuthConfigSchema.merge(LarkCliPluginConfigSchema)
const LarkCliBotConfigSchema = LarkBotAuthConfigSchema.merge(LarkCliPluginConfigSchema)

// Combined runtime config schema - authentication plus plugin-level download settings
export const LarkCliConfigSchema = z.discriminatedUnion('authMode', [
  LarkCliUserConfigSchema,
  LarkCliBotConfigSchema
])

export type LarkCliConfig = z.infer<typeof LarkCliConfigSchema>

// Plugin-level config form schema for organization-wide defaults
export const LarkCliPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    proxy: {
      type: 'string',
      title: {
        en_US: 'Download Proxy',
        zh_Hans: '下载代理地址'
      },
      description: {
        en_US: 'Optional shared HTTP(S) proxy URL used for both npm install and GitHub skill downloads during sandbox bootstrap.',
        zh_Hans: '可选的共享 HTTP(S) 代理地址，在 sandbox bootstrap 时同时用于 npm 安装和 GitHub skill 下载。'
      },
      'x-ui': <ISchemaSecretField>{
        component: 'secretInput',
        placeholder: 'http://proxy.example.com:7890',
        revealable: true,
        maskSymbol: '*',
        persist: true,
        span: 2
      }
    },
    npmRegistryUrl: {
      type: 'string',
      title: {
        en_US: 'NPM Registry URL',
        zh_Hans: 'NPM 镜像地址'
      },
      description: {
        en_US: 'Optional npm registry or mirror URL used only for installing @larksuite/cli.',
        zh_Hans: '可选的 npm registry 或镜像地址，仅用于安装 @larksuite/cli。'
      },
      'x-ui': {
        span: 2
      }
    }
  }
}

// Middleware-level form schema for UI configuration
export const LarkCliMiddlewareConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    authMode: {
      type: 'string',
      enum: [LarkAuthMode.USER, LarkAuthMode.BOT],
      title: {
        en_US: 'Authentication Mode',
        zh_Hans: '认证模式'
      },
      description: {
        en_US: 'Select user-level (OAuth) or bot-level (App ID/Secret) authentication.',
        zh_Hans: '选择用户级（OAuth）或应用级（App ID/Secret）认证。'
      },
      default: LarkAuthMode.USER,
      'x-ui': {
        component: 'select',
        span: 2
      }
    },
    appId: {
      type: 'string',
      title: {
        en_US: 'App ID',
        zh_Hans: '应用 ID'
      },
      description: {
        en_US: 'Lark App ID for bot-level authentication. Required when authMode is "bot".',
        zh_Hans: '用于应用级认证的飞书应用 ID。当认证模式为 "bot" 时必填。'
      },
      'x-ui': <ISchemaSecretField>{
        component: 'secretInput',
        placeholder: 'cli_xxxxxxxxxxxx',
        revealable: true,
        maskSymbol: '*',
        persist: true,
        span: 2
      }
    },
    appSecret: {
      type: 'string',
      title: {
        en_US: 'App Secret',
        zh_Hans: '应用密钥'
      },
      description: {
        en_US: 'Lark App Secret for bot-level authentication. Required when authMode is "bot".',
        zh_Hans: '用于应用级认证的飞书应用密钥。当认证模式为 "bot" 时必填。'
      },
      'x-ui': <ISchemaSecretField>{
        component: 'secretInput',
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        revealable: true,
        maskSymbol: '*',
        persist: true,
        span: 2
      }
    }
  },
  required: ['authMode']
}

/**
 * @deprecated Use LarkCliPluginConfigFormSchema or LarkCliMiddlewareConfigFormSchema instead.
 */
export const LarkCliConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    ...LarkCliMiddlewareConfigFormSchema.properties,
    ...LarkCliPluginConfigFormSchema.properties
  },
  required: ['authMode']
}
