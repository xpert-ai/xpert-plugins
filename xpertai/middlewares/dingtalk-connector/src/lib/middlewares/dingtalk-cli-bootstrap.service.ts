import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { posix as path } from 'node:path'
import { Injectable } from '@nestjs/common'
import { BaseSandbox, type ConnectorRuntimeCredential, type ConnectorRuntimeCredentialV2 } from '@xpert-ai/plugin-sdk'

const DEFAULT_WORKSPACE_ROOT = '/workspace'
const DINGTALK_CLI_PACKAGE = 'dingtalk-workspace-cli'
export const DINGTALK_CLI_VERSION = '1.0.60'
const DINGTALK_CLI_BOOTSTRAP_VERSION = 1

type DingTalkCliBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>

export type DingTalkCliRuntimePaths = {
  workspaceRoot: string
  skillsDir: string
  stampPath: string
  runtimeRoot: string
  bootstrapConfigDir: string
}

export type DingTalkCliCredentialPaths = {
  envDir: string
  envPath: string
  configDir: string
  cacheDir: string
}

type DingTalkBootstrapStamp = {
  cliVersion?: string
  bootstrapVersion?: number
}

@Injectable()
export class DingTalkCliBootstrapService {
  resolveRuntimePaths(context?: { workspaceRoot?: string | null; workingDirectory?: string | null }) {
    const workspaceRoot =
      normalizeAbsolutePath(context?.workspaceRoot) ??
      normalizeAbsolutePath(context?.workingDirectory) ??
      DEFAULT_WORKSPACE_ROOT
    const xpertDir = path.join(workspaceRoot, '.xpert')

    return {
      workspaceRoot,
      skillsDir: path.join(workspaceRoot, '.agents', 'skills'),
      stampPath: path.join(xpertDir, '.dingtalk-cli-bootstrap.json'),
      runtimeRoot: path.join(xpertDir, 'dingtalk-cli'),
      bootstrapConfigDir: path.join(xpertDir, 'dingtalk-cli', 'bootstrap-config')
    } satisfies DingTalkCliRuntimePaths
  }

  buildSystemPrompt(paths = this.resolveRuntimePaths()) {
    return [
      '<skill>',
      'DingTalk Workspace CLI (dws) is the only business-operation interface for this DingTalk connector.',
      '',
      '## Authentication',
      '- Call `dingtalk-cli-auth-ensure` before the first DingTalk operation.',
      '- Authentication comes from the active Xpert workspace connector using DWS-managed OAuth. Never run `dws auth`.',
      '- Never provide `--token`, `--client-id`, or `--client-secret`; the connector injects credentials securely.',
      '- If a command exits with code 4 and returns host-owned PAT scopes, inspect the requested scopes and use `dws pat chmod`.',
      '- Preview PAT grants with `--dry-run --format json`, ask for explicit user confirmation, then repeat with `--yes` and retry the original command once.',
      '',
      '## Usage',
      '- Run DingTalk operations through `sandbox_shell` with the `dws` command.',
      '- Prefer product commands such as `dws contact`, `dws chat`, `dws calendar`, `dws doc`, and `dws todo`.',
      '- Raw `dws api` calls and application-robot commands are unavailable because this connector provides a user OAuth credential, not application credentials.',
      '- Use `--format json` and bounded filters or pagination for machine-readable, limited results.',
      '- Run mutations with `--dry-run` first. Add `--yes` only after the user explicitly confirms the exact operation.',
      '- Never print environment variables, credential files, access tokens, refresh tokens, or application secrets.',
      '',
      `Read the official DingTalk skill files under \`${paths.skillsDir}/dingtalk-*\` before selecting commands and parameters.`,
      '</skill>'
    ].join('\n')
  }

  isDwsCommand(command: string) {
    return /^\s*dws(?=\s|$)/i.test(command)
  }

