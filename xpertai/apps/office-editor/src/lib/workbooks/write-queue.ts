import { ServiceUnavailableException } from '@nestjs/common'
import { AsyncResource } from 'node:async_hooks'
import type { DataSource, EntityManager } from 'typeorm'

type WaitingWrite = { key: string; bytes: number; start(): void }

/** Keep pool connections available for live ACL/file capabilities called inside transactions.
 * Row locks still arbitrate across API processes. This queue only bounds local pressure. */
export class WorkbookWriteQueue {
  private readonly active = new Set<string>()
  private readonly waiting: WaitingWrite[] = []
  private waitingBytes = 0

  run<T>(key: string, bytes: number, work: () => Promise<T>): Promise<T> {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 32 * 1024 * 1024 ||
      this.waiting.length >= 64 || this.waitingBytes + bytes > 32 * 1024 * 1024)
      return Promise.reject(new ServiceUnavailableException('office.workbook_busy'))
    const execute = AsyncResource.bind(work)
    return new Promise<T>((resolve, reject) => {
      this.waitingBytes += bytes
      this.waiting.push({ key, bytes, start: () => {
        this.active.add(key)
        void Promise.resolve().then(execute).then(resolve, reject).finally(() => {
          this.active.delete(key)
          this.drain()
        })
      } })
      this.drain()
    })
  }

  private drain() {
    while (this.active.size < 2) {
      const index = this.waiting.findIndex(item => !this.active.has(item.key))
      if (index < 0) return
      const [item] = this.waiting.splice(index, 1)
      this.waitingBytes -= item.bytes
      item.start()
    }
  }
}

// Multiple tenant installations can load separate copies of the plugin. Share only
// the admission queue, keyed by the actual host DataSource; retain no actor/content.
const registryKey = Symbol.for('@xpert-ai/office-editor/workbook-write-queues@1')
const host = globalThis as typeof globalThis & { [registryKey]?: WeakMap<DataSource, WorkbookWriteQueue> }
const queues = host[registryKey] ??= new WeakMap<DataSource, WorkbookWriteQueue>()

export function workbookTransaction<T>(manager: EntityManager, key: string, bytes: number,
  work: (transaction: EntityManager) => Promise<T>): Promise<T> {
  let queue = queues.get(manager.connection)
  if (!queue) { queue = new WorkbookWriteQueue(); queues.set(manager.connection, queue) }
  return queue.run(key, bytes, () => manager.transaction(work))
}
