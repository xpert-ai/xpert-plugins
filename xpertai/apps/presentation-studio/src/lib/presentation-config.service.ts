import { Inject, Injectable, Optional } from '@nestjs/common'
import { PLUGIN_CONFIG_RESOLVER_TOKEN, type IPluginConfigResolver } from '@xpert-ai/plugin-sdk'
import { PRESENTATION_STUDIO_PLUGIN_NAME } from './constants.js'
import type { PresentationStudioConfig } from './types.js'

export const PRESENTATION_CONFIG_DEFAULTS: PresentationStudioConfig = {
  exportConcurrency: 1,
  maxPageCount: 30,
  maxAssetBytes: 100 * 1024 * 1024,
  maxDeckMediaBytes: 300 * 1024 * 1024,
  maxPreviewBytes: 160 * 1024 * 1024,
  debug: false
}

@Injectable()
export class PresentationConfigService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly resolver?: IPluginConfigResolver
  ) {}

  get(): PresentationStudioConfig {
    const value = this.resolver?.resolve<PresentationStudioConfig>(PRESENTATION_STUDIO_PLUGIN_NAME, {
      defaults: PRESENTATION_CONFIG_DEFAULTS
    }) ?? PRESENTATION_CONFIG_DEFAULTS
    return {
      ...PRESENTATION_CONFIG_DEFAULTS,
      ...value,
      exportConcurrency: clampInteger(value.exportConcurrency, 1, 4, 1),
      maxPageCount: clampInteger(value.maxPageCount, 3, 30, 30)
    }
  }
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
