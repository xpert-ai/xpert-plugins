import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import {
  BaseSandbox,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  DEFAULT_MINERU_CLI_SECRETS_DIR,
  DEFAULT_MINERU_CLI_SKILLS_DIR,
  DEFAULT_MINERU_SCRIPT_PATH,
  DEFAULT_MINERU_CLI_STAMP_PATH,
  DEFAULT_MINERU_CLI_TOKEN_PATH,
  MINERU_CLI_BOOTSTRAP_SCHEMA_VERSION,
  MinerUCliConfig,
  MinerUCliConfigSchema
} from './mineru-cli.types.js'
import { getSkillAssets, getSkillDescription, type MinerUSkillAsset } from './skills/index.js'
import { MinerUCliPluginName } from './types.js'

type MinerUBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>
type MinerUBootstrapStamp = {
  tool?: string
  bootstrapVersion?: number
  installedAt?: string
}

type ExecutableInfo = {
  executable: string
  tokens: string[]
  index: number
}

type ParsedShellSegment = {
  segment: string
  separator: string
}

@Injectable()
export class MinerUBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<MinerUCliConfig>): MinerUCliConfig {
    const defaults: MinerUCliConfig = {
      apiToken: normalizeString(process.env['MINERU_TOKEN'])
    }
    const pluginConfig =
      this.pluginConfigResolver?.resolve<MinerUCliConfig>(MinerUCliPluginName, {
        defaults
      }) ?? defaults
    const middlewareConfig = MinerUCliConfigSchema.partial().parse(config ?? {})

