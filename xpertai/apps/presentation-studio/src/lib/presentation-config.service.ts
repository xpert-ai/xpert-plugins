import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common'
import { PLUGIN_CONFIG_RESOLVER_TOKEN, type IPluginConfigResolver } from '@xpert-ai/plugin-sdk'
import { PRESENTATION_STUDIO_PLUGIN_NAME } from './constants.js'
import {
  PRESENTATION_SHARE_ACCESS_MODES,
  type PresentationScope,
  type PresentationShareAccessMode,
  type PresentationSharePolicy,
  type PresentationStudioConfig
} from './types.js'

export const PRESENTATION_CONFIG_DEFAULTS: PresentationStudioConfig = {
  exportBackend: 'sandbox-job',
  fontSourceMode: 'bundled',
  exportConcurrency: 1,
  maxPageCount: 30,
  maxAssetBytes: 100 * 1024 * 1024,
  maxDeckMediaBytes: 300 * 1024 * 1024,
  maxPreviewBytes: 160 * 1024 * 1024,
  debug: false,
  defaultShareAccessMode: 'public_link',
  allowedShareAccessModes: [...PRESENTATION_SHARE_ACCESS_MODES],
  allowAgentPublicSharing: true,
  allowWorkbenchPublicSharing: true
}

@Injectable()
export class PresentationConfigService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly resolver?: IPluginConfigResolver
  ) {}

  get(scope?: Pick<PresentationScope, 'organizationId'>): PresentationStudioConfig {
    const value = this.resolver?.resolve<PresentationStudioConfig>(PRESENTATION_STUDIO_PLUGIN_NAME, {
      defaults: PRESENTATION_CONFIG_DEFAULTS,
      organizationId: scope?.organizationId ?? undefined
    }) ?? PRESENTATION_CONFIG_DEFAULTS
    const requestedBackend = value.exportBackend === 'local' ? 'local' : 'sandbox-job'
    return {
      ...PRESENTATION_CONFIG_DEFAULTS,
      ...value,
      exportBackend: process.env.NODE_ENV === 'production' ? 'sandbox-job' : requestedBackend,
      fontSourceMode: value.fontSourceMode === 'online' ? 'online' : 'bundled',
      exportConcurrency: clampInteger(value.exportConcurrency, 1, 4, 1),
      maxPageCount: clampInteger(value.maxPageCount, 3, 30, 30)
    }
  }

  getSharePolicy(scope: Pick<PresentationScope, 'organizationId'>): PresentationSharePolicy {
    const config = this.get(scope)
    const allowedAccessModes = uniqueShareAccessModes(config.allowedShareAccessModes)
    const defaultAccessMode = allowedAccessModes.includes(config.defaultShareAccessMode)
      ? config.defaultShareAccessMode
      : allowedAccessModes[0] ?? PRESENTATION_CONFIG_DEFAULTS.defaultShareAccessMode
    return {
      defaultAccessMode,
      allowedAccessModes,
      allowAgentPublicSharing: config.allowAgentPublicSharing,
      allowWorkbenchPublicSharing: config.allowWorkbenchPublicSharing
    }
  }

  resolveShareAccessMode(
    scope: Pick<PresentationScope, 'organizationId'>,
    requestedAccessMode: PresentationShareAccessMode | null | undefined,
    actor: 'agent' | 'workbench'
  ): PresentationShareAccessMode {
    const policy = this.getSharePolicy(scope)
    const accessMode = requestedAccessMode ?? policy.defaultAccessMode
    if (!policy.allowedAccessModes.includes(accessMode)) {
      throw new BadRequestException(`Presentation sharing access mode '${accessMode}' is disabled by this organization's plugin configuration.`)
    }
    if (accessMode === 'public_link' && actor === 'agent' && !policy.allowAgentPublicSharing) {
      throw new BadRequestException('This organization does not allow agents to create public presentation links.')
    }
    if (accessMode === 'public_link' && actor === 'workbench' && !policy.allowWorkbenchPublicSharing) {
      throw new BadRequestException('This organization does not allow the Presentation Studio Workbench to create public links.')
    }
    return accessMode
  }
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function uniqueShareAccessModes(value: PresentationShareAccessMode[]) {
  const modes = [...new Set(value.filter((item) => PRESENTATION_SHARE_ACCESS_MODES.includes(item)))]
  return modes.length ? modes : [...PRESENTATION_CONFIG_DEFAULTS.allowedShareAccessModes]
}
