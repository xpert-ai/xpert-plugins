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
export const LARK_CLI_BOOTSTRAP_SCHEMA_VERSION = 1

// Authentication mode enum
export const LarkAuthMode = {
  USER: 'user',
  BOT: 'bot'
} as const

export type LarkAuthModeType = (typeof LarkAuthMode)[keyof typeof LarkAuthMode]

// Configuration schema for user-level authentication
export const LarkUserAuthConfigSchema = z.object({
  authMode: z.literal(LarkAuthMode.USER).optional().default(LarkAuthMode.USER)
})

// Configuration schema for bot-level authentication
export const LarkBotAuthConfigSchema = z.object({
  authMode: z.literal(LarkAuthMode.BOT),
  appId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1)
  ),
  appSecret: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1)
  )
})

// Combined config schema - discriminated union based on authMode
export const LarkCliConfigSchema = z.discriminatedUnion('authMode', [
  LarkUserAuthConfigSchema,
  LarkBotAuthConfigSchema
])

export type LarkCliConfig = z.infer<typeof LarkCliConfigSchema>

// Form schema for UI configuration
export const LarkCliConfigFormSchema: JsonSchemaObjectType = {
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
