export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** Serializes saves and keeps the newest pending value. A failed save never clears dirty data. */
export class SaveQueue<T> {
  private desired: string | null = null
  private saved: string | null
  private running: Promise<void> | null = null
  state: SaveState = 'saved'
  error: Error | null = null

  constructor(public revision: number, initial: T | null,
    private readonly persist: (value: T, expectedRevision: number) => Promise<{ revision: number }>,
    private readonly changed: () => void = () => {}) {
    this.saved = initial == null ? null : JSON.stringify(initial)
  }

  set(value: T) {
    this.desired = JSON.stringify(value)
    if (this.state !== 'saving' && this.state !== 'error') this.state = this.desired === this.saved ? 'saved' : 'dirty'
    this.changed()
  }

  flush(): Promise<void> {
    // The drain may already have finished while its finally callback is still queued.
    // Recheck after it settles so this caller also waits for any newly requested value.
    if (this.running) return this.running.then(() => this.flush())
    this.error = null
    this.running = this.drain().finally(() => { this.running = null })
    return this.running
  }

  private async drain() {
    try {
      while (this.desired !== null && this.desired !== this.saved) {
        const value = this.desired
        this.state = 'saving'; this.changed()
        const receipt = await this.persist(JSON.parse(value) as T, this.revision)
        this.revision = receipt.revision
        this.saved = value
      }
      this.state = 'saved'; this.changed()
    } catch (error) {
      this.error = error instanceof Error ? error : new Error('save_failed')
      this.state = 'error'; this.changed()
      throw this.error
    }
  }

  /** Only after a successful authoritative action, while user changes are suspended. */
  accept(value: T, revision: number) {
    if (this.running) throw new Error('save_in_progress')
    this.revision = revision
    this.saved = JSON.stringify(value)
    this.desired = this.saved
    this.error = null
    this.state = 'saved'
    this.changed()
  }
}