    return MinerUCliConfigSchema.parse({
      ...defaults,
      ...pluginConfig,
      ...middlewareConfig
    })
  }

  getStampPath() {
    return DEFAULT_MINERU_CLI_STAMP_PATH
  }

  getScriptPath() {
    return DEFAULT_MINERU_SCRIPT_PATH
  }

  getSecretDirPath() {
    return DEFAULT_MINERU_CLI_SECRETS_DIR
  }

  getTokenPath() {
    return DEFAULT_MINERU_CLI_TOKEN_PATH
  }

  buildSystemPrompt() {
    return [
      '<skill>',
      getSkillDescription(),
      '',
      'Always run MinerU through the `sandbox_shell` tool.',
      `Before your first use, read the skill file at \`${DEFAULT_MINERU_CLI_SKILLS_DIR}/SKILL.md\` with \`cat ${DEFAULT_MINERU_CLI_SKILLS_DIR}/SKILL.md\`.`,
      `Run the converter with \`python3 ${this.getScriptPath()}\`.`,
      'If this middleware has an API token configured, it will be securely provisioned inside the sandbox and read automatically by the MinerU script.',
      'Do not hardcode secrets in the command.',
      'If no token is configured, the script falls back to the lightweight MinerU API with stricter limits.',
      '</skill>'
    ].join('\n')
  }

  isMinerUCommand(command: string) {
    return this.getExecutableInfos(command).some((info) => this.getMinerUScriptTokenIndex(info) !== null)
  }

  async ensureBootstrap(backend: MinerUBootstrapBackend | null) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for MinerU bootstrap.')
    }

    const stampCheck = await backend.execute(
      `cat ${shellQuote(this.getStampPath())} 2>/dev/null || echo ''`
    )
    const stampContent = stampCheck?.output?.trim() ?? ''

    let stampMatches = false
    if (stampContent) {
      try {
        const stamp = JSON.parse(stampContent) as MinerUBootstrapStamp
        stampMatches = stamp.bootstrapVersion === MINERU_CLI_BOOTSTRAP_SCHEMA_VERSION
      } catch {
        stampMatches = false
      }
    }

    const pythonReady = await this.hasPython3(backend)
    if (!pythonReady) {
      throw new Error('Python 3 is not available in the sandbox. MinerU CLI requires `python3`.')
    }

    const assetsReady = await this.areAssetsReady(backend)
    if (stampMatches && assetsReady) {
      return { output: 'already bootstrapped', exitCode: 0, truncated: false }
    }

    await this.writeAssets(backend, this.getBootstrapAssets())
    await this.writeStamp(backend)

    return {
      output: stampMatches ? 'refreshed mineru bootstrap' : 'bootstrapped mineru',
      exitCode: 0,
      truncated: false
    }
  }

  async syncApiTokenSecret(
    backend: MinerUBootstrapBackend | null,
    config = this.resolveConfig()
  ) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for MinerU secret sync.')
    }

    const tokenPath = this.getTokenPath()
    if (!config.apiToken) {
      const result = await backend.execute(`rm -f ${shellQuote(tokenPath)}`)
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to remove MinerU API token file: ${result?.output || 'Unknown error'}`)
      }
      return { output: 'removed mineru api token', exitCode: 0, truncated: false }
    }

    if (typeof backend.uploadFiles !== 'function') {
      throw new Error('Sandbox backend does not support secure file uploads required for MinerU API tokens.')
    }

    const secretDirPath = this.getSecretDirPath()
    const prepareResult = await backend.execute(
      `mkdir -p ${shellQuote(secretDirPath)} && chmod 700 ${shellQuote(secretDirPath)}`
    )
    if (prepareResult?.exitCode !== 0) {
      throw new Error(`Failed to prepare MinerU secret directory: ${prepareResult?.output || 'Unknown error'}`)
    }

    const uploadPath = this.toUploadPath(backend, tokenPath)

    try {
      const uploadResults = await backend.uploadFiles([[uploadPath, Buffer.from(config.apiToken, 'utf8')]])
      if (!Array.isArray(uploadResults) || uploadResults.length !== 1 || uploadResults[0]?.error) {
        throw new Error(`Failed to upload MinerU API token file: ${tokenPath}`)
      }

      const chmodResult = await backend.execute(`chmod 600 ${shellQuote(tokenPath)}`)
      if (chmodResult?.exitCode !== 0) {
        throw new Error(`Failed to lock down MinerU API token file: ${chmodResult?.output || 'Unknown error'}`)
      }
    } catch (error) {
      const cleanupResult = await backend.execute(`rm -f ${shellQuote(tokenPath)}`)
      if (cleanupResult?.exitCode !== 0) {
        throw new Error(
          `${getErrorMessage(error)}; cleanup failed: ${cleanupResult?.output || 'Unknown error'}`
        )
      }
      if (error instanceof Error) {
        throw error
      }
      throw new Error(getErrorMessage(error))
    }

    return { output: 'synced mineru api token', exitCode: 0, truncated: false }
  }

  private getBootstrapAssets(): MinerUSkillAsset[] {
    return getSkillAssets()
  }

  private getExecutableInfos(command: string) {
    return parseShellCommand(command)
      .map(({ segment }) => getExecutableInfo(segment))
      .filter((item): item is ExecutableInfo => !!item)
  }

  private getMinerUScriptTokenIndex(info: ExecutableInfo) {
    if (!isPythonExecutableToken(info.executable)) {
      return null
    }

    const scriptTokenIndex = findPythonScriptTokenIndex(info.tokens, info.index + 1)
    if (scriptTokenIndex === null) {
      return null
    }

    const expectedScriptPath = path.normalize(this.getScriptPath())
    const token = path.normalize(stripOuterQuotes(info.tokens[scriptTokenIndex]))
    return token === expectedScriptPath ? scriptTokenIndex : null
  }

  private toUploadPath(backend: MinerUBootstrapBackend, targetPath: string) {
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

  private async hasPython3(backend: MinerUBootstrapBackend) {
    const result = await backend.execute('which python3 2>/dev/null')
    return result?.exitCode === 0 && !!result?.output?.trim()
  }

  private async areAssetsReady(backend: MinerUBootstrapBackend) {
    const assets = this.getBootstrapAssets()
    const checks = assets.map((asset) => `test -f ${shellQuote(asset.path)}`).join(' && ')
    const result = await backend.execute(checks)
    return result?.exitCode === 0
  }

  private async writeStamp(backend: MinerUBootstrapBackend) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      tool: 'mineru-cli',
      bootstrapVersion: MINERU_CLI_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )
  }

  private async writeAssets(
    backend: MinerUBootstrapBackend,
    assets: MinerUSkillAsset[]
  ) {
    const canUploadDirectly =
      typeof backend.uploadFiles === 'function' && assets.every((asset) => !path.isAbsolute(asset.path))

    if (canUploadDirectly) {
      const results = await backend.uploadFiles(
        assets.map(({ path, content }) => [path, Buffer.from(content, 'utf8')])
      )
      const failed = results?.filter((result) => result.error)
      if (failed?.length) {
        throw new Error(`Failed to write MinerU skill assets: ${failed.map((item) => item.path).join(', ')}`)
      }
      return
    }

    for (const asset of assets) {
      const dir = path.dirname(asset.path)
      const result = await backend.execute(
        `mkdir -p ${shellQuote(dir)} && cat <<'__XPERT_MINERU_EOF__' > ${shellQuote(asset.path)}\n${asset.content}\n__XPERT_MINERU_EOF__`
      )
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to write MinerU skill asset ${asset.path}: ${result?.output || 'Unknown error'}`)
      }
    }
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error) {
    return error
  }
  return 'Unknown error'
}

