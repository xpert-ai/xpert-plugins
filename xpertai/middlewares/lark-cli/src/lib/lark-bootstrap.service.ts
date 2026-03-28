import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import {
  BaseSandbox,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  DEFAULT_LARK_CLI_APP_ID_PATH,
  DEFAULT_LARK_CLI_APP_SECRET_PATH,
  DEFAULT_LARK_CLI_SECRETS_DIR,
  DEFAULT_LARK_CLI_SKILLS_DIR,
  DEFAULT_LARK_CLI_STAMP_PATH,
  LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
  LarkAuthMode,
  LarkCliConfig,
  LarkCliConfigSchema,
  LarkCliPluginConfig,
  LarkCliPluginConfigSchema
} from './lark-cli.types.js'
import { LarkCliPluginName } from './types.js'

type LarkBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>

type LarkBootstrapStamp = {
  tool?: string
  proxy?: string
  npmRegistryUrl?: string
  bootstrapVersion?: number
  installedAt?: string
}

const LARK_CLI_GITHUB_REPO = 'larksuite/cli'
const LARK_CLI_SKILLS_BRANCH = 'main'
const LARK_CLI_SKILLS_URL = `https://raw.githubusercontent.com/${LARK_CLI_GITHUB_REPO}/${LARK_CLI_SKILLS_BRANCH}/skills`

// List of skills to download from the larksuite/cli repository
const LARK_SKILLS = [
  'lark-shared',
  'lark-calendar',
  'lark-im',
  'lark-doc',
  'lark-drive',
  'lark-sheets',
  'lark-base',
  'lark-task',
  'lark-mail',
  'lark-contact',
  'lark-wiki',
  'lark-event',
  'lark-vc',
  'lark-whiteboard',
  'lark-minutes',
  'lark-openapi-explorer',
  'lark-skill-maker',
  'lark-workflow-meeting-summary',
  'lark-workflow-standup-report'
]

@Injectable()
export class LarkBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<LarkCliConfig>): LarkCliConfig {
    const defaults: LarkCliConfig = {
      authMode: LarkAuthMode.USER
    }
    const pluginDefaults: LarkCliPluginConfig = {}

    const pluginConfig =
      LarkCliPluginConfigSchema.parse(
        this.pluginConfigResolver?.resolve<LarkCliPluginConfig>(LarkCliPluginName, {
          defaults: pluginDefaults
        }) ?? pluginDefaults
      )

    // Merge config manually since discriminated union doesn't support .partial()
    const mergedConfig = {
      ...defaults,
      ...pluginConfig,
      ...config
    }

