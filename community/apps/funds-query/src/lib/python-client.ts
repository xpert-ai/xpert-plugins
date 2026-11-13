import { Inject, Injectable, Logger } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { CONFIG } from './constants.js'
import type { Scope, WorkerReply, JsonObject, WorkerError, RuntimeStatus } from '../shared/contracts.js'

export interface RuntimeConfig {
  pythonExecutable: string
  dataDirectory: string
  timeoutMs: number
  debug: boolean
}
export class FundsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: WorkerError['details']
  ) {
    super(message)
  }
}

function isReply<T>(value: object): value is WorkerReply<T> {
  if (!('ok' in value) || typeof value.ok !== 'boolean') return false
  if (value.ok) return 'data' in value
  return (
    'error' in value &&
    typeof value.error === 'object' &&
    value.error !== null &&
    'code' in value.error &&
    'message' in value.error &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  )
}

@Injectable()
export class PythonClient {
  private readonly logger = new Logger('FundsQuery')
  private readonly pythonRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'python')
  private runtime?: Promise<{ executable: string; version: string }>
  constructor(@Inject(CONFIG) readonly config: RuntimeConfig) {}

  private async resolvePython() {
    const candidates = this.config.pythonExecutable === 'auto'
      ? ['python3.13', 'python3.12', 'python3.11', 'python3', 'python']
      : [this.config.pythonExecutable]
    let dependencyFailure = false
    for (const executable of candidates) {
      const result = await new Promise<{ok: boolean; version?: string; code?: string}>((resolveProbe) => {
        const child = spawn(executable, ['-I', '-S', join(this.pythonRoot, 'launch.py'), '--check'], {
          env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT },
          stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true
        })
        let output = '', settled = false
        const finish = (value: {ok: boolean; version?: string; code?: string}) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolveProbe(value)
        }
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          finish({ok: false, code: 'timeout'})
        }, Math.min(this.config.timeoutMs, 5000))
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
          output += chunk
          if (output.length > 4096) { child.kill('SIGKILL'); finish({ok: false, code: 'runtime_dependencies'}) }
        })
        child.on('error', () => finish({ok: false, code: 'python_unavailable'}))
        child.on('close', () => {
          try {
            const value: unknown = JSON.parse(output)
            if (value && typeof value === 'object' && 'ok' in value && value.ok === true && 'version' in value && typeof value.version === 'string')
              return finish({ok: true, version: value.version})
            if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string')
              return finish({ok: false, code: value.code})
          } catch { /* Missing or incompatible interpreters can produce no JSON. */ }
          finish({ok: false, code: 'python_unavailable'})
        })
      })
      if (result.ok && result.version) return {executable, version: result.version}
      if (result.code === 'timeout') throw new FundsError('worker_timeout', '运行环境检查超时，请点击刷新重试。')
      dependencyFailure ||= result.code === 'runtime_dependencies'
    }
    if (dependencyFailure)
      throw new FundsError('runtime_dependencies', '插件内的 Python 依赖不完整，请重新上传完整安装包。')
    throw new FundsError('python_unavailable', '需要服务器安装 Python 3.11 或更高版本。安装后点击刷新，或在插件配置中填写解释器路径。')
  }

  private ensurePython() {
    if (this.runtime) return this.runtime
    const pending = this.resolvePython()
    this.runtime = pending
    void pending.catch(() => { if (this.runtime === pending) this.runtime = undefined })
    return pending
  }

  async checkRuntime(): Promise<RuntimeStatus> {
    try {
      const runtime = await this.ensurePython()
      try {
        await mkdir(this.config.dataDirectory, {recursive: true, mode: 0o700})
        await access(this.config.dataDirectory, constants.R_OK | constants.W_OK)
      } catch {
        throw new FundsError('data_directory_unavailable', '持久化数据目录不可读写，请在插件配置中设置服务器上的可写目录。')
      }
      return {status: 'ready', pythonVersion: runtime.version, message: ''}
    } catch (error) {
      return {status: 'unavailable', pythonVersion: null,
        message: error instanceof FundsError ? error.message : '运行环境检查失败，请点击刷新重试。'}
    }
  }

  async call<T>(scope: Scope, action: string, payload: JsonObject = {}): Promise<T> {
    const startedAt = Date.now()
    if (!scope.tenantId || !scope.organizationId || !scope.userId)
      throw new FundsError('scope_required', '需要登录并选择组织。')
    const runtime = await this.ensurePython()
    return new Promise<T>((resolve, reject) => {
      const child = spawn(runtime.executable, ['-I', '-S', join(this.pythonRoot, 'launch.py')], {
        cwd: this.pythonRoot,
        env: {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
          PYTHONUTF8: '1',
          PYTHONNOUSERSITE: '1',
          PYTHONDONTWRITEBYTECODE: '1',
          FUNDS_QUERY_DATA_DIR: this.config.dataDirectory
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
      let output = ''
      let settled = false
      const finish = (error?: Error, value?: T) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.config.debug) {
          this.logger.debug(JSON.stringify({ action, elapsedMs: Date.now() - startedAt, code: error instanceof FundsError ? error.code : error ? 'error' : 'ok' }))
        }
        if (error) {
          if (error instanceof FundsError && ['python_unavailable', 'worker_failed'].includes(error.code)) this.runtime = undefined
          reject(error)
        }
        else if (value !== undefined) resolve(value)
        else reject(new FundsError('worker_failed', '分析服务没有返回结果。'))
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(new FundsError('worker_timeout', '分析处理超时，请重试。'))
      }, this.config.timeoutMs)
      child.on('error', () =>
        finish(
          new FundsError('python_unavailable', 'Python 运行环境不可用，请先完成运行环境准备。')
        )
      )
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        output += chunk
        if (Buffer.byteLength(output) > 2 * 1024 * 1024) {
          child.kill('SIGKILL')
          finish(new FundsError('response_too_large', '结果过大，请缩小查询范围。'))
        }
      })
      // Drain stderr without logging imported data, filesystem paths or configuration.
      child.stderr.resume()
      child.stdin.on('error', () =>
        finish(new FundsError('worker_failed', '分析服务启动失败，请检查 Python 依赖。'))
      )
      child.on('close', (code) => {
        if (code !== 0) {
          finish(new FundsError('worker_failed', '分析服务异常退出，请检查 Python 依赖后重试。'))
          return
        }
        try {
          const value: object = JSON.parse(output)
          if (!value || !isReply<T>(value)) {
            finish(new FundsError('invalid_response', '分析服务返回格式不正确。'))
            return
          }
          if (!value.ok) {
            finish(new FundsError(value.error.code, value.error.message, value.error.details))
            return
          }
          finish(undefined, value.data)
        } catch {
          finish(new FundsError('invalid_response', '分析服务返回格式不正确。'))
        }
      })
      child.stdin.end(JSON.stringify({ scope, action, payload }))
    })
  }
}
