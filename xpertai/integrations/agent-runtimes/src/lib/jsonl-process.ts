import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { z } from 'zod'
import type { RuntimeProfile } from './config.js'

export const WireMessage = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
    success: z.boolean().optional(),
    data: z.unknown().optional()
  })
  .passthrough()
export type WireMessage = z.infer<typeof WireMessage>

/** Bounded JSONL transport. Observers and server requests are never mistaken for request replies. */
export class JsonlProcess {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<
    string,
    { resolve(value: WireMessage): void; reject(error: Error): void; timer: NodeJS.Timeout }
  >()
  private buffer = ''
  private sequence = 0
  private closed = false
  private exited = false
  private killTimer?: NodeJS.Timeout

  constructor(
    profile: RuntimeProfile,
    cwd: string,
    private readonly onMessage: (message: WireMessage) => void,
    private readonly onClose: () => void
  ) {
    if (!profile.command) throw new Error('An administrator-managed runner command is required')
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: 'C.UTF-8' }
    for (const key of profile.environmentKeys) if (process.env[key]) env[key] = process.env[key]
    this.child = spawn(profile.command, profile.args, { cwd, env, shell: false, stdio: 'pipe' })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.read(chunk))
    this.child.stdin.on('error', () => this.stop())
    this.child.stderr.on('data', () => undefined) // Do not expose runner stderr or credential diagnostics.
    this.child.on('error', () => this.stop())
    this.child.on('close', () => this.finish())
  }

  send(message: object) {
    if (this.closed) throw new Error('Agent transport is closed')
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  request(message: object): Promise<WireMessage> {
    const id = `xpert-${++this.sequence}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Agent protocol request timed out'))
      }, 30000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ ...message, id })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  stop() {
    this.disconnect()
    if (this.exited || this.killTimer) return
    this.child.kill('SIGTERM')
    this.killTimer = setTimeout(() => {
      if (!this.exited) this.child.kill('SIGKILL')
    }, 2000)
    this.killTimer.unref()
  }

  private read(chunk: string) {
    if (this.closed) return
    this.buffer += chunk
    if (this.buffer.length > 4 * 1024 * 1024) {
      this.stop()
      return
    }
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      try {
        const message = WireMessage.parse(JSON.parse(line))
        const pending = message.id === undefined ? undefined : this.pending.get(String(message.id))
        const response = !message.method && (message.type === 'response' || 'result' in message || 'error' in message)
        if (pending && response) {
          clearTimeout(pending.timer)
          this.pending.delete(String(message.id))
          if (message.error || message.success === false)
            pending.reject(new Error('Agent protocol rejected the request'))
          else pending.resolve(message)
        } else this.onMessage(message)
      } catch {
        this.stop()
      }
      if (this.closed) return
    }
  }

  private disconnect() {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Agent transport disconnected'))
    }
    this.pending.clear()
    this.buffer = ''
  }

  private finish() {
    if (this.exited) return
    this.exited = true
    clearTimeout(this.killTimer)
    this.disconnect()
    this.onClose()
  }
}
