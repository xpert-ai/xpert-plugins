import { BadRequestException } from '@nestjs/common'
import * as sdk from '@xpert-ai/plugin-sdk'

const parameterMessages = {
  DATAX_PARAMETER_MAPPING_INVALID: 'Parameter names must match parameterPaths exactly, with a distinct target path for each parameter.',
  DATAX_PARAMETER_PATH_INVALID: 'parameterPaths are relative to params. Omit the leading params segment and target an existing scalar, for example ["slicers","1","value"].',
  DATAX_PARAMETER_PATH_NOT_SCALAR: 'A parameter path must target a scalar value, not an entire object or array. Select the existing filter value field.'
}
// SDK 3.31 lacks this constructor. Later SDKs validate the entire envelope before exposing it.
function providerDiagnostic(input: unknown): Error | undefined {
  const ProviderError = 'AnalyticsProviderError' in sdk ? sdk.AnalyticsProviderError : undefined
  if (typeof ProviderError !== 'function') return undefined
  return new (ProviderError as new (value: unknown) => Error)(input)
}

export function dataXpertParameterError(code: keyof typeof parameterMessages) {
  const message = parameterMessages[code]
  return providerDiagnostic({ schema: 'xpert.analytics.diagnostic', version: 1,
    code, stage: 'validation', retryable: false, message }) ?? new BadRequestException(`${code}: ${message}`)
}

/** Error responses get a smaller byte/time budget than results. Never retain or echo an unknown body. */
export async function readAnalyticsHttpError(response: Response, signal: AbortSignal, deadlineAt?: number): Promise<Error | undefined> {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    return undefined
  }
  const reader = response.body.getReader()
  const budget = Math.min(1000, Math.max(0, (deadlineAt ?? Infinity) - Date.now()))
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => undefined
  const cancelled = new Promise<undefined>(resolve => {
    abort = () => resolve(undefined)
    timer = setTimeout(abort, budget)
    signal.addEventListener('abort', abort, { once: true })
  })
  const read = async () => {
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 16_384) return undefined
      chunks.push(chunk.value)
    }
    return providerDiagnostic(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  }
  try {
    signal.throwIfAborted()
    return await Promise.race([read(), cancelled])
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => undefined)
  }
}