  validateAgentCommand(command: string) {
    if (!this.isDwsCommand(command)) return
    if (hasUnsafeShellSyntax(command)) {
      throw new Error('DingTalk CLI requests must contain exactly one dws command without shell control operators')
    }
    if (/\.xpert|\/secrets(?:\/|$)/i.test(command)) {
      throw new Error('DingTalk CLI requests cannot access Xpert runtime or secret paths')
    }
    if (/\bdws\b[\s\S]*?\bauth\b/i.test(command)) {
      throw new Error(
        'DingTalk CLI authentication is managed by the Xpert connector; dws auth commands are not allowed'
      )
    }
    if (/^\s*dws\s+api(?=\s|$)/i.test(command)) {
      throw new Error(
        'Raw dws api commands require application credentials and are unavailable with the user OAuth credential'
      )
    }
    if (isApplicationRobotCommand(command)) {
      throw new Error(
        'DingTalk application-robot commands require Robot Code and are unavailable with the user OAuth credential'
      )
    }
    if (/(^|\s)--(?:token|client-id|client-secret)(?:=|\s|$)/i.test(command)) {
      throw new Error(
        'DingTalk CLI credential flags are managed by the Xpert connector and cannot be supplied by the Agent'
      )
    }
    if (/\b(?:DINGTALK_|DWS_CONFIG_DIR|DWS_CACHE_DIR)/.test(command)) {
      throw new Error('DingTalk credential environment variables cannot be referenced by the Agent')
    }
  }

  async ensureBootstrap(backend: DingTalkCliBackend, paths?: DingTalkCliRuntimePaths) {
    const runtimePaths = paths ?? this.resolveRuntimePaths({ workingDirectory: backend.workingDirectory })
    const stamp = await this.readStamp(backend, runtimePaths)
    const cliReady = await this.isCliReady(backend)
    const skillsReady = await this.areSkillsReady(backend, runtimePaths)
    const stampMatches =
      stamp?.cliVersion === DINGTALK_CLI_VERSION && stamp?.bootstrapVersion === DINGTALK_CLI_BOOTSTRAP_VERSION

    if (cliReady && skillsReady && stampMatches) {
      return { output: 'already bootstrapped', exitCode: 0, truncated: false }
    }

    const npmReady = await backend.execute('command -v npm >/dev/null 2>&1')
    if (npmReady.exitCode !== 0) {
      throw new Error('npm is not available in the sandbox. DingTalk Workspace CLI requires npm for bootstrap.')
    }

    const installed = await backend.execute(
      `npm install -g ${DINGTALK_CLI_PACKAGE}@${DINGTALK_CLI_VERSION} --no-audit --no-fund 2>&1`
    )
    if (installed.exitCode !== 0) {
      throw new Error(`Failed to install DingTalk Workspace CLI: ${installed.output || 'Unknown error'}`)
    }

    const prepared = await backend.execute(
      `mkdir -p ${shellQuote(runtimePaths.bootstrapConfigDir)} ${shellQuote(runtimePaths.skillsDir)} && ` +
        `chmod 700 ${shellQuote(runtimePaths.bootstrapConfigDir)}`
    )
    if (prepared.exitCode !== 0) {
      throw new Error(`Failed to prepare DingTalk CLI directories: ${prepared.output || 'Unknown error'}`)
    }

    const skills = await backend.execute(
      [
        `HOME=${shellQuote(runtimePaths.workspaceRoot)}`,
        `DWS_CONFIG_DIR=${shellQuote(runtimePaths.bootstrapConfigDir)}`,
        'DWS_DISABLE_KEYCHAIN=1',
        'dws skill setup --mode multi --target agents --yes --format json'
      ].join(' ')
    )
    if (skills.exitCode !== 0) {
      throw new Error(`Failed to install DingTalk Agent Skills: ${skills.output || 'Unknown error'}`)
    }

    await this.writeStamp(backend, runtimePaths)
    return { output: 'bootstrapped DingTalk Workspace CLI', exitCode: 0, truncated: false }
  }

