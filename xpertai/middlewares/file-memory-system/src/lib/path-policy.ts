import path from 'node:path'
import { Injectable } from '@nestjs/common'

@Injectable()
export class FileMemoryPathPolicy {
  private readonly isDocker = process.env['IS_DOCKER'] === 'true'

  hasConfiguredSandboxVolume() {
    return false
  }

  usesFlattenedSandboxVolumeLayout() {
    return !this.isDocker
  }

  getSandboxRootPath(tenantId?: string) {
    if (this.usesFlattenedSandboxVolumeLayout()) {
      return this.getLocalSandboxDataRoot()
    }

    return tenantId ? path.join('/sandbox', tenantId) : '/sandbox'
  }

  getHostedRootPath(tenantId: string) {
    const root = this.getSandboxRootPath(tenantId)
    return this.usesFlattenedSandboxVolumeLayout() ? root : path.join(root, 'hosted')
  }

  getWorkspaceRootPath(tenantId: string, workspaceId: string) {
    const root = this.getSandboxRootPath(tenantId)
    return this.usesFlattenedSandboxVolumeLayout() ? root : path.join(root, 'workspaces', workspaceId)
  }

  private getLocalSandboxDataRoot() {
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || ''
    return path.join(homeDir, 'data')
  }
}
