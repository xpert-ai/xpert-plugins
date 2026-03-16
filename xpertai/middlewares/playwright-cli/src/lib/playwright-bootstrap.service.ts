import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import {
  BaseSandbox,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH,
  DEFAULT_PLAYWRIGHT_CLI_VERSION,
  DEFAULT_PLAYWRIGHT_SKILLS_DIR,
  DEFAULT_PLAYWRIGHT_STAMP_PATH,
  PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION,
  PlaywrightConfig,
  PlaywrightConfigSchema
} from './playwright.types.js'
import { PlaywrightPluginName } from './types.js'
import { getSkillAssets, type PlaywrightSkillAsset } from './skills/index.js'

type PlaywrightBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles'>
type PlaywrightBootstrapStamp = {
  cli?: string
  cliVersion?: string
  bootstrapVersion?: number
  installedAt?: string
}

const PLAYWRIGHT_OPEN_COMMAND_PATTERN =
  /\b(?:playwright-cli|npx\s+playwright-cli|npx\s+@playwright\/cli)\b[^|;&]*\bopen\b[^|;&]*/

@Injectable()
export class PlaywrightBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<PlaywrightConfig>): PlaywrightConfig {
    const defaults: PlaywrightConfig = {
      cliVersion: process.env['PLAYWRIGHT_CLI_VERSION'] || DEFAULT_PLAYWRIGHT_CLI_VERSION,
      skillsDir: process.env['PLAYWRIGHT_SKILLS_DIR'] || DEFAULT_PLAYWRIGHT_SKILLS_DIR
    }
    const pluginConfig =
      this.pluginConfigResolver?.resolve<PlaywrightConfig>(PlaywrightPluginName, {
        defaults
      }) ?? defaults
    const middlewareConfig = PlaywrightConfigSchema.partial().parse(config ?? {})

