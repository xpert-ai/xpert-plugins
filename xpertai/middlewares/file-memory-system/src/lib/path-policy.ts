import path from 'node:path'
import { Injectable } from '@nestjs/common'

type FileMemoryRuntimeEnvironment = {
  envName?: string
  sandboxConfig?: {
    volume?: string
  }
}

@Injectable()
export class FileMemoryPathPolicy {
  private readonly runtimeEnvironment: FileMemoryRuntimeEnvironment = {
    envName:
      process.env['ENV_NAME'] ??
      (process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev'),
    sandboxConfig: {
      volume: process.env['SANDBOX_VOLUME'] ?? process.env['SANDBOX_CONFIG_VOLUME']
    }
  }

  hasConfiguredSandboxVolume() {
    return Boolean(this.runtimeEnvironment.sandboxConfig?.volume?.trim())
  }

  usesFlattenedSandboxVolumeLayout() {
    return this.runtimeEnvironment.envName === 'dev' && !this.hasConfiguredSandboxVolume()
  }

  getSandboxRootPath(tenantId?: string) {
    if (this.usesFlattenedSandboxVolumeLayout()) {
      return this.getLocalSandboxDataRoot()
    }

    if (this.runtimeEnvironment.envName === 'dev') {
      return path.join(this.runtimeEnvironment.sandboxConfig?.volume || '', tenantId ?? '')
    }

    return tenantId ? path.join('/sandbox', tenantId) : '/sandbox'
  }

  getHostedRootPath(tenantId: string) {
    const root = this.getSandboxRootPath(tenantId)
    return this.usesFlattenedSandboxVolumeLayout() ? root : path.join(root, 'hosted')
  }

  getWorkspaceRootPath(tenantId: string, workspaceId: string) {
    const root = this.getSandboxRootPath(tenantId)
    return this.usesFlattenedSandboxVolumeLayout() ? root : path.join(root, 'workspace', workspaceId)
  }

  private getLocalSandboxDataRoot() {
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || ''
    return path.join(homeDir, 'data')
  }
}
