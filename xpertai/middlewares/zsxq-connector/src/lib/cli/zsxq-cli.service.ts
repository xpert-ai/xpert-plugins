import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import {
  ZSXQ_AUTHORIZATION_HOST,
  ZSXQ_CLI_AUTH_START_TIMEOUT_MS,
  ZSXQ_CLI_VERSION,
  ZSXQ_OAUTH_BASE_URL,
  ZSXQ_PLUGIN_CONFIG_TOKEN
} from '../constants.js'
import { errorMessage, ZsxqConnectorError } from '../errors.js'
import { mapAccount, type ZsxqAccountDto } from '../mappers/zsxq-mappers.js'
import type { ZsxqPluginConfig } from '../plugin-config.js'
import { parseFirstJson } from './json.js'
import { ZsxqCliRunner, type ZsxqCliCommandResult, type ZsxqCliRunningCommand } from './zsxq-cli.runner.js'

const PendingAuthorizationSchema = z
  .object({
    base_url: z.literal(ZSXQ_OAUTH_BASE_URL),
    client_id: z.string().min(8).max(256),
    device_code: z.string().min(16).max(512),
    expires_at: z.number().int().positive(),
    interval: z.number().int().min(1).max(30),
    user_code: z.string().min(4).max(64),
    verification_uri_complete: z.string().url()
  })
  .strict()

const PersistedAuthorizationSchema = z
  .object({
    version: z.literal(1),
    pending: PendingAuthorizationSchema
  })
  .strict()

type PendingAuthorization = z.infer<typeof PendingAuthorizationSchema>
type PollerState = { command: ZsxqCliRunningCommand; result?: ZsxqCliCommandResult }

export type ZsxqAuthorizationStart = {
  handle: string
  authorizationUrl: string
  expiresAt: string
  pollIntervalSeconds: number
}

export type ZsxqAuthorizationPoll =
  | { status: 'pending'; expiresAt: string; pollIntervalSeconds: number }
  | { status: 'complete'; profile: ZsxqAccountDto }
  | { status: 'error'; error: string }

@Injectable()
export class ZsxqCliService {
  private readonly root: string
  private readonly connectionsRoot: string
  private readonly pollers = new Map<string, PollerState>()

  constructor(private readonly runner: ZsxqCliRunner, @Inject(ZSXQ_PLUGIN_CONFIG_TOKEN) config: ZsxqPluginConfig) {
    this.root = resolve(config.cliDataRoot ?? join(homedir(), '.xpert', 'plugin-data', 'zsxq-connector'))
    this.connectionsRoot = join(this.root, 'connections')
  }

  async startAuthorization(): Promise<ZsxqAuthorizationStart> {
    await this.runner.verify()
    await mkdir(this.connectionsRoot, { recursive: true, mode: 0o700 })
    const handle = randomUUID()
    const configDir = this.connectionDir(handle)
    await mkdir(configDir, { recursive: false, mode: 0o700 })
    const result = await this.runner.run(
      configDir,
      ['auth', 'login', '--no-browser', '--no-wait', '--json'],
      ZSXQ_CLI_AUTH_START_TIMEOUT_MS
    )
    if (result.exitCode !== 0) {
      await rm(configDir, { recursive: true, force: true })
      throw cliError(result, 'Could not start Knowledge Planet authorization')
    }
    const pending = await this.readPending(handle)
    this.ensureAuthorizationUrl(pending.verification_uri_complete)
    await this.persistAuthorization(handle, pending)
    this.ensurePoller(handle, pending)
    return {
      handle,
      authorizationUrl: pending.verification_uri_complete,
      expiresAt: new Date(pending.expires_at * 1000).toISOString(),
      pollIntervalSeconds: pending.interval
    }
  }

