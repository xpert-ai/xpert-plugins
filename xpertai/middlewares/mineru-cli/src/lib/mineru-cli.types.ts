import { JsonSchemaObjectType } from '@metad/contracts'
import type { ISchemaSecretField } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'

export const MINERU_CLI_SKILL_MIDDLEWARE_NAME = 'MinerUCLISkill'
export const DEFAULT_MINERU_CLI_SKILLS_DIR = '/workspace/.xpert/skills/mineru-cli'
export const DEFAULT_MINERU_CLI_SECRETS_DIR = '/workspace/.xpert/secrets'
export const DEFAULT_MINERU_CLI_STAMP_PATH = '/workspace/.xpert/.mineru-cli-bootstrap.json'
export const DEFAULT_MINERU_SCRIPT_PATH = `${DEFAULT_MINERU_CLI_SKILLS_DIR}/scripts/mineru.py`
export const DEFAULT_MINERU_CLI_TOKEN_PATH = `${DEFAULT_MINERU_CLI_SECRETS_DIR}/mineru_token`
export const MINERU_CLI_BOOTSTRAP_SCHEMA_VERSION = 2

export const MinerUCliConfigSchema = z.object({
  apiToken: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional()
  )
})

export type MinerUCliConfig = z.infer<typeof MinerUCliConfigSchema>

export const MinerUCliConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    apiToken: {
      type: 'string',
      title: {
        en_US: 'API Token',
        zh_Hans: 'API Token'
      },
      description: {
        en_US: 'Optional MinerU token securely provisioned inside the sandbox for the MinerU CLI script.',
        zh_Hans: '可选的 MinerU token，会安全下发到 sandbox 中供 MinerU CLI 脚本读取。'
      },
      'x-ui': <ISchemaSecretField>{
        component: 'secretInput',
        label: 'API Token',
        placeholder: 'MinerU API Token',
        revealable: true,
        maskSymbol: '*',
        persist: true,
        span: 2
      }
    }
  }
}
