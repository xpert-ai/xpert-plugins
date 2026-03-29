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
  LarkAuthEnsureResponse,
  LarkAuthMode,
  LarkCliAuthStatus,
  LarkCliAuthStatusSchema,
  LarkCliConfig,
  LarkCliConfigSchema,
  LarkCliPluginConfig,
  LarkCliPluginConfigSchema,
  LarkWaitUserResponse
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

  // ============================================================
  // Auth Status Methods
  // ============================================================

  /**
   * Check current authentication status by running `lark-cli auth status`
   * (outputs JSON by default; `--verify` additionally checks token against server)
   */
  async checkAuthStatus(backend: LarkBootstrapBackend): Promise<LarkCliAuthStatus> {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for auth status check.')
    }

    const result = await backend.execute('lark-cli auth status 2>&1')
    const output = result?.output?.trim() ?? '{}'

    try {
      // Try to parse JSON output
      const parsed = JSON.parse(output)
      return LarkCliAuthStatusSchema.parse(parsed)
    } catch {
      // If JSON parsing fails, try to parse text output
      return this.parseAuthStatusText(output)
    }
  }

  /**
   * Parse auth status from text output (fallback when JSON is not available)
   */
  private parseAuthStatusText(output: string): LarkCliAuthStatus {
    const normalizedOutput = output.toLowerCase()
    
    const loggedIn = normalizedOutput.includes('logged in') || 
                     normalizedOutput.includes('authenticated') ||
                     !normalizedOutput.includes('not logged in')
    
    let identityType: 'user' | 'bot' | 'none' = 'none'
    if (normalizedOutput.includes('user identity') || normalizedOutput.includes('user:')) {
      identityType = 'user'
    } else if (normalizedOutput.includes('bot identity') || normalizedOutput.includes('bot:')) {
      identityType = 'bot'
    }
    
    const tokenValid = normalizedOutput.includes('token valid') || 
                       normalizedOutput.includes('valid token') ||
                       (loggedIn && !normalizedOutput.includes('token expired'))
    
    // Try to extract expiration time
    let expiresAt: string | null = null
    const expiresMatch = output.match(/expires?\s*(?:at|in|on)?[:\s]+([^\n]+)/i)
    if (expiresMatch) {
      expiresAt = expiresMatch[1].trim()
    }

    return LarkCliAuthStatusSchema.parse({
      loggedIn,
      identityType,
      tokenValid,
      expiresAt,
      scopes: []
    })
  }

  /**
   * Perform bot login using App ID and Secret from config
   */
  async performBotLogin(backend: LarkBootstrapBackend, config: LarkCliConfig): Promise<{ success: boolean; message: string }> {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for bot login.')
    }

    if (config.authMode !== LarkAuthMode.BOT) {
      return { success: false, message: 'Bot login requires bot auth mode configuration.' }
    }

    if (!config.appId || !config.appSecret) {
      return { success: false, message: 'Bot login requires appId and appSecret.' }
    }

    // Ensure credentials are synced first
    await this.syncBotCredentials(backend, config)

    // Use `config init --app-id --app-secret-stdin --brand` to configure the app,
    // then `config default-as bot` to set the default identity to bot.
    const brand = config.brand ?? 'lark'
    const initResult = await backend.execute(
      `echo ${shellQuote(config.appSecret)} | lark-cli config init --app-id ${shellQuote(config.appId)} --app-secret-stdin --brand ${shellQuote(brand)} 2>&1`
    )

    if (initResult?.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to initialize bot config: ${initResult?.output || 'Unknown error'}`
      }
    }

    // Set default identity to bot
    const defaultAsResult = await backend.execute(
      `lark-cli config default-as bot 2>&1`
    )

    if (defaultAsResult?.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to set default identity to bot: ${defaultAsResult?.output || 'Unknown error'}`
      }
    }

    // Verify bot credentials by checking auth status
    const verifyResult = await backend.execute(
      `lark-cli auth status --verify 2>&1`
    )

    if (verifyResult?.exitCode === 0) {
      return { success: true, message: 'Bot configuration initialized and verified successfully.' }
    }

    // Config was written but credentials may be invalid
    return {
      success: false,
      message: `Bot credentials verification failed: ${verifyResult?.output || 'Invalid appId or appSecret. Please check your Lark app configuration.'}`
    }
  }

  /**
   * Initiate user OAuth login and return authorization URL
   */
  async initiateUserLogin(backend: LarkBootstrapBackend): Promise<{ authorizationUrl: string; deviceCode: string }> {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for user login.')
    }

    // Run lark-cli auth login with --no-wait to get URL immediately
    const result = await backend.execute(
      `lark-cli auth login --recommend --no-wait --json 2>&1`
    )

    const output = result?.output?.trim() ?? ''

    // Try to parse JSON output for URL and device code
    try {
      const parsed = JSON.parse(output)
      if (parsed.authorization_url && parsed.device_code) {
        return {
          authorizationUrl: parsed.authorization_url,
          deviceCode: parsed.device_code
        }
      }
    } catch {
      // Fall back to text parsing
    }

    // Extract URL from text output
    const urlMatch = output.match(/https?:\/\/[^\s]+/)
    const deviceCodeMatch = output.match(/device[_-]?code[:\s]+([A-Za-z0-9]+)/i)

    if (!urlMatch) {
      throw new Error('Failed to get authorization URL from lark-cli auth login.')
    }

    return {
      authorizationUrl: urlMatch[0],
      deviceCode: deviceCodeMatch?.[1] ?? ''
    }
  }

  /**
   * Wait for user to complete OAuth login (polling for up to 60 seconds)
   */
  async waitForUserLogin(
    backend: LarkBootstrapBackend, 
    deviceCode: string,
    maxWaitSeconds: number = 60
  ): Promise<LarkWaitUserResponse> {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for user login wait.')
    }

    const startTime = Date.now()
    const pollIntervalMs = 3000 // Poll every 3 seconds

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      // Poll auth status using device code
      const result = await backend.execute(
        `lark-cli auth login --device-code ${shellQuote(deviceCode)} --json 2>&1 || echo '{"status":"pending"}'`
      )

      const output = result?.output?.trim() ?? '{"status":"pending"}'

      try {
        const parsed = JSON.parse(output)
        if (parsed.status === 'success' || parsed.logged_in === true) {
          const waitedSeconds = Math.round((Date.now() - startTime) / 1000)
          return {
            success: true,
            identityType: 'user',
            waitedSeconds,
            message: `User login successful after ${waitedSeconds} seconds.`
          }
        }
        if (parsed.status === 'expired' || parsed.error) {
          const waitedSeconds = Math.round((Date.now() - startTime) / 1000)
          return {
            success: false,
            identityType: 'none',
            waitedSeconds,
            message: `Login expired or failed: ${parsed.error || 'Unknown error'}`
          }
        }
      } catch {
        // Continue polling if JSON parsing fails
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    const waitedSeconds = Math.round((Date.now() - startTime) / 1000)
    return {
      success: false,
      identityType: 'none',
      waitedSeconds,
      message: `User login timed out after ${waitedSeconds} seconds.`
    }
  }

  /**
   * Build comprehensive auth ensure response
   */
  async buildAuthEnsureResponse(
    backend: LarkBootstrapBackend | null,
    config: LarkCliConfig
  ): Promise<LarkAuthEnsureResponse> {
    // Check config validity
    const configExists = !!config
    const configValid = this.validateConfig(config)

    // Default response when backend is not available
    if (!backend || typeof backend.execute !== 'function') {
      return {
        configExists,
        configValid,
        authMode: config.authMode,
        identityType: 'none',
        isLoggedIn: false,
        tokenValid: false,
        tokenExpiresAt: null,
        authorizationUrl: null,
        deviceCode: null,
        message: 'Sandbox backend not available. Cannot check auth status.'
      }
    }

    // Ensure bootstrap first
    try {
      await this.ensureBootstrap(backend)
    } catch (error) {
      return {
        configExists,
        configValid,
        authMode: config.authMode,
        identityType: 'none',
        isLoggedIn: false,
        tokenValid: false,
        tokenExpiresAt: null,
        authorizationUrl: null,
        deviceCode: null,
        message: `Bootstrap failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }

    // For bot mode, sync credentials and write config
    if (config.authMode === LarkAuthMode.BOT) {
      try {
        // Bot mode does NOT use `auth login`. It only needs:
        // 1. Credential files synced to the sandbox
        // 2. lark-cli config.json written with appId + appSecret file reference
        const loginResult = await this.performBotLogin(backend, config)
        
        if (loginResult.success) {
          return {
            configExists,
            configValid,
            authMode: LarkAuthMode.BOT,
            identityType: 'bot',
            isLoggedIn: true,
            tokenValid: true,
            tokenExpiresAt: null,
            authorizationUrl: null,
            deviceCode: null,
            message: 'Bot configuration ready. Default identity is set to bot.'
          }
        }
        
        return {
          configExists,
          configValid,
          authMode: LarkAuthMode.BOT,
          identityType: 'none',
          isLoggedIn: false,
          tokenValid: false,
          tokenExpiresAt: null,
          authorizationUrl: null,
          deviceCode: null,
          message: loginResult.message
        }
      } catch (error) {
        return {
          configExists,
          configValid,
          authMode: LarkAuthMode.BOT,
          identityType: 'none',
          isLoggedIn: false,
          tokenValid: false,
          tokenExpiresAt: null,
          authorizationUrl: null,
          deviceCode: null,
          message: `Bot config setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    }

    // For user mode, check current status and provide URL if needed
    try {
      const authStatus = await this.checkAuthStatus(backend)
      
      if (authStatus.loggedIn && authStatus.identityType === 'user' && authStatus.tokenValid) {
        return {
          configExists,
          configValid,
          authMode: LarkAuthMode.USER,
          identityType: 'user',
          isLoggedIn: true,
          tokenValid: true,
          tokenExpiresAt: authStatus.expiresAt ?? null,
          authorizationUrl: null,
          deviceCode: null,
          message: 'User authentication active.'
        }
      }
      
      // User not logged in - initiate login and return URL
      const loginInfo = await this.initiateUserLogin(backend)
      
      return {
        configExists,
        configValid,
        authMode: LarkAuthMode.USER,
        identityType: authStatus.identityType ?? 'none',
        isLoggedIn: false,
        tokenValid: false,
        tokenExpiresAt: null,
        authorizationUrl: loginInfo.authorizationUrl,
        deviceCode: loginInfo.deviceCode,
        message: 'User login required. Please visit the authorization URL.'
      }
    } catch (error) {
      return {
        configExists,
        configValid,
        authMode: LarkAuthMode.USER,
        identityType: 'none',
        isLoggedIn: false,
        tokenValid: false,
        tokenExpiresAt: null,
        authorizationUrl: null,
        deviceCode: null,
        message: `User auth check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Validate configuration based on auth mode
   */
  private validateConfig(config: LarkCliConfig): boolean {
    if (!config) return false
    
    if (config.authMode === LarkAuthMode.USER) {
      return true // User mode always valid (no required fields)
    }
    
    if (config.authMode === LarkAuthMode.BOT) {
      return !!config.appId && !!config.appSecret
    }
    
    return false
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\'"'`)}'`
}