  async syncConnectorCredential(
    backend: DingTalkCliBackend,
    credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
    paths?: DingTalkCliRuntimePaths
  ) {
    if (typeof backend.uploadFiles !== 'function') {
      throw new Error('DingTalk CLI requires secure sandbox uploads for connector credentials')
    }
    if (!credential.connectorId) {
      throw new Error('DingTalk connector runtime credential is missing connectorId')
    }

    const runtimePaths = paths ?? this.resolveRuntimePaths({ workingDirectory: backend.workingDirectory })
    const credentialPaths = this.getCredentialPaths(credential.connectorId, runtimePaths)
    const prepared = await backend.execute(
      `mkdir -p ${shellQuote(credentialPaths.envDir)} ${shellQuote(credentialPaths.configDir)} ${shellQuote(
        credentialPaths.cacheDir
      )} && ` +
        `chmod 700 ${shellQuote(credentialPaths.envDir)} ${shellQuote(credentialPaths.configDir)} ${shellQuote(
          credentialPaths.cacheDir
        )}`
    )
    if (prepared.exitCode !== 0) {
      throw new Error(`Failed to prepare DingTalk CLI credential directories: ${prepared.output || 'Unknown error'}`)
    }

    const uploadPath = toUploadPath(backend, credentialPaths.envPath)
    const uploaded = await backend.uploadFiles([
      [uploadPath, Buffer.from(buildCredentialEnv(credential, runtimePaths, credentialPaths), 'utf8')]
    ])
    if (!Array.isArray(uploaded) || uploaded.length !== 1 || uploaded[0]?.error) {
      throw new Error('Failed to upload DingTalk CLI connector credential file')
    }

    const protectedFile = await backend.execute(`chmod 600 ${shellQuote(credentialPaths.envPath)}`)
    if (protectedFile.exitCode !== 0) {
      throw new Error(`Failed to protect DingTalk CLI credential file: ${protectedFile.output || 'Unknown error'}`)
    }
    return credentialPaths
  }

  buildConnectorCommand(
    command: string,
    credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
    paths: DingTalkCliCredentialPaths
  ) {
    this.validateAgentCommand(command)
    const rewrittenCommand = command.replace(
      /^\s*dws(?=\s|$)/i,
      'env -u DINGTALK_ACCESS_TOKEN -u DINGTALK_APP_ACCESS_TOKEN -u DINGTALK_DWS_TOKEN -u DINGTALK_ROBOT_CODE ' +
        'dws --token "$DINGTALK_ACCESS_TOKEN"'
    )
    const redactedCommand = [
      'set -o pipefail',
      `{ ${rewrittenCommand}; } 2>&1 | while IFS= read -r line; do ` +
        'line=${line//"$DINGTALK_ACCESS_TOKEN"/[REDACTED]}; ' +
        'printf \'%s\\n\' "$line"; done'
    ].join('; ')

    return [`. ${shellQuote(paths.envPath)}`, `/bin/bash -c ${shellQuote(redactedCommand)}`].join(' && ')
  }

  async removeCredential(backend: DingTalkCliBackend, envPath: string) {
    const removed = await backend.execute(`rm -f ${shellQuote(envPath)}`)
    if (removed.exitCode !== 0) {
      throw new Error(`Failed to remove DingTalk CLI credential file: ${removed.output || 'Unknown error'}`)
    }
  }

  private getCredentialPaths(connectorId: string, paths: DingTalkCliRuntimePaths): DingTalkCliCredentialPaths {
    const connectorRoot = path.join(paths.runtimeRoot, 'connectors', safePathSegment(connectorId))
    const envDir = path.join(connectorRoot, 'secrets')
    return {
      envDir,
      envPath: path.join(envDir, `env-${randomUUID()}`),
      configDir: path.join(connectorRoot, 'config'),
      cacheDir: path.join(connectorRoot, 'cache')
    }
  }

  private async isCliReady(backend: DingTalkCliBackend) {
    const result = await backend.execute('dws version 2>/dev/null')
    return result.exitCode === 0 && result.output.includes(DINGTALK_CLI_VERSION)
  }

