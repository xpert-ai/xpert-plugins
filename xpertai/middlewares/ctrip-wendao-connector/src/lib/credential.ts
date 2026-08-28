import { CtripWendaoError } from './errors.js'
import type { CtripWendaoCredential } from './types.js'

export function createCtripWendaoCredential(value: unknown): CtripWendaoCredential {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 4_096) {
    throw new CtripWendaoError('WENDAO_AUTH_INVALID', 'A valid Ctrip Wendao API Token is required.')
  }
  return { apiToken: value.trim() }
}
