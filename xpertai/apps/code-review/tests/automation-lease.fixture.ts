import type { ManagedQueueRedis } from '@xpert-ai/plugin-sdk'

export class LeaseRedis implements ManagedQueueRedis {
  readonly values = new Map<string, string>()
  unavailable = false
  async get(key: string) { return this.values.get(key) ?? null }
  async set(key: string, value: string, _mode?: string, _ttl?: string | number, condition?: string | number) {
    if (this.unavailable) throw new Error('Redis unavailable')
    if (condition === 'NX' && this.values.has(key)) return null
    this.values.set(key, value); return 'OK'
  }
  async del(...keys: string[]) { return keys.reduce((count, key) => count + Number(this.values.delete(key)), 0) }
  async incr() { throw new Error('Unexpected incr') }
  async expire() { throw new Error('Unexpected expire') }
  async ttl() { throw new Error('Unexpected ttl') }
  async eval(script: string, _numKeys: number, ...args: Array<string | number>) {
    if (this.unavailable) throw new Error('Redis unavailable')
    const [key, token] = args.map(String)
    if (this.values.get(key) !== token) return 0
    if (script.includes("redis.call('del'")) this.values.delete(key)
    return 1
  }
}

export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