  private async areSkillsReady(backend: DingTalkCliBackend, paths: DingTalkCliRuntimePaths) {
    const result = await backend.execute(
      `test -f ${shellQuote(path.join(paths.skillsDir, 'dingtalk-shared', 'SKILL.md'))}`
    )
    return result.exitCode === 0
  }

  private async readStamp(backend: DingTalkCliBackend, paths: DingTalkCliRuntimePaths) {
    const result = await backend.execute(`cat ${shellQuote(paths.stampPath)} 2>/dev/null || true`)
    try {
      return result.output.trim() ? (JSON.parse(result.output) as DingTalkBootstrapStamp) : null
    } catch {
      return null
    }
  }

  private async writeStamp(backend: DingTalkCliBackend, paths: DingTalkCliRuntimePaths) {
    const stamp = JSON.stringify({
      cliVersion: DINGTALK_CLI_VERSION,
      bootstrapVersion: DINGTALK_CLI_BOOTSTRAP_VERSION
    })
    const result = await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(paths.stampPath))} && printf '%s' ${shellQuote(stamp)} > ${shellQuote(
        paths.stampPath
      )}`
    )
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write DingTalk CLI bootstrap stamp: ${result.output || 'Unknown error'}`)
    }
  }
}

function buildCredentialEnv(
  credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
  runtimePaths: DingTalkCliRuntimePaths,
  credentialPaths: DingTalkCliCredentialPaths
) {
  const accessToken = requireCredentialValue(credential, 'accessToken', 'DingTalk connector access token is missing')
  return [
    `export HOME=${shellQuote(runtimePaths.workspaceRoot)}`,
    `export DWS_CONFIG_DIR=${shellQuote(credentialPaths.configDir)}`,
    `export DWS_CACHE_DIR=${shellQuote(credentialPaths.cacheDir)}`,
    "export DWS_TRUSTED_DOMAINS='*.dingtalk.com'",
    "export DWS_AGENT_PRODUCT='xpert'",
    "export DWS_AGENT_HOST='sandbox'",
    "export DWS_DISABLE_KEYCHAIN='1'",
    "export DINGTALK_DWS_AGENTCODE='xpert'",
    `export DINGTALK_ACCESS_TOKEN=${shellQuote(accessToken)}`,
    ''
  ].join('\n')
}

function isApplicationRobotCommand(command: string) {
  return /^\s*dws\s+chat\s+(?:message\s+(?:send-by-bot|recall-by-bot)|group\s+members\s+add-bot)(?=\s|$)/i.test(command)
}

function hasUnsafeShellSyntax(command: string) {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      if (quote !== "'" && character === '$' && ['(', '{'].includes(command[index + 1] ?? '')) return true
      if (quote !== "'" && character === '`') return true
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if ('\r\n;&|<>`'.includes(character)) return true
    if (character === '$' && ['(', '{'].includes(command[index + 1] ?? '')) return true
  }
  return quote !== null || escaped
}

function requireCredentialValue(
  credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
  key: string,
  message: string
) {
  const value = readCredentialValue(credential, key)
  if (!value) throw new Error(message)
  return value
}

export function readCredentialValue(
  credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
  key: string
) {
  if ('credentials' in credential) {
    return readString(credential.credentials[key])
  }
  return readString(Reflect.get(credential, key))
}

function toUploadPath(backend: DingTalkCliBackend, targetPath: string) {
  const normalizedTargetPath = path.normalize(targetPath)
  const workingDirectory = normalizeAbsolutePath(backend.workingDirectory)
  if (!path.isAbsolute(normalizedTargetPath) || !workingDirectory) return normalizedTargetPath

  const relativePath = path.relative(workingDirectory, normalizedTargetPath)
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.startsWith('../')) return normalizedTargetPath
  return relativePath
}

function safePathSegment(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 160)
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('DingTalk connector ID cannot be mapped to a safe runtime path')
  }
  return normalized
}

function normalizeAbsolutePath(value: unknown) {
  const normalized = readString(value)
  return normalized && path.isAbsolute(normalized) ? path.normalize(normalized) : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
