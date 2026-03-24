import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const MARKITDOWN_SKILL_MIDDLEWARE_NAME = 'MarkItDownSkill'
export const DEFAULT_MARKITDOWN_VERSION = 'latest'
export const DEFAULT_MARKITDOWN_SKILLS_DIR = '/workspace/.xpert/skills/markitdown'
export const DEFAULT_MARKITDOWN_STAMP_PATH = '/workspace/.xpert/.markitdown-bootstrap.json'
export const MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION = 1

export const MarkItDownConfigSchema = z.object({
  version: z.string().min(1).default(DEFAULT_MARKITDOWN_VERSION),
  skillsDir: z.string().min(1).default(DEFAULT_MARKITDOWN_SKILLS_DIR),
  extras: z.string().min(1).default('all')
})

export type MarkItDownConfig = z.infer<typeof MarkItDownConfigSchema>

export const MarkItDownConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    version: {
      type: 'string',
      title: {
        en_US: 'MarkItDown Version',
        zh_Hans: 'MarkItDown 版本'
      },
      description: {
        en_US: 'The markitdown version to install via pip in the sandbox (e.g. "latest" or "0.1.1").',
        zh_Hans: '在 sandbox 中通过 pip 安装的 markitdown 版本（如 "latest" 或 "0.1.1"）。'
      },
      default: DEFAULT_MARKITDOWN_VERSION
    },
    extras: {
      type: 'string',
      title: {
        en_US: 'Pip Extras',
        zh_Hans: 'Pip Extras'
      },
      description: {
        en_US: 'Python extras to install (e.g. "all", "ocr", "az-doc-intel"). Use "all" for full functionality.',
        zh_Hans: '要安装的 Python extras（如 "all"、"ocr"、"az-doc-intel"）。使用 "all" 获得完整功能。'
      },
      default: 'all'
    },
    skillsDir: {
      type: 'string',
      title: {
        en_US: 'Skills Directory',
        zh_Hans: 'Skills 目录'
      },
      description: {
        en_US: 'Path inside the sandbox where skill files (SKILL.md and references) are written.',
        zh_Hans: 'sandbox 中写入 skill 文件（SKILL.md 和 references）的目录路径。'
      },
      default: DEFAULT_MARKITDOWN_SKILLS_DIR,
      'x-ui': {
        span: 2
      }
    }
  }
}