  async pollAuthorization(handle: string): Promise<ZsxqAuthorizationPoll> {
    const pending = await this.readAuthorization(handle).catch(() => undefined)
    const profile = await this.tryProfile(handle)
    if (profile) {
      await this.persistConnection(handle, profile)
      this.stopPoller(handle)
      await this.clearAuthorization(handle)
      return { status: 'complete', profile }
    }
    if (!pending) return { status: 'error', error: 'Knowledge Planet authorization session is missing. Reconnect.' }
    const expiresAt = new Date(pending.expires_at * 1000)
    if (expiresAt.getTime() <= Date.now()) {
      this.stopPoller(handle)
      await this.clearAuthorization(handle)
      return { status: 'error', error: 'Knowledge Planet authorization expired. Reconnect.' }
    }
    const state = this.pollers.get(handle)
    if (state?.result && ![0, 1, 3, 11].includes(state.result.exitCode)) {
      return { status: 'error', error: cliError(state.result, 'Knowledge Planet authorization failed').message }
    }
    if (!state || state.result) this.ensurePoller(handle, pending)
    return {
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      pollIntervalSeconds: pending.interval
    }
  }

  async runJson(handle: string, args: readonly string[], options?: { retryRead?: boolean }): Promise<unknown> {
    const configDir = await this.requireConnection(handle)
    let result = await this.runner.run(configDir, args)
    if (options?.retryRead && [1, 3].includes(result.exitCode)) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 350))
      result = await this.runner.run(configDir, args)
    }
    if (result.exitCode !== 0) throw cliError(result, `Knowledge Planet command '${args.slice(0, 2).join(' ')}' failed`)
    return parseFirstJson(result.stdout)
  }

  async disconnect(handle: string): Promise<void> {
    const configDir = this.connectionDir(handle)
    this.stopPoller(handle)
    const connection = await this.readConnection(handle).catch(() => undefined)
    if (!connection?.userId || !(await this.hasOtherConnection(handle, connection.userId))) {
      await this.runner.run(configDir, ['auth', 'logout'], 15_000).catch(() => undefined)
    }
    await rm(configDir, { recursive: true, force: true })
  }

  stopAll(): void {
    for (const handle of this.pollers.keys()) this.stopPoller(handle)
  }

  private ensurePoller(handle: string, pending: PendingAuthorization): void {
    this.stopPoller(handle)
    const timeoutMs = Math.max(10_000, pending.expires_at * 1000 - Date.now() + 10_000)
    const command = this.runner.start(
      this.connectionDir(handle),
      ['auth', 'login', '--device-code', pending.device_code, '--no-browser', '--json'],
      timeoutMs
    )
    const state: PollerState = { command }
    this.pollers.set(handle, state)
    void command.completion.then((result) => {
      state.result = result
    })
  }

  private stopPoller(handle: string): void {
    this.pollers.get(handle)?.command.stop()
    this.pollers.delete(handle)
  }

  private async tryProfile(handle: string): Promise<ZsxqAccountDto | undefined> {
    const result = await this.runner.run(this.connectionDir(handle), ['user', '+info', '--json'], 15_000)
    if (result.exitCode === 11) return undefined
    if (result.exitCode !== 0) return undefined
    try {
      return mapAccount(parseFirstJson(result.stdout))
    } catch {
      return undefined
    }
  }

  private async readPending(handle: string): Promise<PendingAuthorization> {
    const path = join(this.connectionDir(handle), 'device_auth_pending.json')
    try {
      return PendingAuthorizationSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
      throw new ZsxqConnectorError(
        'AUTHORIZATION_INVALID',
        `Invalid Knowledge Planet authorization state: ${errorMessage(error)}`
      )
    }
  }

  private async persistAuthorization(handle: string, pending: PendingAuthorization): Promise<void> {
    await writeFile(this.authorizationPath(handle), JSON.stringify({ version: 1, pending }), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  private async readAuthorization(handle: string): Promise<PendingAuthorization> {
    try {
      return PersistedAuthorizationSchema.parse(JSON.parse(await readFile(this.authorizationPath(handle), 'utf8')))
        .pending
    } catch (error) {
      if (!isMissingFile(error)) {
        throw new ZsxqConnectorError(
          'AUTHORIZATION_INVALID',
          `Invalid Knowledge Planet authorization state: ${errorMessage(error)}`
        )
      }
    }

    // Migrate sessions created before the connector owned its authorization state.
    const pending = await this.readPending(handle)
    await this.persistAuthorization(handle, pending)
    return pending
  }

  private async clearAuthorization(handle: string): Promise<void> {
    await Promise.all([
      rm(this.authorizationPath(handle), { force: true }),
      rm(join(this.connectionDir(handle), 'device_auth_pending.json'), { force: true })
    ])
  }

  private authorizationPath(handle: string): string {
    return join(this.connectionDir(handle), 'xpert-authorization.json')
  }

  private async requireConnection(handle: string): Promise<string> {
    const configDir = this.connectionDir(handle)
    const connection = await this.readConnection(handle).catch(() => undefined)
    if (!connection) throw new ZsxqConnectorError('AUTH_EXPIRED', 'Knowledge Planet connection is missing. Reconnect.')
    return configDir
  }

  private async persistConnection(handle: string, profile: ZsxqAccountDto): Promise<void> {
    const path = join(this.connectionDir(handle), 'xpert-connection.json')
    await writeFile(path, JSON.stringify({ version: 1, userId: profile.id, connectedAt: new Date().toISOString() }), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  private async readConnection(handle: string): Promise<{ version: 1; userId: string; connectedAt: string }> {
    const value = JSON.parse(await readFile(join(this.connectionDir(handle), 'xpert-connection.json'), 'utf8')) as {
      version?: unknown
      userId?: unknown
      connectedAt?: unknown
    }
    if (
      value.version !== 1 ||
      typeof value.userId !== 'string' ||
      !value.userId ||
      typeof value.connectedAt !== 'string'
    ) {
      throw new ZsxqConnectorError('AUTH_EXPIRED', 'Knowledge Planet connection metadata is invalid.')
    }
    return { version: 1, userId: value.userId, connectedAt: value.connectedAt }
  }

  private async hasOtherConnection(handle: string, userId: string): Promise<boolean> {
    const entries = await readdir(this.connectionsRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === handle || !HANDLE_PATTERN.test(entry.name)) continue
      const connection = await this.readConnection(entry.name).catch(() => undefined)
      if (connection?.userId === userId) return true
    }
    return false
  }

  private connectionDir(handle: string): string {
    if (!HANDLE_PATTERN.test(handle))
      throw new ZsxqConnectorError('AUTHORIZATION_INVALID', 'Invalid Knowledge Planet connection handle.')
    const directory = resolve(this.connectionsRoot, handle)
    if (
      !directory.startsWith(`${resolve(this.connectionsRoot)}${sep}`) ||
      dirname(directory) !== resolve(this.connectionsRoot)
    ) {
      throw new ZsxqConnectorError('AUTHORIZATION_INVALID', 'Unsafe Knowledge Planet connection handle.')
    }
    return directory
  }

  private ensureAuthorizationUrl(value: string): void {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== ZSXQ_AUTHORIZATION_HOST || url.username || url.password) {
      throw new ZsxqConnectorError('AUTHORIZATION_INVALID', 'Knowledge Planet returned an untrusted authorization URL.')
    }
  }
}

function cliError(result: ZsxqCliCommandResult, prefix: string): ZsxqConnectorError {
  const detail = boundedError(result.stderr || result.stdout)
  if (result.exitCode === 11) return new ZsxqConnectorError('AUTH_EXPIRED', 'Knowledge Planet authorization expired.')
  if (result.exitCode === 13) return new ZsxqConnectorError('PERMISSION_DENIED', `${prefix}: permission denied.`)
  if (result.exitCode === 3)
    return new ZsxqConnectorError('RATE_LIMITED', `${prefix}: temporary provider failure.`, true)
  if (result.exitCode === 2) return new ZsxqConnectorError('VALIDATION_FAILED', `${prefix}: ${detail}`)
  return new ZsxqConnectorError('CLI_FAILED', `${prefix}: ${detail}`, result.exitCode === 1 || result.timedOut)
}

function boundedError(value: string): string {
  const normalized = value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/device[_-]?code["':=\s]+[A-Za-z0-9._~-]+/gi, 'device_code=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
  return (normalized || 'unknown error').slice(0, 500)
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

const HANDLE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
