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
import {
  getSkillAssets,
  getSkillDescription,
  type ZipUnzipSkillAsset
} from './skills/index.js'

type ZipUnzipBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles'>
type BootstrapCommandResult = Awaited<ReturnType<ZipUnzipBootstrapBackend['execute']>>

type ZipUnzipBootstrapStamp = {
  tool?: string
  packages?: string[]
  bootstrapVersion?: number
  installedAt?: string
}

type BinaryCheck = {
  zipExists: boolean
  unzipExists: boolean
}

type ExecutableInfo = {
  executable: string
  tokens: string[]
  index: number
}

const DEFAULT_ZIP_UNZIP_LOCK_PATH = '/workspace/.xpert/.zip-unzip-bootstrap.lock'
const BOOTSTRAP_LOCK_TIMEOUT_SECONDS = 120
const BOOTSTRAP_LOCK_TIMEOUT_EXIT_CODE = 97
const BOOTSTRAP_LOCK_TIMEOUT_MARKER = '__ZIP_UNZIP_BOOTSTRAP_LOCK_TIMEOUT__'
const APT_LOCK_RETRY_DELAYS_MS = [2000, 4000, 8000, 12000, 16000, 20000] as const
const APT_LOCK_ERROR_PATTERNS = [
  'could not get lock',
  'unable to lock directory',
  'held by process',
  '/var/lib/apt/lists/lock',
  '/var/lib/dpkg/lock',
  '/var/lib/dpkg/lock-frontend'
] as const

@Injectable()
export class ZipUnzipBootstrapService {
  resolveConfig(config?: Partial<ZipUnzipConfig>): ZipUnzipConfig {
    return ZipUnzipConfigSchema.parse(config ?? {})
  }

  getStampPath() {
    return DEFAULT_ZIP_UNZIP_STAMP_PATH
  }

