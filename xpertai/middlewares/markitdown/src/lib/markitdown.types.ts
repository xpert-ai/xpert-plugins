import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const MARKITDOWN_SKILL_MIDDLEWARE_NAME = 'MarkItDownSkill'
export const DEFAULT_MARKITDOWN_VERSION = 'latest'
export const DEFAULT_MARKITDOWN_SKILLS_DIR = '/workspace/.xpert/skills/markitdown'
export const DEFAULT_MARKITDOWN_STAMP_PATH = '/workspace/.xpert/.markitdown-bootstrap.json'
export const MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION = 1

/**
 * Plugin-level config schema (organization-wide defaults)
 * Only includes pip index URLs which are typically configured at organization level.
 */
export const MarkItDownPluginConfigSchema = z.object({
  pipIndexUrl: z.string().optional(),
  pipExtraIndexUrl: z.string().optional()
})

export type MarkItDownPluginConfig = z.infer<typeof MarkItDownPluginConfigSchema>

/**
 * Middleware-level config schema (per-agent overrides)
 * Includes version, extras, and skillsDir which may vary per agent.
 */
export const MarkItDownMiddlewareConfigSchema = z.object({
  version: z.string().min(1).default(DEFAULT_MARKITDOWN_VERSION),
  skillsDir: z.string().min(1).default(DEFAULT_MARKITDOWN_SKILLS_DIR),
  extras: z.string().min(1).default('all')
})

export type MarkItDownMiddlewareConfig = z.infer<typeof MarkItDownMiddlewareConfigSchema>

/**
 * Full config schema (merged from plugin and middleware configs)
 */
export const MarkItDownConfigSchema = MarkItDownMiddlewareConfigSchema.merge(MarkItDownPluginConfigSchema)

export type MarkItDownConfig = z.infer<typeof MarkItDownConfigSchema>

/**
 * Plugin-level config form schema (organization-wide defaults)
 * Only includes pip index URLs which are typically configured at organization level.
 */
export const MarkItDownPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    pipIndexUrl: {
      type: 'string',
      title: {
        en_US: 'Pip Index URL',
        zh_Hans: 'Pip 索引地址'
      },
      description: {
        en_US: 'Custom pip index URL for downloading packages (e.g., "https://pypi.tuna.tsinghua.edu.cn/simple"). Leave blank to use default.',
        zh_Hans: '用于下载包的自定义 pip 索引地址（例如 "https://pypi.tuna.tsinghua.edu.cn/simple"）。留空则使用默认值。'
      }
    },
    pipExtraIndexUrl: {
      type: 'string',
      title: {
        en_US: 'Pip Extra Index URL',
        zh_Hans: 'Pip 额外索引地址'
      },
      description: {
        en_US: 'Additional pip index URL as fallback. Leave blank if not needed.',
        zh_Hans: '作为备用的额外 pip 索引地址。如不需要可留空。'
      }
    }
  }
}

/**
 * Middleware-level config form schema (per-agent overrides)
 * Includes version, extras, and skillsDir which may vary per agent.
 */
export const MarkItDownMiddlewareConfigFormSchema: JsonSchemaObjectType = {
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
        en_US:
          'Python extras to install (e.g. "all", "pdf", "docx", "pptx", "xlsx", "xls", "outlook", "az-doc-intel", "audio-transcription", "youtube-transcription"). Use "all" for broadest coverage.',
        zh_Hans:
          '要安装的 Python extras（如 "all"、"pdf"、"docx"、"pptx"、"xlsx"、"xls"、"outlook"、"az-doc-intel"、"audio-transcription"、"youtube-transcription"）。使用 "all" 可获得最广覆盖。'
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
        en_US: 'Path inside the sandbox where the MarkItDown skill file (SKILL.md) is written.',
        zh_Hans: 'sandbox 中写入 MarkItDown skill 文件（SKILL.md）的目录路径。'
      },
      default: DEFAULT_MARKITDOWN_SKILLS_DIR,
      'x-ui': {
        span: 2
      }
    }
  }
}

/**
 * @deprecated Use MarkItDownPluginConfigFormSchema or MarkItDownMiddlewareConfigFormSchema instead.
 * Full config form schema for backward compatibility.
 */
export const MarkItDownConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    ...MarkItDownMiddlewareConfigFormSchema.properties,
    ...MarkItDownPluginConfigFormSchema.properties
  }
}
