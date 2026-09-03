import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { Injectable } from '@nestjs/common'
import { ZSXQ_CLI_COMMAND_TIMEOUT_MS, ZSXQ_CLI_OUTPUT_MAX_BYTES, ZSXQ_CLI_VERSION } from '../constants.js'
import { errorMessage, ZsxqConnectorError } from '../errors.js'

export type ZsxqCliCommandResult = {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export type ZsxqCliRunningCommand = {
  completion: Promise<ZsxqCliCommandResult>
  stop(): void
}

export abstract class ZsxqCliRunner {
  abstract run(configDir: string, args: readonly string[], timeoutMs?: number): Promise<ZsxqCliCommandResult>
  abstract start(configDir: string, args: readonly string[], timeoutMs?: number): ZsxqCliRunningCommand
  abstract verify(): Promise<void>
}

@Injectable()
export class SystemZsxqCliRunner extends ZsxqCliRunner {
  private binaryPromise?: Promise<string>

  async verify(): Promise<void> {
    const result = await this.run('', ['--version'], 10_000)
    if (result.exitCode !== 0 || !result.stdout.includes(`version ${ZSXQ_CLI_VERSION}`)) {
      throw new ZsxqConnectorError(
        'CLI_UNAVAILABLE',
        `Knowledge Planet connector requires zsxq-cli ${ZSXQ_CLI_VERSION}.`
      )
    }
  }

  async run(
    configDir: string,
    args: readonly string[],
    timeoutMs = ZSXQ_CLI_COMMAND_TIMEOUT_MS
  ): Promise<ZsxqCliCommandResult> {
    return this.start(configDir, args, timeoutMs).completion
  }

  start(configDir: string, args: readonly string[], timeoutMs = ZSXQ_CLI_COMMAND_TIMEOUT_MS): ZsxqCliRunningCommand {
    let child: ChildProcessWithoutNullStreams | undefined
    let stopped = false
    const completion = this.resolveBinary().then((binary) => {
      if (stopped) return { exitCode: 5, stdout: '', stderr: 'Command was stopped.', timedOut: false }
      child = spawn(binary, [...args], {
        env: {
          ...process.env,
          ...(configDir ? { ZSXQ_CLI_CONFIG_DIR: configDir } : {}),
          ZSXQ_CLI_NO_UPDATE_NOTIFIER: '1'
        },
        shell: false,
        stdio: 'pipe',
        windowsHide: true
      })
      return collectResult(child, timeoutMs)
    })
    return {
      completion,
      stop() {
        stopped = true
        child?.kill('SIGTERM')
      }
    }
  }

  private resolveBinary(): Promise<string> {
    this.binaryPromise ??= resolveZsxqBinary()
    return this.binaryPromise
  }
}

async function resolveZsxqBinary(): Promise<string> {
  const require = createRequire(import.meta.url)
  let packageJsonPath: string
  try {
    packageJsonPath = require.resolve('zsxq-cli/package.json')
  } catch (error) {
    throw new ZsxqConnectorError('CLI_UNAVAILABLE', `zsxq-cli package is unavailable: ${errorMessage(error)}`)
  }
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: string }
  if (packageJson.version !== ZSXQ_CLI_VERSION) {
    throw new ZsxqConnectorError(
      'CLI_UNAVAILABLE',
      `Expected zsxq-cli ${ZSXQ_CLI_VERSION}, found ${packageJson.version ?? 'unknown'}.`
    )
  }
  const platformPackage = platformPackageName()
  const packageRequire = createRequire(packageJsonPath)
  let platformPackageJson: string
  try {
    platformPackageJson = packageRequire.resolve(`${platformPackage}/package.json`)
  } catch (error) {
    throw new ZsxqConnectorError(
      'CLI_UNAVAILABLE',
      `zsxq-cli does not include a binary for ${process.platform}/${process.arch}: ${errorMessage(error)}`
    )
  }
  return join(dirname(platformPackageJson), 'bin', process.platform === 'win32' ? 'zsxq-cli.exe' : 'zsxq-cli')
}

function platformPackageName(): string {
  const target = `${process.platform}-${process.arch}`
  const supported = new Set(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'])
  if (!supported.has(target)) {
    throw new ZsxqConnectorError('CLI_UNAVAILABLE', `Unsupported zsxq-cli platform '${target}'.`)
  }
  return `@zsxq/cli-${target}`
}

function collectResult(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<ZsxqCliCommandResult> {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    let outputExceeded = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk])
      if (next.length > ZSXQ_CLI_OUTPUT_MAX_BYTES) {
        outputExceeded = true
        child.kill('SIGTERM')
        return next.subarray(0, ZSXQ_CLI_OUTPUT_MAX_BYTES)
      }
      return next
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk)
    })

    const finish = (exitCode: number, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode,
        stdout: stdout.toString('utf8'),
        stderr: outputExceeded
          ? 'Knowledge Planet CLI output exceeded the connector limit.'
          : error?.message ?? stderr.toString('utf8'),
        timedOut
      })
    }
    child.once('error', (error) => finish(5, error))
    child.once('close', (code) => finish(code ?? 5))
  })
}
