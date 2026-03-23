import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import { BaseSandbox } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import {
  DEFAULT_ZIP_UNZIP_SKILLS_DIR,
  DEFAULT_ZIP_UNZIP_STAMP_PATH,
  ZIP_UNZIP_BOOTSTRAP_SCHEMA_VERSION,
  ZipUnzipConfig,
  ZipUnzipConfigSchema
} from './zip-unzip.types.js'
import { getSkillAssets, type ZipUnzipSkillAsset } from './skills/index.js'

type ZipUnzipBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles'>

type ZipUnzipBootstrapStamp = {
  tool?: string
  packages?: string[]
  bootstrapVersion?: number
  installedAt?: string
}

type ExecutableInfo = {
  executable: string
  tokens: string[]
  index: number
}

@Injectable()
export class ZipUnzipBootstrapService {
  resolveConfig(config?: Partial<ZipUnzipConfig>): ZipUnzipConfig {
    return ZipUnzipConfigSchema.parse(config ?? {})
  }

  getStampPath() {
    return DEFAULT_ZIP_UNZIP_STAMP_PATH
  }

  buildSystemPrompt(config = this.resolveConfig()) {
    return [
      'The system `zip` and `unzip` commands are available in the sandbox through this middleware.',
      'Always use `zip` and `unzip` through the `sandbox_shell` tool.',
      `Before your first use, read the skill file at \`${DEFAULT_ZIP_UNZIP_SKILLS_DIR}/SKILL.md\` with \`cat ${DEFAULT_ZIP_UNZIP_SKILLS_DIR}/SKILL.md\`.`,
      'Use Ubuntu/Linux shell syntax.',
      'Avoid interactive commands in the sandbox.',
      'Do not use `zip -e`; it prompts for a password and will be blocked.',
      'If the user explicitly provided a password and accepts the command-line exposure risk, use `zip -P <password>` or `unzip -P <password>` instead.',
      'When extracting into a directory that may already contain files, explicitly choose `unzip -o` or `unzip -n`.',
      '',
      'COMMON EXAMPLES:',
      '- `zip -r archive.zip folder/`',
      '- `zip -r archive.zip folder/ -x "*.log" "*/node_modules/*"`',
      '- `unzip archive.zip`',
      '- `unzip archive.zip -d /tmp/output`',
      '- `unzip -l archive.zip`',
      '- `unzip -t archive.zip`',
      '',
      `For end-to-end workflows, read \`${DEFAULT_ZIP_UNZIP_SKILLS_DIR}/references/common-workflows.md\`.`
    ].join('\n')
  }

  isZipCommand(command: string) {
    return this.getExecutableInfos(command).some(({ executable }) => isZipExecutableToken(executable))
  }

  isUnzipCommand(command: string) {
    return this.getExecutableInfos(command).some(({ executable }) => isUnzipExecutableToken(executable))
  }

  isZipUnzipCommand(command: string) {
    return this.isZipCommand(command) || this.isUnzipCommand(command)
  }

  isInteractiveZipPasswordCommand(command: string) {
    return this.getExecutableInfos(command).some(({ executable, tokens, index }) => {
      if (!isZipExecutableToken(executable)) {
        return false
      }

      for (const rawToken of tokens.slice(index + 1)) {
        const token = stripOuterQuotes(rawToken)
        if (token === '--') {
          break
        }
        if (token === '-e' || /^-[A-Za-z]*e[A-Za-z]*$/.test(token)) {
          return true
        }
      }

      return false
    })
  }

  assertSupportedCommand(command: string) {
    if (this.isInteractiveZipPasswordCommand(command)) {
      throw new Error(
        'Interactive `zip -e` password prompts are not supported in sandbox_shell. If the user already provided a password, use `zip -P <password>` instead, or create an unencrypted archive.'
      )
    }
  }

