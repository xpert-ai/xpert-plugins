import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME = 'PlaywrightCLISkill'
export const DEFAULT_PLAYWRIGHT_CLI_VERSION = 'latest'
export const DEFAULT_PLAYWRIGHT_SKILLS_DIR = '/workspace/.xpert/skills/playwright-cli'
export const DEFAULT_PLAYWRIGHT_STAMP_PATH = '/workspace/.xpert/.playwright-cli-bootstrap.json'
export const DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH = '/workspace/.xpert/playwright-cli/cli.config.json'
export const DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC = 15
export const PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION = 1

export const PlaywrightConfigSchema = z.object({
  cliVersion: z.string().min(1).default(DEFAULT_PLAYWRIGHT_CLI_VERSION),
  skillsDir: z.string().min(1).default(DEFAULT_PLAYWRIGHT_SKILLS_DIR)
})

export type PlaywrightConfig = z.infer<typeof PlaywrightConfigSchema>

export const PlaywrightConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    cliVersion: {
      type: 'string',
      title: {
        en_US: 'CLI Version',
        zh_Hans: 'CLI 版本'
      },
      description: {
        en_US: 'The @playwright/cli version to install globally in the sandbox (e.g. "latest" or "0.1.1").',
        zh_Hans: '在 sandbox 中全局安装的 @playwright/cli 版本（如 "latest" 或 "0.1.1"）。'
      },
      default: DEFAULT_PLAYWRIGHT_CLI_VERSION
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
      default: DEFAULT_PLAYWRIGHT_SKILLS_DIR,
      'x-ui': {
        span: 2
      }
    }
  }
}