  buildSystemPrompt(config = this.resolveConfig()) {
    void config

    return [
      '<skill>',
      getSkillDescription(),
      '',
      `Before your first use, read the skill file at \`${DEFAULT_ZIP_UNZIP_SKILLS_DIR}/SKILL.md\` with \`cat ${DEFAULT_ZIP_UNZIP_SKILLS_DIR}/SKILL.md\`.`,
      '</skill>'
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

    let binaryCheck = await this.checkBinaries(backend)

    if (stampMatches && this.hasRequiredBinaries(binaryCheck)) {
      return { output: 'already bootstrapped', exitCode: 0, truncated: false }
    }

    if (!this.hasRequiredBinaries(binaryCheck)) {
      await this.assertAptGetAvailable(backend)
      await this.installPackagesWithRetry(backend)

      binaryCheck = await this.checkBinaries(backend)
      if (!this.hasRequiredBinaries(binaryCheck)) {
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

  private hasRequiredBinaries(binaryCheck: BinaryCheck) {
    return binaryCheck.zipExists && binaryCheck.unzipExists
  }

  private async checkBinaries(backend: ZipUnzipBootstrapBackend): Promise<BinaryCheck> {
    const [zipExists, unzipExists] = await Promise.all([
      this.commandExists(backend, 'zip'),
      this.commandExists(backend, 'unzip')
    ])

    return { zipExists, unzipExists }
  }

  private async commandExists(backend: ZipUnzipBootstrapBackend, command: 'zip' | 'unzip') {
    const result = await backend.execute(`which ${command} 2>/dev/null`)
    return result?.exitCode === 0 && !!result?.output?.trim()
  }

  private async assertAptGetAvailable(backend: ZipUnzipBootstrapBackend) {
    const aptGetCheck = await backend.execute('which apt-get 2>/dev/null')
    if (aptGetCheck?.exitCode !== 0 || !aptGetCheck?.output?.trim()) {
      throw new Error('The sandbox is missing `apt-get`, so zip/unzip cannot be installed automatically.')
    }
  }

  private async installPackagesWithRetry(backend: ZipUnzipBootstrapBackend) {
    for (let retryIndex = 0; retryIndex <= APT_LOCK_RETRY_DELAYS_MS.length; retryIndex += 1) {
      const attemptNumber = retryIndex + 1

      if (retryIndex > 0) {
        const binaryCheck = await this.checkBinaries(backend)
        if (this.hasRequiredBinaries(binaryCheck)) {
          return
        }
      }

      const installResult = await this.runLockedInstallAttempt(backend)
      const output = this.getResultOutput(installResult)

      if (installResult?.exitCode === 0) {
        return
      }

      if (this.isBootstrapLockTimeout(output, installResult)) {
        throw new Error(
          `zip/unzip bootstrap lock timed out after waiting ${BOOTSTRAP_LOCK_TIMEOUT_SECONDS} seconds. Last output: ${this.summarizeOutput(output)}`
        )
      }

      if (!this.isRetryableAptLockError(output)) {
        throw new Error(
          `zip/unzip install failed on attempt ${attemptNumber} with a non-retryable error. Last output: ${this.summarizeOutput(output)}`
        )
      }

      if (retryIndex === APT_LOCK_RETRY_DELAYS_MS.length) {
        throw new Error(
          `zip/unzip install failed after ${attemptNumber} attempts (${APT_LOCK_RETRY_DELAYS_MS.length} retries) due to apt lock. Last output: ${this.summarizeOutput(output)}`
        )
      }

      await this.sleep(APT_LOCK_RETRY_DELAYS_MS[retryIndex])
    }
  }

  // BaseSandbox.execute runs one shell command at a time, so locking and
  // installation must happen inside the same shell invocation.
  private async runLockedInstallAttempt(backend: ZipUnzipBootstrapBackend) {
    return backend.execute(this.buildLockedInstallCommand())
  }

  private buildLockedInstallCommand() {
    const lockPath = DEFAULT_ZIP_UNZIP_LOCK_PATH
    const lockDir = `${DEFAULT_ZIP_UNZIP_LOCK_PATH}.d`

    return [
      'set -eu',
      `LOCK_PATH=${shellQuote(lockPath)}`,
      `LOCK_DIR=${shellQuote(lockDir)}`,
      `LOCK_TIMEOUT=${BOOTSTRAP_LOCK_TIMEOUT_SECONDS}`,
      `LOCK_TIMEOUT_MARKER=${shellQuote(BOOTSTRAP_LOCK_TIMEOUT_MARKER)}`,
      'mkdir -p "$(dirname "$LOCK_PATH")"',
      'binaries_ready() {',
      '  command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1',
      '}',
      'run_install() {',
      '  if binaries_ready; then',
      "    echo 'zip/unzip already available inside bootstrap lock'",
      '    exit 0',
      '  fi',
      '  DEBIAN_FRONTEND=noninteractive apt-get update',
      '  DEBIAN_FRONTEND=noninteractive apt-get install -y zip unzip',
      '  if binaries_ready; then',
      "    echo 'zip/unzip installed successfully'",
      '    exit 0',
      '  fi',
      "  echo 'zip/unzip install completed but the binaries are still missing from PATH.' >&2",
      '  exit 1',
      '}',
      'if command -v flock >/dev/null 2>&1; then',
      '  exec 9>"$LOCK_PATH"',
      '  if ! flock -w "$LOCK_TIMEOUT" 9; then',
      '    echo "$LOCK_TIMEOUT_MARKER timed out waiting for zip/unzip bootstrap lock" >&2',
      `    exit ${BOOTSTRAP_LOCK_TIMEOUT_EXIT_CODE}`,
      '  fi',
      '  run_install',
      'fi',
      'cleanup_lock_dir() {',
      '  rmdir "$LOCK_DIR" 2>/dev/null || true',
      '}',
      'lock_waited=0',
      'while ! mkdir "$LOCK_DIR" 2>/dev/null; do',
      '  lock_waited=$((lock_waited + 1))',
      '  if [ "$lock_waited" -ge "$LOCK_TIMEOUT" ]; then',
      '    echo "$LOCK_TIMEOUT_MARKER timed out waiting for zip/unzip bootstrap lock" >&2',
      `    exit ${BOOTSTRAP_LOCK_TIMEOUT_EXIT_CODE}`,
      '  fi',
      '  sleep 1',
      'done',
      'trap cleanup_lock_dir EXIT INT TERM',
      'run_install'
    ].join('\n')
  }

  private isRetryableAptLockError(output: string) {
    const normalizedOutput = output.toLowerCase()
    return APT_LOCK_ERROR_PATTERNS.some((pattern) => normalizedOutput.includes(pattern))
  }

  private isBootstrapLockTimeout(output: string, result?: BootstrapCommandResult) {
    return (
      output.includes(BOOTSTRAP_LOCK_TIMEOUT_MARKER) ||
      result?.exitCode === BOOTSTRAP_LOCK_TIMEOUT_EXIT_CODE
    )
  }

  private getResultOutput(result?: BootstrapCommandResult) {
    const output = result?.output
    if (typeof output !== 'string' || !output.trim()) {
      return 'Unknown error'
    }
    return output.trim()
  }

  private summarizeOutput(output: string) {
    const normalized = output
      .replaceAll(BOOTSTRAP_LOCK_TIMEOUT_MARKER, '')
      .replace(/\s+/g, ' ')
      .trim()

    return normalized || 'Unknown error'
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
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
