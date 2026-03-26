import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import {
  BaseSandbox,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  DEFAULT_MARKITDOWN_VERSION,
  DEFAULT_MARKITDOWN_SKILLS_DIR,
  DEFAULT_MARKITDOWN_STAMP_PATH,
  MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION,
  MarkItDownConfig,
  MarkItDownConfigSchema
} from './markitdown.types.js'
import { MarkItDownPluginName } from './types.js'
import {
  getSkillAssets,
  getSkillDescription,
  type MarkItDownSkillAsset
} from './skills/index.js'

type MarkItDownBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles'>
type MarkItDownBootstrapStamp = {
  tool?: string
  version?: string
  extras?: string
  skillsDir?: string
  pipIndexUrl?: string
  pipExtraIndexUrl?: string
  bootstrapVersion?: number
  installedAt?: string
}

type ExecutableInfo = {
  executable: string
  tokens: string[]
  index: number
}

@Injectable()
export class MarkItDownBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<MarkItDownConfig>): MarkItDownConfig {
    const defaults: MarkItDownConfig = {
      version: process.env['MARKITDOWN_VERSION'] || DEFAULT_MARKITDOWN_VERSION,
      skillsDir: process.env['MARKITDOWN_SKILLS_DIR'] || DEFAULT_MARKITDOWN_SKILLS_DIR,
      extras: process.env['MARKITDOWN_EXTRAS'] || 'all'
    }
    const pluginConfig =
      this.pluginConfigResolver?.resolve<MarkItDownConfig>(MarkItDownPluginName, {
        defaults
      }) ?? defaults
    const middlewareConfig = MarkItDownConfigSchema.partial().parse(config ?? {})

