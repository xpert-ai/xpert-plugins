import { NOTION_RETRY_ATTEMPTS } from './constants.js'
import { NotionConnectorError } from './errors.js'

export class NotionRateLimiter {
  private readonly lastRequestAt = new Map<string, number>()

  constructor(private readonly minIntervalMs = 350) {}

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      await this.waitForSlot(key)
      try {
        return await operation()
      } catch (error) {
        if (!isRetryable(error) || attempt >= NOTION_RETRY_ATTEMPTS - 1) throw error
        const delay = retryDelay(error, attempt)
        await sleep(delay)
      }
    }
  }

  private async waitForSlot(key: string): Promise<void> {
    const previous = this.lastRequestAt.get(key) ?? 0
    const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - previous))
    if (waitMs > 0) await sleep(waitMs)
    this.lastRequestAt.set(key, Date.now())
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof NotionConnectorError &&
    (error.code === 'NOTION_RATE_LIMITED' || error.code === 'NOTION_SERVICE_UNAVAILABLE')
  )
}

function retryDelay(error: unknown, attempt: number): number {
  if (error instanceof NotionConnectorError && error.retryAfterSeconds !== undefined) {
    return Math.min(10_000, Math.max(0, error.retryAfterSeconds * 1_000))
  }
  const status = error instanceof NotionConnectorError ? error.status : undefined
  const base = status === 429 ? 1_000 : 500
  return Math.min(10_000, base * 2 ** attempt + Math.floor(Math.random() * 250))
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
