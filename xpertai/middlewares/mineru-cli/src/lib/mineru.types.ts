import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const MINERU_SKILL_MIDDLEWARE_NAME = 'MinerUSkill'
export const DEFAULT_MINERU_SKILLS_DIR = '/workspace/.xpert/skills/mineru'
export const DEFAULT_MINERU_WRAPPER_PATH = '/workspace/.xpert/bin/mineru'
export const DEFAULT_MINERU_SECRET_ENV_PATH = '/workspace/.xpert/secrets/mineru.env'
export const DEFAULT_MINERU_STAMP_PATH = '/workspace/.xpert/.mineru-cli-bootstrap.json'
export const DEFAULT_MINERU_API_BASE = 'https://mineru.net/api/v4'
export const DEFAULT_MINERU_FILE_TIMEOUT_SEC = 900
export const DEFAULT_MINERU_BATCH_TIMEOUT_SEC = 1800
export const MINERU_BOOTSTRAP_SCHEMA_VERSION = 1
export const MINERU_SKILLS_VERSION = '2026-03-21'

export const MinerUConfigSchema = z.object({
  apiKey: z.string().min(1),
  skillsDir: z.string().min(1).default(DEFAULT_MINERU_SKILLS_DIR),
  wrapperPath: z.string().min(1).default(DEFAULT_MINERU_WRAPPER_PATH)
})

export type MinerUConfig = z.infer<typeof MinerUConfigSchema>

export const MinerUConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  required: ['apiKey'],
  properties: {
    apiKey: {
      type: 'string',
      title: {
        en_US: 'API Key',
        zh_Hans: 'API Key'
      },
      description: {
        en_US: 'MinerU API token injected into the sandbox wrapper as MINERU_TOKEN.',
        zh_Hans: '注入到 sandbox wrapper 中的 MinerU API Token，环境变量名固定为 MINERU_TOKEN。'
      },
      'x-ui': {
        component: 'secretInput',
        label: 'API Key',
        placeholder: 'MinerU API Key',
        revealable: true,
        maskSymbol: '*',
        persist: true
      } as any
    },
    skillsDir: {
      type: 'string',
      title: {
        en_US: 'Skills Directory',
        zh_Hans: 'Skills 目录'
      },
      description: {
        en_US: 'Path inside the sandbox where MinerU skill assets are written.',
        zh_Hans: 'sandbox 中写入 MinerU skill 资产的目录路径。'
      },
      default: DEFAULT_MINERU_SKILLS_DIR,
      'x-ui': {
        span: 2
      }
    },
    wrapperPath: {
      type: 'string',
      title: {
        en_US: 'Wrapper Path',
        zh_Hans: 'Wrapper 路径'
      },
      description: {
        en_US: 'Absolute path of the managed mineru wrapper inside the sandbox.',
        zh_Hans: 'sandbox 内托管 mineru wrapper 的绝对路径。'
      },
      default: DEFAULT_MINERU_WRAPPER_PATH,
      'x-ui': {
        span: 2
      }
    }
  }
}