    return LarkCliConfigSchema.parse(mergedConfig)
  }

  getStampPath() {
    return DEFAULT_LARK_CLI_STAMP_PATH
  }

  getSecretDirPath() {
    return DEFAULT_LARK_CLI_SECRETS_DIR
  }

  getAppIdPath() {
    return DEFAULT_LARK_CLI_APP_ID_PATH
  }

  getAppSecretPath() {
    return DEFAULT_LARK_CLI_APP_SECRET_PATH
  }

  getSkillsDir() {
    return DEFAULT_LARK_CLI_SKILLS_DIR
  }

  buildSystemPrompt(): string {
    const skillsList = LARK_SKILLS.map((skill) => `- ${skill}`).join('\n')

    return [
      '<skill>',
      'Lark CLI - A command-line tool for Lark/Feishu Open Platform with 200+ commands and 19 AI Agent Skills.',
      '',
      '## Available Skills',
      skillsList,
      '',
      '## Installation',
      'The Lark CLI is installed and available as `lark-cli` in the sandbox.',
      '',
      '## Authentication',
      '- User mode: Uses OAuth login with `lark-cli auth login`',
      '- Bot mode: Uses App ID/Secret configured in middleware',
      '',
      '## Usage',
      'Run commands through `sandbox_shell`:',
      '```bash',
      'lark-cli calendar +agenda',
      'lark-cli im +messages-send --chat-id "oc_xxx" --text "Hello"',
      '```',
      '',
      `Read the skill files in \`${DEFAULT_LARK_CLI_SKILLS_DIR}/\` for detailed usage instructions.`,
      '</skill>'
    ].join('\n')
  }

  isLarkCliCommand(command: string): boolean {
    const normalizedCommand = command.trim().toLowerCase()
    return (
      normalizedCommand.startsWith('lark-cli ') ||
      normalizedCommand === 'lark-cli' ||
      normalizedCommand.includes(' lark-cli ') ||
      normalizedCommand.includes('&& lark-cli') ||
      normalizedCommand.includes('|| lark-cli') ||
      normalizedCommand.includes('; lark-cli')
    )
  }

  async ensureBootstrap(
    backend: LarkBootstrapBackend | null,
    config = this.resolveConfig()
  ) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for Lark CLI bootstrap.')
    }
    const stamp = await this.readStamp(backend)

    const nodeReady = await this.hasNode(backend)
    if (!nodeReady) {
      throw new Error('Node.js is not available in the sandbox. Lark CLI requires Node.js.')
    }

    const cliReady = await this.commandExists(backend, 'lark-cli')
    const skillsReady = cliReady ? await this.areSkillsReady(backend) : false
    const recordedConfigMatches =
      stamp?.proxy === config.proxy &&
      stamp?.npmRegistryUrl === config.npmRegistryUrl
    const stampMatches =
      recordedConfigMatches &&
      stamp?.bootstrapVersion === LARK_CLI_BOOTSTRAP_SCHEMA_VERSION

    if (stampMatches && cliReady && skillsReady) {
      return { output: 'already bootstrapped', exitCode: 0, truncated: false }
    }

    await this.installLarkCli(backend, config)
    await this.downloadSkills(backend, config)
    await this.writeStamp(backend, config)

    return {
      output: stampMatches ? 'refreshed lark cli bootstrap' : 'bootstrapped lark cli',
      exitCode: 0,
      truncated: false
    }
  }

  async syncBotCredentials(
    backend: LarkBootstrapBackend | null,
    config: LarkCliConfig
  ) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for Lark CLI credential sync.')
    }

    // Remove existing credentials
    await backend.execute(`rm -f ${shellQuote(this.getAppIdPath())}`)
    await backend.execute(`rm -f ${shellQuote(this.getAppSecretPath())}`)

    // Only sync if bot mode with credentials
    if (config.authMode !== LarkAuthMode.BOT) {
      return { output: 'removed lark cli bot credentials', exitCode: 0, truncated: false }
    }

    if (!config.appId || !config.appSecret) {
      return { output: 'no lark cli bot credentials to sync', exitCode: 0, truncated: false }
    }

    if (typeof backend.uploadFiles !== 'function') {
      throw new Error('Sandbox backend does not support secure file uploads required for Lark CLI credentials.')
    }

    const secretDirPath = this.getSecretDirPath()
    const prepareResult = await backend.execute(
      `mkdir -p ${shellQuote(secretDirPath)} && chmod 700 ${shellQuote(secretDirPath)}`
    )
    if (prepareResult?.exitCode !== 0) {
      throw new Error(`Failed to prepare Lark secret directory: ${prepareResult?.output || 'Unknown error'}`)
    }

    // Upload App ID
    const appIdUploadPath = this.toUploadPath(backend, this.getAppIdPath())
    const appIdUploadResults = await backend.uploadFiles([
      [appIdUploadPath, Buffer.from(config.appId, 'utf8')]
    ])
    if (!Array.isArray(appIdUploadResults) || appIdUploadResults.length !== 1 || appIdUploadResults[0]?.error) {
      throw new Error(`Failed to upload Lark App ID file`)
    }

    // Upload App Secret
    const appSecretUploadPath = this.toUploadPath(backend, this.getAppSecretPath())
    const appSecretUploadResults = await backend.uploadFiles([
      [appSecretUploadPath, Buffer.from(config.appSecret, 'utf8')]
    ])
    if (!Array.isArray(appSecretUploadResults) || appSecretUploadResults.length !== 1 || appSecretUploadResults[0]?.error) {
      throw new Error(`Failed to upload Lark App Secret file`)
    }

    // Lock down permissions
    await backend.execute(`chmod 600 ${shellQuote(this.getAppIdPath())} ${shellQuote(this.getAppSecretPath())}`)

    return { output: 'synced lark cli bot credentials', exitCode: 0, truncated: false }
  }

  private async installLarkCli(backend: LarkBootstrapBackend, config: LarkCliConfig) {
    const result = await backend.execute(this.buildNpmInstallCommand(config))
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to install Lark CLI: ${result?.output || 'Unknown error'}`)
    }
    return result
  }

  private async downloadSkills(backend: LarkBootstrapBackend, config: LarkCliConfig) {
    const skillsDir = this.getSkillsDir()

    // Create skills directory
    await backend.execute(`mkdir -p ${shellQuote(skillsDir)}`)

    // Download each skill from GitHub
    for (const skillName of LARK_SKILLS) {
      const skillUrl = `${LARK_CLI_SKILLS_URL}/${skillName}/SKILL.md`
      const skillPath = `${skillsDir}/${skillName}`

      // Create skill directory
      await backend.execute(`mkdir -p ${shellQuote(skillPath)}`)

      // Download SKILL.md using curl
      const downloadResult = await backend.execute(
        this.buildSkillDownloadCommand(
          skillUrl,
          `${skillPath}/SKILL.md`,
          skillName,
          config
        )
      )

      // Continue even if some skills fail to download
      if (downloadResult?.exitCode !== 0) {
        console.warn(`Warning: Failed to download skill ${skillName}`)
      }
    }

    return { output: 'downloaded lark skills', exitCode: 0 }
  }

  private async hasNode(backend: LarkBootstrapBackend) {
    return this.commandExists(backend, 'node')
  }

  private async areSkillsReady(backend: LarkBootstrapBackend) {
    // Check if at least the lark-shared skill exists (required by all other skills)
    const sharedSkillPath = `${this.getSkillsDir()}/lark-shared/SKILL.md`
    const result = await backend.execute(`test -f ${shellQuote(sharedSkillPath)}`)
    return result?.exitCode === 0
  }

  private async writeStamp(backend: LarkBootstrapBackend, config: LarkCliConfig) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      tool: 'lark-cli',
      proxy: config.proxy,
      npmRegistryUrl: config.npmRegistryUrl,
      bootstrapVersion: LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    const result = await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write Lark CLI bootstrap stamp: ${result?.output || 'Unknown error'}`)
    }
  }

  private async readStamp(backend: LarkBootstrapBackend) {
    const stampCheck = await backend.execute(
      `cat ${shellQuote(this.getStampPath())} 2>/dev/null || echo ''`
    )
    const stampContent = stampCheck?.output?.trim() ?? ''

    if (!stampContent) {
      return null
    }

    try {
      return JSON.parse(stampContent) as LarkBootstrapStamp
    } catch {
      return null
    }
  }

  private async commandExists(backend: LarkBootstrapBackend, command: string) {
    const result = await backend.execute(`which ${command} 2>/dev/null`)
    return result?.exitCode === 0 && !!result?.output?.trim()
  }

  private buildNpmInstallCommand(config: LarkCliConfig) {
    const args = ['npm install -g @larksuite/cli']
    if (config.npmRegistryUrl) {
      args.push(`--registry ${shellQuote(config.npmRegistryUrl)}`)
    }
    if (config.proxy) {
      args.push(`--proxy ${shellQuote(config.proxy)}`)
      args.push(`--https-proxy ${shellQuote(config.proxy)}`)
    }
    return `${args.join(' ')} 2>&1`
  }

  private buildSkillDownloadCommand(
    skillUrl: string,
    outputPath: string,
    skillName: string,
    config: LarkCliConfig
  ) {
    const args = ['curl -sSL']
    if (config.proxy) {
      args.push(`--proxy ${shellQuote(config.proxy)}`)
    }
    args.push(shellQuote(skillUrl))
    args.push(`-o ${shellQuote(outputPath)}`)
    return `${args.join(' ')} 2>&1 || echo "Warning: Failed to download ${skillName}"`
  }

  private toUploadPath(backend: LarkBootstrapBackend, targetPath: string) {
    const normalizedTargetPath = path.normalize(targetPath)
    if (!path.isAbsolute(normalizedTargetPath)) {
      return normalizedTargetPath
    }

    const workingDirectory = normalizeString(backend.workingDirectory)
    if (!workingDirectory || !path.isAbsolute(workingDirectory)) {
      return normalizedTargetPath
    }

    const normalizedWorkingDirectory = path.normalize(workingDirectory)
    const relativePath = path.relative(normalizedWorkingDirectory, normalizedTargetPath)
    if (!relativePath || path.isAbsolute(relativePath)) {
      return normalizedTargetPath
    }

    const roundTripPath = path.normalize(path.join(normalizedWorkingDirectory, relativePath))
    if (roundTripPath !== normalizedTargetPath) {
      return normalizedTargetPath
    }

    return relativePath
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\'"'`)}'`
}