    return MarkItDownConfigSchema.parse({
      ...defaults,
      ...pluginConfig,
      ...middlewareConfig
    })
  }

  buildPipIndexArgs(config: MarkItDownConfig): string {
    const args: string[] = []
    if (config.pipIndexUrl) {
      args.push(`--index-url ${shellQuote(config.pipIndexUrl)}`)
    }
    if (config.pipExtraIndexUrl) {
      args.push(`--extra-index-url ${shellQuote(config.pipExtraIndexUrl)}`)
    }
    return args.length > 0 ? ` ${args.join(' ')}` : ''
  }

  getStampPath(): string {
    return DEFAULT_MARKITDOWN_STAMP_PATH
  }

  buildSystemPrompt(config = this.resolveConfig()): string {
    const skillPath = path.join(config.skillsDir, 'SKILL.md')

    return [
      '<skill>',
      getSkillDescription(),
      '',
      'Always run MarkItDown through the `sandbox_shell` tool using the `markitdown` command.',
      `Before your first use, read the skill file at \`${skillPath}\` with \`cat ${shellQuote(skillPath)}\`.`,
      '</skill>'
    ].join('\n')
  }

  isMarkItDownCommand(command: string): boolean {
    return this.getExecutableInfos(command).some(({ executable }) =>
      isMarkItDownExecutableToken(executable)
    )
  }

  async ensureBootstrap(backend: MarkItDownBootstrapBackend, config = this.resolveConfig()) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for MarkItDown bootstrap.')
    }

    const stampPath = this.getStampPath()
    const bootstrapAssets = this.getBootstrapAssets(config)
    const stamp = await this.readStamp(backend, stampPath)
    const binaryReady = await this.commandExists(backend, 'markitdown')
    const assetsReady = binaryReady ? await this.areAssetsReady(backend, bootstrapAssets) : false
    const recordedConfigMatches =
      stamp?.version === config.version &&
      stamp?.extras === config.extras &&
      stamp?.pipIndexUrl === config.pipIndexUrl &&
      stamp?.pipExtraIndexUrl === config.pipExtraIndexUrl
    const stampMatches =
      recordedConfigMatches &&
      stamp?.bootstrapVersion === MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION
    const needsInstall = !binaryReady || (!!stamp && !recordedConfigMatches)
    const needsAssetRefresh = !assetsReady || !stampMatches

    if (!needsInstall && !needsAssetRefresh) {
      return { output: 'already bootstrapped', exitCode: 0, truncated: false }
    }

    if (needsInstall) {
      const pipCheck = await backend.execute('which pip3 2>/dev/null || which pip 2>/dev/null')
      if (pipCheck?.exitCode !== 0 || !pipCheck?.output?.trim()) {
        throw new Error(
          'Python pip is not available in the sandbox. MarkItDown requires Python with pip to be pre-installed.'
        )
      }
      const pipCmd = pipCheck.output.trim().split('\n')[0]

      // --break-system-packages is needed for PEP 668 compliant environments
      // (Debian/Ubuntu with externally-managed Python). Safe in a disposable sandbox.
      const versionSpec = config.version === 'latest' ? '' : `==${config.version}`
      const extrasSpec = config.extras ? `[${config.extras}]` : ''
      const pipIndexArgs = this.buildPipIndexArgs(config)
      const installCmd = `${pipCmd} install --break-system-packages${pipIndexArgs} "markitdown${extrasSpec}${versionSpec}"`
      const installResult = await backend.execute(installCmd)
      if (installResult?.exitCode !== 0) {
        throw new Error(`MarkItDown install failed: ${installResult?.output || 'Unknown error'}`)
      }
    }

    await this.writeAssets(backend, bootstrapAssets)
    await this.writeStamp(backend, config)

    return {
      output: needsInstall ? 'bootstrapped markitdown' : 'refreshed markitdown bootstrap',
      exitCode: 0,
      truncated: false
    }
  }

  private getBootstrapAssets(config: MarkItDownConfig): MarkItDownSkillAsset[] {
    return getSkillAssets(config.skillsDir)
  }

  private async readStamp(backend: MarkItDownBootstrapBackend, stampPath: string) {
    const stampCheck = await backend.execute(`cat ${shellQuote(stampPath)} 2>/dev/null || echo ''`)
    const stampContent = stampCheck?.output?.trim() ?? ''

    if (!stampContent) {
      return null
    }

    try {
      return JSON.parse(stampContent) as MarkItDownBootstrapStamp
    } catch {
      return null
    }
  }

  private async commandExists(backend: MarkItDownBootstrapBackend, command: string) {
    const result = await backend.execute(`which ${command} 2>/dev/null`)
    return result?.exitCode === 0 && !!result?.output?.trim()
  }

  private async areAssetsReady(
    backend: MarkItDownBootstrapBackend,
    assets: MarkItDownSkillAsset[]
  ) {
    const checks = assets.map((asset) => `test -f ${shellQuote(asset.path)}`).join(' && ')
    const result = await backend.execute(checks)
    return result?.exitCode === 0
  }

  private async writeStamp(backend: MarkItDownBootstrapBackend, config: MarkItDownConfig) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      tool: 'markitdown',
      version: config.version,
      extras: config.extras,
      skillsDir: config.skillsDir,
      pipIndexUrl: config.pipIndexUrl,
      pipExtraIndexUrl: config.pipExtraIndexUrl,
      bootstrapVersion: MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    const result = await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write MarkItDown bootstrap stamp: ${result?.output || 'Unknown error'}`)
    }
  }

  private async writeAssets(
    backend: MarkItDownBootstrapBackend,
    assets: MarkItDownSkillAsset[]
  ) {
    const canUploadDirectly =
      typeof backend.uploadFiles === 'function' && assets.every((asset) => !path.isAbsolute(asset.path))

    if (canUploadDirectly) {
      const results = await backend.uploadFiles(
        assets.map(({ path, content }) => [path, Buffer.from(content, 'utf8')])
      )
      const failed = results?.filter((result) => result.error)
      if (failed?.length) {
        throw new Error(`Failed to write MarkItDown skill assets: ${failed.map((item) => item.path).join(', ')}`)
      }
      return
    }

    for (const asset of assets) {
      const dir = path.dirname(asset.path)
      const result = await backend.execute(
        `mkdir -p ${shellQuote(dir)} && cat <<'__XPERT_MARKITDOWN_EOF__' > ${shellQuote(asset.path)}\n${asset.content}\n__XPERT_MARKITDOWN_EOF__`
      )
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to write MarkItDown skill asset ${asset.path}: ${result?.output || 'Unknown error'}`)
      }
    }
  }

  private getExecutableInfos(command: string): ExecutableInfo[] {
    if (!command) {
      return []
    }

    return splitShellSegments(command)
      .map(getExecutableInfo)
      .filter((item): item is ExecutableInfo => !!item)
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function splitShellSegments(command: string) {
  const segments: string[] = []
  let buffer = ''
  let quote: '"' | "'" | null = null
  let escaped = false

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
      pushSegment(segments, buffer)
      buffer = ''
      continue
    }

    if ((character === '&' && next === '&') || (character === '|' && next === '|')) {
      pushSegment(segments, buffer)
      buffer = ''
      index += 1
      continue
    }

    if (character === '|') {
      pushSegment(segments, buffer)
      buffer = ''
      continue
    }

    buffer += character
  }

  pushSegment(segments, buffer)
  return segments
}

function pushSegment(segments: string[], value: string) {
  const trimmed = value.trim()
  if (trimmed) {
    segments.push(trimmed)
  }
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

function isMarkItDownExecutableToken(token: string) {
  return path.basename(token) === 'markitdown'
}
