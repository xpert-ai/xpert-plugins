import { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

export const PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME = 'PlaywrightCLISkill'
export const DEFAULT_PLAYWRIGHT_CLI_VERSION = 'latest'
export const DEFAULT_PLAYWRIGHT_SANDBOX_DIR = '/tmp/xpert-playwright-cli'
export const DEFAULT_PLAYWRIGHT_SKILLS_DIR = `${DEFAULT_PLAYWRIGHT_SANDBOX_DIR}/skills`
export const DEFAULT_PLAYWRIGHT_STAMP_PATH = `${DEFAULT_PLAYWRIGHT_SANDBOX_DIR}/bootstrap.json`
export const DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH = `${DEFAULT_PLAYWRIGHT_SANDBOX_DIR}/cli.config.json`
export const DEFAULT_PLAYWRIGHT_RUNTIME_DIR = `${DEFAULT_PLAYWRIGHT_SANDBOX_DIR}/runtime`
export const DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC = 15
export const PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION = 2

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
        en_US: 'The @playwright/cli version to install in the sandbox runtime (e.g. "latest" or "0.1.1").',
        zh_Hans: '在 sandbox runtime 中安装的 @playwright/cli 版本（如 "latest" 或 "0.1.1"）。'
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
