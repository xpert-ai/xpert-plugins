import { extractPrimitiveText, isRecord } from './utils.js'

export function normalizeForMatching(text: string, normalize: boolean, caseSensitive: boolean): string {
  const source = normalize ? text.trim().replace(/\s+/g, ' ') : text
  return caseSensitive ? source : source.toLowerCase()
}

export function extractInputText(state: any, runtime: any): string {
  const runtimeState = runtime?.state

  const runtimeHuman = isRecord(runtimeState?.['human']) ? runtimeState['human'] : null
  const stateHuman = isRecord(state?.['human']) ? state['human'] : null

  const candidates: unknown[] = [
    runtimeHuman?.['input'],
    runtimeState?.['input'],
    stateHuman?.['input'],
    state?.['input'],
  ]

  for (const candidate of candidates) {
    const text = extractPrimitiveText(candidate).trim()
    if (text) {
      return text
    }
  }

  return ''
}
