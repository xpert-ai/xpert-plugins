import { isAxiosError } from 'axios'
import { BaiduOcrError } from './errors.js'

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  attempts = 3
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (attempt === attempts || !shouldRetry(error)) {
        throw error
      }
      await sleep(Math.min(3_000 * attempt, 15_000))
    }
  }
  throw lastError
}

export function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof BaiduOcrError) {
    return error.retryable
  }
  if (!isAxiosError(error)) {
    return false
  }
  const status = error.response?.status
  return !status || status === 408 || status === 429 || status === 502 || status === 503 || status === 504
}
