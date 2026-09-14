import type { MinerUIntegrationOptions, MinerUParseOptions, MinerUServerType } from './types.js'

// Existing document/workflow values win; absent values use the selected integration, then legacy defaults.
export function resolveMinerUParseOptions(
  legacy: MinerUParseOptions,
  integration?: MinerUIntegrationOptions
): MinerUParseOptions {
  return {
    isOcr: legacy.isOcr ?? integration?.isOcr ?? true,
    enableFormula: legacy.enableFormula ?? integration?.enableFormula ?? true,
    enableTable: legacy.enableTable ?? integration?.enableTable ?? true,
    language: legacy.language ?? integration?.language ?? 'ch',
    modelVersion: legacy.modelVersion ?? integration?.modelVersion ?? 'vlm',
    selfHostedBackend: legacy.selfHostedBackend ?? integration?.selfHostedBackend ?? 'pipeline',
    selfHostedServerUrl: legacy.selfHostedServerUrl ?? integration?.selfHostedServerUrl,
    parseMethod: legacy.parseMethod ?? integration?.parseMethod ?? 'auto',
    preserveRawOutput: legacy.preserveRawOutput ?? integration?.preserveRawOutput ?? true
  }
}

export function validateMinerUParseOptions(options: MinerUParseOptions, serverType: MinerUServerType): void {
  for (const key of ['enableFormula', 'enableTable', 'preserveRawOutput'] as const) {
    if (options[key] != null && typeof options[key] !== 'boolean') throw new Error(`Invalid MinerU option: ${key}`)
  }
  if (serverType === 'official') {
    if (!['vlm', 'pipeline'].includes(options.modelVersion ?? 'vlm'))
      throw new Error(`Unsupported MinerU model: ${options.modelVersion}`)
    if (options.isOcr != null && typeof options.isOcr !== 'boolean') throw new Error('Invalid MinerU option: isOcr')
  } else if (options.parseMethod != null && !['auto', 'txt', 'ocr'].includes(options.parseMethod)) {
    throw new Error('Invalid MinerU parseMethod')
  }
}