    return PlaywrightConfigSchema.parse({
      ...defaults,
      ...pluginConfig,
      ...middlewareConfig
    })
  }

  getStampPath(): string {
    return DEFAULT_PLAYWRIGHT_STAMP_PATH
  }

  getManagedConfigPath(): string {
    return DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH
  }

  buildSystemPrompt(config = this.resolveConfig()): string {
    return [
      'The `playwright-cli` command (from @playwright/cli) is globally installed in the sandbox.',
      'IMPORTANT: Use the `playwright-cli` command, NOT `playwright` or `npx playwright`. They are different tools.',
      'Always run browser automation via the `sandbox_shell` tool using the `playwright-cli` command.',
      `Before your first use, read the skill file at \`${config.skillsDir}/SKILL.md\` with \`cat ${config.skillsDir}/SKILL.md\` to learn all available commands and usage patterns.`,
      `A managed config is available at \`${this.getManagedConfigPath()}\` and pins \`playwright-cli open\` to Chromium in this sandbox.`,
      'Prefer plain `playwright-cli open`; do not pass `--browser=` or `--config=` unless the user explicitly asks for a different browser or config file.',
      'Use headless mode only (do not pass `--headed`).',
      'Prefer non-interactive CLI flows: snapshots, screenshots, clicks, fills, evals, test runs.',
      'Do not use `codegen`, UI mode, or `show`.',
      '',
      'TIMEOUT GUIDELINES for sandbox_shell with playwright-cli:',
      '- `playwright-cli open` and `playwright-cli open <url>` are long-running processes that keep the browser alive. A short timeout is enforced automatically — the browser opens immediately and the output is returned within seconds.',
      '- For most other playwright-cli commands (`goto`, `click`, `fill`, `screenshot`, `snapshot`, `close`, etc.), the default timeout is fine.',
      '- If a tool call times out, the browser is still running. Just proceed with the next command.',
      '',
      `For advanced topics (request mocking, tracing, video recording, etc.) read the relevant file under \`${config.skillsDir}/references/\`.`,
      'Inspect shell output carefully and summarize the actual command results back to the user.'
    ].join('\n')
  }

  isPlaywrightCommand(command: string): boolean {
    if (!command) {
      return false
    }
    return /\bplaywright-cli\b|\bnpx\s+playwright-cli\b|\bnpx\s+@playwright\/cli\b/.test(command)
  }

  /**
   * Returns true if the command includes `playwright-cli open` (with optional
   * session flag / URL / browser flags). These commands are long-running
   * processes that keep the browser alive and should be capped with a short
   * timeout so the tool call returns promptly.
   */
  isPlaywrightOpenCommand(command: string): boolean {
    if (!command) {
      return false
    }
    return /\b(?:playwright-cli|npx\s+playwright-cli|npx\s+@playwright\/cli)\b[^|;&]*\bopen\b/.test(command)
  }

  injectManagedConfig(command: string, configPath = this.getManagedConfigPath()): string {
    if (!this.shouldInjectManagedConfig(command)) {
      return command
    }

    return command.replace(
      PLAYWRIGHT_OPEN_COMMAND_PATTERN,
      (match) => `${match} --config=${shellQuote(configPath)}`
    )
  }

  async ensureBootstrap(backend: PlaywrightBootstrapBackend, config = this.resolveConfig()) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for Playwright bootstrap.')
    }

    const stampPath = this.getStampPath()
    const bootstrapAssets = this.getBootstrapAssets(config)

    // Check stamp to see if already bootstrapped with same version
    const stampCheck = await backend.execute(
      `cat ${shellQuote(stampPath)} 2>/dev/null || echo ''`
    )
    const stampContent = stampCheck?.output?.trim() ?? ''
    if (stampContent) {
      try {
        const stamp = JSON.parse(stampContent) as PlaywrightBootstrapStamp
        if (stamp.cliVersion === config.cliVersion) {
          // Stamp matches, but verify the CLI binary actually exists
          // (container may have restarted, losing globally installed packages)
          const whichResult = await backend.execute('which playwright-cli 2>/dev/null')
          if (whichResult?.exitCode === 0 && whichResult?.output?.trim()) {
            if (stamp.bootstrapVersion !== PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION) {
              await this.writeAssets(backend, bootstrapAssets)
              await this.writeStamp(backend, config.cliVersion)
            }
            return { output: 'already bootstrapped', exitCode: 0, truncated: false }
          }
        }
      } catch {
        // stamp is corrupted, re-bootstrap
      }
    }

    // 1. Install @playwright/cli globally
    const installCmd = `npm install -g @playwright/cli@${shellQuote(config.cliVersion)}`
    const installResult = await backend.execute(installCmd)
    if (installResult?.exitCode !== 0) {
      throw new Error(`Playwright CLI install failed: ${installResult?.output || 'Unknown error'}`)
    }

    // 2. Install Chromium browser for playwright-cli
    const browserResult = await backend.execute('playwright-cli install chromium')
    if (browserResult?.exitCode !== 0) {
      throw new Error(`Playwright browser install failed: ${browserResult?.output || 'Unknown error'}`)
    }

    // 3. Upload skill files to sandbox
    await this.writeAssets(backend, bootstrapAssets)

    // 4. Write stamp file
    await this.writeStamp(backend, config.cliVersion)

    return installResult
  }

  private shouldInjectManagedConfig(command: string): boolean {
    return (
      this.isPlaywrightOpenCommand(command) &&
      !/--browser(?:=|\s)/.test(command) &&
      !/--config(?:=|\s)/.test(command)
    )
  }

  private buildManagedConfig(): string {
    return `${JSON.stringify(
      {
        browser: {
          browserName: 'chromium',
          launchOptions: {
            channel: 'chromium'
          }
        }
      },
      null,
      2
    )}\n`
  }

  private getBootstrapAssets(config: PlaywrightConfig): PlaywrightSkillAsset[] {
    return [
      ...getSkillAssets(config.skillsDir),
      {
        path: this.getManagedConfigPath(),
        content: this.buildManagedConfig()
      }
    ]
  }

  private async writeStamp(backend: PlaywrightBootstrapBackend, cliVersion: string) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      cli: '@playwright/cli',
      cliVersion,
      bootstrapVersion: PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )
  }

  private async writeAssets(
    backend: PlaywrightBootstrapBackend,
    assets: PlaywrightSkillAsset[]
  ) {
    const canUploadDirectly =
      typeof backend.uploadFiles === 'function' && assets.every((asset) => !path.isAbsolute(asset.path))

    if (canUploadDirectly) {
      const results = await backend.uploadFiles(
        assets.map(({ path, content }) => [path, Buffer.from(content, 'utf8')])
      )
      const failed = results?.filter((result) => result.error)
      if (failed?.length) {
        throw new Error(`Failed to write Playwright skill assets: ${failed.map((item) => item.path).join(', ')}`)
      }
      return
    }

    for (const asset of assets) {
      const dir = path.dirname(asset.path)
      const result = await backend.execute(
        `mkdir -p ${shellQuote(dir)} && cat <<'__XPERT_PLAYWRIGHT_EOF__' > ${shellQuote(asset.path)}\n${asset.content}\n__XPERT_PLAYWRIGHT_EOF__`
      )
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to write Playwright skill asset ${asset.path}: ${result?.output || 'Unknown error'}`)
      }
    }
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}