  async ensureBootstrap(backend: ZipUnzipBootstrapBackend | null, config = this.resolveConfig()) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for Zip/Unzip bootstrap.')
    }

    const stampPath = this.getStampPath()
    const bootstrapAssets = this.getBootstrapAssets()
    const stampCheck = await backend.execute(`cat ${shellQuote(stampPath)} 2>/dev/null || echo ''`)
    const stampContent = stampCheck?.output?.trim() ?? ''

    let stampMatches = false
    if (stampContent) {
      try {
        const stamp = JSON.parse(stampContent) as ZipUnzipBootstrapStamp
        stampMatches = stamp.bootstrapVersion === ZIP_UNZIP_BOOTSTRAP_SCHEMA_VERSION
      } catch {
        stampMatches = false
      }
    }

    let zipExists = await this.commandExists(backend, 'zip')
    let unzipExists = await this.commandExists(backend, 'unzip')

    if (stampMatches && zipExists && unzipExists) {
      return { output: 'already bootstrapped', exitCode: 0, truncated: false }
    }

    if (!zipExists || !unzipExists) {
      const aptCheck = await backend.execute('which apt 2>/dev/null')
      if (aptCheck?.exitCode !== 0 || !aptCheck?.output?.trim()) {
        throw new Error('The sandbox is missing `apt`, so zip/unzip cannot be installed automatically.')
      }

      const installResult = await backend.execute(
        'DEBIAN_FRONTEND=noninteractive apt update && DEBIAN_FRONTEND=noninteractive apt install -y zip unzip'
      )
      if (installResult?.exitCode !== 0) {
        throw new Error(`zip/unzip install failed: ${installResult?.output || 'Unknown error'}`)
      }

      zipExists = await this.commandExists(backend, 'zip')
      unzipExists = await this.commandExists(backend, 'unzip')
      if (!zipExists || !unzipExists) {
        throw new Error('zip/unzip install completed but the binaries are still missing from PATH.')
      }
    }

    await this.writeAssets(backend, bootstrapAssets)
    await this.writeStamp(backend)

    return {
      output: stampMatches ? 'refreshed zip/unzip bootstrap' : 'bootstrapped zip/unzip',
      exitCode: 0,
      truncated: false
    }
  }

  private getBootstrapAssets(): ZipUnzipSkillAsset[] {
    return getSkillAssets(DEFAULT_ZIP_UNZIP_SKILLS_DIR)
  }

  private async commandExists(backend: ZipUnzipBootstrapBackend, command: 'zip' | 'unzip') {
    const result = await backend.execute(`which ${command} 2>/dev/null`)
    return result?.exitCode === 0 && !!result?.output?.trim()
  }

  private async writeStamp(backend: ZipUnzipBootstrapBackend) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      tool: 'zip-unzip',
      packages: ['zip', 'unzip'],
      bootstrapVersion: ZIP_UNZIP_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    const result = await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )

    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write Zip/Unzip bootstrap stamp: ${result?.output || 'Unknown error'}`)
    }
  }

  private async writeAssets(
    backend: ZipUnzipBootstrapBackend,
    assets: ZipUnzipSkillAsset[]
  ) {
    const canUploadDirectly =
      typeof backend.uploadFiles === 'function' && assets.every((asset) => !path.isAbsolute(asset.path))

    if (canUploadDirectly) {
      const results = await backend.uploadFiles(
        assets.map(({ path, content }) => [path, Buffer.from(content, 'utf8')])
      )
      const failed = results?.filter((result) => result.error)
      if (failed?.length) {
        throw new Error(`Failed to write Zip/Unzip skill assets: ${failed.map((item) => item.path).join(', ')}`)
      }
      return
    }

    for (const asset of assets) {
      const dir = path.dirname(asset.path)
      const result = await backend.execute(
        `mkdir -p ${shellQuote(dir)} && cat <<'__XPERT_ZIP_UNZIP_EOF__' > ${shellQuote(asset.path)}\n${asset.content}\n__XPERT_ZIP_UNZIP_EOF__`
      )
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to write Zip/Unzip skill asset ${asset.path}: ${result?.output || 'Unknown error'}`)
      }
    }
  }

  private getExecutableInfos(command: string): ExecutableInfo[] {
    if (!command) {
      return []
    }

    return splitShellSegments(command)
      .map(getExecutableInfo)
      .filter((value): value is ExecutableInfo => !!value)
  }
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

function isZipExecutableToken(token: string) {
  return token === 'zip' || token === '/usr/bin/zip'
}

function isUnzipExecutableToken(token: string) {
  return token === 'unzip' || token === '/usr/bin/unzip'
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}
