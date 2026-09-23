import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { posix as path } from 'node:path'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  type BaseSandbox,
  type ConnectorRuntimeCredentialV2,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  WECOM_CLI_BOOTSTRAP_SCHEMA_VERSION,
  WECOM_CLI_SKILLS,
  WECOM_CLI_SKILLS_REF,
  WECOM_CLI_SKILLS_SHA256,
  WECOM_CLI_VERSION,
  WECOM_CONNECTOR_PLUGIN_NAME,
  WeComConnectorPluginConfigSchema,
  readString,
  requireString,
  type WeComBotCredential,
  type WeComConnectorPluginConfig
} from './types.js'

export type WeComCliBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>

export type WeComCliRuntimePathContext = {
  workspaceRoot?: string | null
  workingDirectory?: string | null
}

export type WeComCliRuntimePaths = {
  workspaceRoot: string
  xpertDir: string
  runtimeDir: string
  binaryPath: string
  skillsDir: string
  secretsDir: string
  tmpDir: string
  stampPath: string
}

type BootstrapStamp = {
  cliVersion?: string
  skillsRef?: string
  skillsSha256?: string
  proxy?: string
  npmRegistryUrl?: string
  bootstrapVersion?: number
}

type AuthStamp = {
  version?: number
  fingerprint?: string
}

const DEFAULT_WORKSPACE_ROOT = '/workspace'
const SKILLS_ARCHIVE_URL = `https://codeload.github.com/WecomTeam/wecom-cli/tar.gz/${WECOM_CLI_SKILLS_REF}`
const bootstrapTasks = new Map<string, Promise<void>>()
const authTasks = new Map<string, Promise<void>>()