function parseShellCommand(command: string) {
  const segments: ParsedShellSegment[] = []
  let buffer = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  const pushSegment = (separator = '') => {
    if (buffer || separator) {
      segments.push({
        segment: buffer,
        separator
      })
      buffer = ''
    }
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    const next = index + 1 < command.length ? command[index + 1] : ''

    if (escaped) {
      buffer += character
      escaped = false
      continue
    }

    if (character === '\\') {
      buffer += character
      escaped = true
      continue
    }

    if (quote) {
      buffer += character
      if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      buffer += character
      continue
    }

    if (character === ';') {
      pushSegment(';')
      continue
    }

    if ((character === '&' && next === '&') || (character === '|' && next === '|')) {
      pushSegment(`${character}${next}`)
      index += 1
      continue
    }

    if (character === '|') {
      pushSegment('|')
      continue
    }

    buffer += character
  }

  pushSegment('')
  return segments
}

function getExecutableInfo(segment: string): ExecutableInfo | null {
  const tokens = tokenizeShellSegment(segment)
  if (!tokens.length) {
    return null
  }

  let index = 0

  if (stripOuterQuotes(tokens[index]) === 'env') {
    index += 1
    while (index < tokens.length) {
      const token = stripOuterQuotes(tokens[index])
      if (token.startsWith('-')) {
        index += 1
        continue
      }
      if (isEnvAssignmentToken(token)) {
        index += 1
        continue
      }
      break
    }
  } else {
    while (index < tokens.length && isEnvAssignmentToken(stripOuterQuotes(tokens[index]))) {
      index += 1
    }
  }

  if (index >= tokens.length) {
    return null
  }

  return {
    executable: stripOuterQuotes(tokens[index]),
    tokens,
    index
  }
}

function tokenizeShellSegment(segment: string) {
  const tokens: string[] = []
  let buffer = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index]

    if (escaped) {
      buffer += character
      escaped = false
      continue
    }

    if (character === '\\') {
      buffer += character
      escaped = true
      continue
    }

    if (quote) {
      buffer += character
      if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      buffer += character
      continue
    }

    if (/\s/.test(character)) {
      if (buffer) {
        tokens.push(buffer)
        buffer = ''
      }
      continue
    }

    buffer += character
  }

  if (buffer) {
    tokens.push(buffer)
  }

  return tokens
}

function isEnvAssignmentToken(token: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(token)
}

function stripOuterQuotes(token: string) {
  if (
    token.length >= 2 &&
    ((token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith('"') && token.endsWith('"')))
  ) {
    return token.slice(1, -1)
  }
  return token
}

function isPythonExecutableToken(token: string) {
  return token === 'python' || token === 'python3' || token === '/usr/bin/python' || token === '/usr/bin/python3'
}

function findPythonScriptTokenIndex(tokens: string[], startIndex: number) {
  let index = startIndex

  while (index < tokens.length) {
    const token = stripOuterQuotes(tokens[index])

    if (token === '-m' || token === '-c' || token === '-') {
      return null
    }

    if (isPythonInterpreterFlagWithSeparateValue(token)) {
      if (index + 1 >= tokens.length) {
        return null
      }
      index += 2
      continue
    }

    if (hasAttachedPythonInterpreterFlagValue(token) || isPythonInterpreterFlagWithoutValue(token)) {
      index += 1
      continue
    }

    if (token.startsWith('-')) {
      return null
    }

    return index
  }

  return null
}

function isPythonInterpreterFlagWithSeparateValue(token: string) {
  return token === '-X' || token === '-W' || token === '--check-hash-based-pycs'
}

function hasAttachedPythonInterpreterFlagValue(token: string) {
  return (
    (token.startsWith('-X') && token !== '-X') ||
    (token.startsWith('-W') && token !== '-W') ||
    token.startsWith('--check-hash-based-pycs=')
  )
}

function isPythonInterpreterFlagWithoutValue(token: string) {
  return token === '--help' || token === '--version' || /^-[bBdEhiIOPqsSuvVx]+$/.test(token)
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}