@Injectable()
export class WeComCliBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<WeComConnectorPluginConfig>): WeComConnectorPluginConfig {
    const defaults: WeComConnectorPluginConfig = {}
    const pluginConfig =
      this.pluginConfigResolver?.resolve<WeComConnectorPluginConfig>(WECOM_CONNECTOR_PLUGIN_NAME, { defaults }) ??
      defaults
    return WeComConnectorPluginConfigSchema.parse({ ...defaults, ...pluginConfig, ...config })
  }

  resolveRuntimePaths(context?: WeComCliRuntimePathContext | null): WeComCliRuntimePaths {
    const workspaceRoot =
      normalizeAbsolutePath(context?.workspaceRoot) ??
      normalizeAbsolutePath(context?.workingDirectory) ??
      DEFAULT_WORKSPACE_ROOT
    const xpertDir = path.join(workspaceRoot, '.xpert')
    const runtimeDir = path.join(xpertDir, 'tools', 'wecom-cli')
    return {
      workspaceRoot,
      xpertDir,
      runtimeDir,
      binaryPath: path.join(runtimeDir, 'bin', 'wecom-cli'),
      skillsDir: path.join(xpertDir, 'skills', 'wecom-cli'),
      secretsDir: path.join(xpertDir, 'secrets', 'wecom-cli'),
      tmpDir: path.join(xpertDir, 'tmp', 'wecom-cli'),
      stampPath: path.join(xpertDir, '.wecom-cli-bootstrap.json')
    }
  }

  getConnectorPaths(connectorId: string, paths: WeComCliRuntimePaths) {
    const segment = safePathSegment(connectorId)
    const secretRoot = path.join(paths.secretsDir, segment)
    return {
      secretRoot,
      configDir: path.join(secretRoot, 'config'),
      authStampPath: path.join(secretRoot, 'auth.json'),
      tmpDir: path.join(paths.tmpDir, segment)
    }
  }

  buildSystemPrompt(paths: WeComCliRuntimePaths): string {
    const skills = WECOM_CLI_SKILLS.map((skill) => `- ${skill}`).join('\n')
    return [
      '<wecom-cli>',
      `The official WeCom CLI ${WECOM_CLI_VERSION} is managed by the active workspace connector and available as \`wecom-cli\` in \`sandbox_shell\`.`,
      '',
      'Available official Skills:',
      skills,
      '',
      `Before the first business operation, read \`${paths.skillsDir}/wecomcli-shared/SKILL.md\` and the selected domain Skill.`,
      'Use CLI help or schema/document commands when an operation schema is unclear; the online command schema may evolve.',
      'Run exactly one `wecom-cli` command per `sandbox_shell` call. Shell chaining, pipes, redirects, command substitution, and background execution are blocked.',
      'Do not run `wecom-cli auth ...`; connector authentication is managed by `wecom_cli_auth_ensure`.',
      'Do not call WeCom APIs with curl or custom scripts and do not install another copy of the CLI.',
      'Write downloaded or generated user files under the workspace, not under `.xpert`.',
      'For large results, use CLI pagination and output options such as `--page-count`, `--output`, or `--output-dir` when supported.',
      'Before sending messages, deleting data, changing permissions, or performing another consequential write, confirm the exact target and content with the user.',
      'Never print or inspect connector secrets, CLI credential files, or `.xpert/secrets`.',
      'Summarize actual command output for the user without exposing internal connector identifiers.',
      '</wecom-cli>'
    ].join('\n')
  }

  async ensureBootstrap(
    backend: WeComCliBackend,
    config = this.resolveConfig(),
    paths = this.resolveRuntimePaths({ workingDirectory: backend.workingDirectory })
  ): Promise<void> {
    const key = paths.stampPath
    const existing = bootstrapTasks.get(key)
    if (existing) return existing
    const task = this.bootstrap(backend, config, paths).finally(() => bootstrapTasks.delete(key))
    bootstrapTasks.set(key, task)
    return task
  }

  async ensureAuthorized(
    backend: WeComCliBackend,
    credential: ConnectorRuntimeCredentialV2,
    paths: WeComCliRuntimePaths,
    config = this.resolveConfig()
  ): Promise<{
    status: 'authorized'
    cliVersion: string
    skillsVersion: string
    identityType: 'bot'
    message: string
  }> {
    const connectorId = requireString(
      credential.connectorId,
      'WeCom connector runtime credential is missing connectorId.'
    )
    const bot = readBotCredential(credential.credentials)
    await this.ensureBootstrap(backend, config, paths)
    const connectorPaths = this.getConnectorPaths(connectorId, paths)
    const key = connectorPaths.authStampPath
    const existing = authTasks.get(key)
    if (existing) await existing
    else {
      const task = this.authorize(backend, bot, connectorPaths, paths, config).finally(() => authTasks.delete(key))
      authTasks.set(key, task)
      await task
    }
    return {
      status: 'authorized',
      cliVersion: WECOM_CLI_VERSION,
      skillsVersion: WECOM_CLI_SKILLS_REF,
      identityType: 'bot',
      message: 'The active workspace WeCom AI Bot connector is authorized for WeCom CLI.'
    }
  }

  buildManagedCommand(
    commandTail: string,
    connectorId: string,
    paths: WeComCliRuntimePaths,
    config: WeComConnectorPluginConfig
  ) {
    const connectorPaths = this.getConnectorPaths(connectorId, paths)
    const env = this.buildRuntimeEnvironment(connectorPaths.configDir, connectorPaths.tmpDir, config)
    return `${env} ${shellQuote(paths.binaryPath)}${commandTail ? ` ${commandTail}` : ''}`
  }

  private async bootstrap(
    backend: WeComCliBackend,
    config: WeComConnectorPluginConfig,
    paths: WeComCliRuntimePaths
  ): Promise<void> {
    const stamp = await readJsonFile<BootstrapStamp>(backend, paths.stampPath)
    const cliReady = (await backend.execute(`test -x ${shellQuote(paths.binaryPath)}`)).exitCode === 0
    const skillsReady =
      cliReady &&
      (await backend.execute(`test -f ${shellQuote(path.join(paths.skillsDir, 'wecomcli-shared', 'SKILL.md'))}`))
        .exitCode === 0
    const stampMatches =
      stamp?.cliVersion === WECOM_CLI_VERSION &&
      stamp.skillsRef === WECOM_CLI_SKILLS_REF &&
      stamp.skillsSha256 === WECOM_CLI_SKILLS_SHA256 &&
      stamp.proxy === config.proxy &&
      stamp.npmRegistryUrl === config.npmRegistryUrl &&
      stamp.bootstrapVersion === WECOM_CLI_BOOTSTRAP_SCHEMA_VERSION
    if (stampMatches && cliReady && skillsReady) return

    const nodeCheck = await backend.execute('node --version')
    if (nodeCheck.exitCode !== 0)
      throw new Error('Node.js is not available in the sandbox. WeCom CLI requires Node.js 18 or later.')
    const npmCheck = await backend.execute('npm --version')
    if (npmCheck.exitCode !== 0)
      throw new Error('npm is not available in the sandbox. WeCom CLI bootstrap requires npm.')

    const install = await backend.execute(this.buildInstallCommand(paths, config))
    if (install.exitCode !== 0) throw new Error(`WeCom CLI install failed: ${boundedOutput(install.output)}`)

    const skills = await backend.execute(this.buildSkillsInstallCommand(paths, config))
    if (skills.exitCode !== 0) throw new Error(`WeCom CLI Skills install failed: ${boundedOutput(skills.output)}`)

    const stampData = JSON.stringify({
      cliVersion: WECOM_CLI_VERSION,
      skillsRef: WECOM_CLI_SKILLS_REF,
      skillsSha256: WECOM_CLI_SKILLS_SHA256,
      proxy: config.proxy,
      npmRegistryUrl: config.npmRegistryUrl,
      bootstrapVersion: WECOM_CLI_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    const write = await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(paths.stampPath))} && printf '%s' ${shellQuote(stampData)} > ${shellQuote(
        `${paths.stampPath}.tmp`
      )} && mv ${shellQuote(`${paths.stampPath}.tmp`)} ${shellQuote(paths.stampPath)}`
    )
    if (write.exitCode !== 0)
      throw new Error(`Failed to write WeCom CLI bootstrap stamp: ${boundedOutput(write.output)}`)
  }

  private async authorize(
    backend: WeComCliBackend,
    bot: WeComBotCredential,
    connectorPaths: ReturnType<WeComCliBootstrapService['getConnectorPaths']>,
    paths: WeComCliRuntimePaths,
    config: WeComConnectorPluginConfig
  ): Promise<void> {
    const fingerprint = createHash('sha256').update(bot.botId).update('\0').update(bot.botSecret).digest('hex')
    const stamp = await readJsonFile<AuthStamp>(backend, connectorPaths.authStampPath)
    if (stamp?.version === 1 && stamp.fingerprint === fingerprint) {
      const status = await backend.execute(
        `${this.buildRuntimeEnvironment(connectorPaths.configDir, connectorPaths.tmpDir, config)} ${shellQuote(
          paths.binaryPath
        )} auth show --status`
      )
      if (status.exitCode === 0 && status.output.trim() === 'authorized') return
    }

    if (typeof backend.uploadFiles !== 'function') {
      throw new Error('Sandbox backend does not support secure uploads required for WeCom CLI authentication.')
    }
    const nonce = randomUUID()
    const launcherPath = path.join(connectorPaths.secretRoot, `.auth-${nonce}.sh`)
    const botIdPath = path.join(connectorPaths.secretRoot, `.bot-id-${nonce}`)
    const secretPath = path.join(connectorPaths.secretRoot, `.bot-secret-${nonce}`)
    const prepare = await backend.execute(
      `mkdir -p ${shellQuote(connectorPaths.secretRoot)} ${shellQuote(connectorPaths.configDir)} ${shellQuote(
        connectorPaths.tmpDir
      )} && chmod 700 ${shellQuote(connectorPaths.secretRoot)} ${shellQuote(connectorPaths.configDir)} ${shellQuote(
        connectorPaths.tmpDir
      )} && find ${shellQuote(connectorPaths.configDir)} -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +`
    )
    if (prepare.exitCode !== 0)
      throw new Error(`Failed to prepare WeCom CLI credential directory: ${boundedOutput(prepare.output)}`)

    const launcher = [
      '#!/bin/sh',
      'set -eu',
      `bot_id=$(cat ${shellQuote(botIdPath)})`,
      `bot_secret=$(cat ${shellQuote(secretPath)})`,
      `exec ${shellQuote(paths.binaryPath)} auth init --bot-id "$bot_id" --secret "$bot_secret"`
    ].join('\n')
    let authError: unknown
    let cleanupError: unknown
    try {
      const upload = await backend.uploadFiles([
        [toUploadPath(backend, launcherPath), Buffer.from(launcher, 'utf8')],
        [toUploadPath(backend, botIdPath), Buffer.from(bot.botId, 'utf8')],
        [toUploadPath(backend, secretPath), Buffer.from(bot.botSecret, 'utf8')]
      ])
      if (!Array.isArray(upload) || upload.length !== 3 || upload.some((item) => item?.error)) {
        throw new Error('Failed to upload private WeCom CLI authentication files.')
      }
      const protect = await backend.execute(
        `chmod 700 ${shellQuote(launcherPath)} && chmod 600 ${shellQuote(botIdPath)} ${shellQuote(secretPath)}`
      )
      if (protect.exitCode !== 0)
        throw new Error(`Failed to protect WeCom CLI authentication files: ${boundedOutput(protect.output)}`)
      const result = await backend.execute(
        `${this.buildRuntimeEnvironment(connectorPaths.configDir, connectorPaths.tmpDir, config)} sh ${shellQuote(
          launcherPath
        )}`
      )
      if (result.exitCode !== 0) {
        throw new Error(`WeCom CLI authentication failed: ${redactOutput(result.output, bot)}`)
      }
      const lock = await backend.execute(
        `find ${shellQuote(connectorPaths.configDir)} -type d -exec chmod 700 {} + && find ${shellQuote(
          connectorPaths.configDir
        )} -type f -exec chmod 600 {} +`
      )
      if (lock.exitCode !== 0) throw new Error(`Failed to protect WeCom CLI credentials: ${boundedOutput(lock.output)}`)
    } catch (error) {
      authError = error
    }

    const cleanup = await backend.execute(
      `rm -f ${shellQuote(launcherPath)} ${shellQuote(botIdPath)} ${shellQuote(secretPath)}`
    )
    if (cleanup.exitCode !== 0) {
      cleanupError = new Error(
        `Failed to remove temporary WeCom CLI authentication files: ${boundedOutput(cleanup.output)}`
      )
    }
    if (authError && cleanupError) {
      throw new AggregateError(
        [authError, cleanupError],
        'WeCom CLI authentication failed and temporary secrets could not be removed.'
      )
    }
    if (authError) throw authError
    if (cleanupError) throw cleanupError

    const authStamp = JSON.stringify({ version: 1, fingerprint, authorizedAt: new Date().toISOString() })
    const write = await backend.execute(
      `printf '%s' ${shellQuote(authStamp)} > ${shellQuote(
        `${connectorPaths.authStampPath}.tmp`
      )} && chmod 600 ${shellQuote(`${connectorPaths.authStampPath}.tmp`)} && mv ${shellQuote(
        `${connectorPaths.authStampPath}.tmp`
      )} ${shellQuote(connectorPaths.authStampPath)}`
    )
    if (write.exitCode !== 0) throw new Error(`Failed to write WeCom CLI auth stamp: ${boundedOutput(write.output)}`)
  }

  private buildInstallCommand(paths: WeComCliRuntimePaths, config: WeComConnectorPluginConfig) {
    const args = [
      'npm install -g',
      `--prefix ${shellQuote(paths.runtimeDir)}`,
      `@wecom/cli@${shellQuote(WECOM_CLI_VERSION)}`
    ]
    if (config.npmRegistryUrl) args.push(`--registry ${shellQuote(config.npmRegistryUrl)}`)
    if (config.proxy) {
      args.push(`--proxy ${shellQuote(config.proxy)}`)
      args.push(`--https-proxy ${shellQuote(config.proxy)}`)
    }
    return args.join(' ')
  }

  private buildSkillsInstallCommand(paths: WeComCliRuntimePaths, config: WeComConnectorPluginConfig) {
    const archive = path.join(paths.tmpDir, `skills-${WECOM_CLI_SKILLS_REF}.tar.gz`)
    const curl = ['curl -fsSL']
    if (config.proxy) curl.push(`--proxy ${shellQuote(config.proxy)}`)
    curl.push(shellQuote(SKILLS_ARCHIVE_URL), `-o ${shellQuote(archive)}`)
    const checksum = `printf '%s  %s\n' ${shellQuote(WECOM_CLI_SKILLS_SHA256)} ${shellQuote(archive)} | sha256sum -c -`
    const archiveSkillsPath = `wecom-cli-${WECOM_CLI_SKILLS_REF}/skills`
    return [
      `mkdir -p ${shellQuote(paths.tmpDir)} ${shellQuote(path.dirname(paths.skillsDir))}`,
      curl.join(' '),
      checksum,
      `rm -rf ${shellQuote(paths.skillsDir)} && mkdir -p ${shellQuote(paths.skillsDir)}`,
      `tar -xzf ${shellQuote(archive)} -C ${shellQuote(paths.skillsDir)} --strip-components=2 ${shellQuote(
        archiveSkillsPath
      )}`,
      `rm -f ${shellQuote(archive)}`
    ].join(' && ')
  }

  private buildRuntimeEnvironment(configDir: string, tmpDir: string, config: WeComConnectorPluginConfig) {
    const values = [`WECOM_CLI_CONFIG_DIR=${shellQuote(configDir)}`, `WECOM_CLI_TMP_DIR=${shellQuote(tmpDir)}`]
    if (config.proxy) {
      values.push(`HTTP_PROXY=${shellQuote(config.proxy)}`)
      values.push(`HTTPS_PROXY=${shellQuote(config.proxy)}`)
    }
    return `env ${values.join(' ')}`
  }
}

function readBotCredential(value: Record<string, unknown>): WeComBotCredential {
  return {
    botId: requireString(value.botId, 'WeCom connector Bot ID is missing.'),
    botSecret: requireString(value.botSecret, 'WeCom connector Bot Secret is missing.')
  }
}

async function readJsonFile<T>(backend: WeComCliBackend, filePath: string): Promise<T | null> {
  const result = await backend.execute(`cat ${shellQuote(filePath)} 2>/dev/null || true`)
  const output = result.output.trim()
  if (!output) return null
  try {
    return JSON.parse(output) as T
  } catch {
    return null
  }
}

function normalizeAbsolutePath(value: unknown): string | undefined {
  const normalized = readString(value)
  return normalized && path.isAbsolute(normalized) ? path.normalize(normalized) : undefined
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function toUploadPath(backend: WeComCliBackend, targetPath: string): string {
  const normalizedTarget = path.normalize(targetPath)
  const workingDirectory = normalizeAbsolutePath(backend.workingDirectory)
  if (!workingDirectory || !path.isAbsolute(normalizedTarget)) return normalizedTarget
  const relative = path.relative(workingDirectory, normalizedTarget)
  if (!relative || path.isAbsolute(relative) || relative.startsWith('../')) return normalizedTarget
  return relative
}

function boundedOutput(output: string | undefined): string {
  const normalized = readString(output) ?? 'Unknown error'
  return normalized.length > 1_000 ? `${normalized.slice(0, 1_000)}...` : normalized
}

function redactOutput(output: string | undefined, bot: WeComBotCredential): string {
  return boundedOutput(output).split(bot.botId).join('[REDACTED]').split(bot.botSecret).join('[REDACTED]')
}
