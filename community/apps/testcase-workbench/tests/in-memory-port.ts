import { UniqueViolationError, recordId, type WorkbenchRow, type WorkbenchStorePort } from '../src/lib/domain/workbench-store.js'
import type { WorkspaceScope } from '../src/lib/domain/contracts.js'

// A deterministic stand-in for the plugin database table. It preserves the two properties the
// business rules depend on: the scope/id is unique, and updates are guarded by the revision.
export class InMemoryPort implements WorkbenchStorePort {
  private rows = new Map<string, WorkbenchRow>()
  async findByScope(scope: WorkspaceScope) { const row = this.rows.get(recordId(scope)); return row ? { ...row } : null }
  async insert(row: WorkbenchRow) {
    if (this.rows.has(row.id)) throw new UniqueViolationError()
    this.rows.set(row.id, { ...row })
  }
  async updateByRevision(scope: WorkspaceScope, expectedRevision: number, patch: { revision: number; payloadJson: string; updatedAt: string }) {
    const id = recordId(scope)
    const current = this.rows.get(id)
    if (!current || current.revision !== expectedRevision) return { affected: 0 }
    this.rows.set(id, { ...current, ...patch })
    return { affected: 1 }
  }
  size() { return this.rows.size }
}

export const scope: WorkspaceScope = {
  tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', workspaceId: 'space-a', xpertId: 'assistant-a'
}
export const draftCase = {
  title: '登录成功', precondition: '已注册账号', steps: ['打开登录页', '输入正确账号密码', '点击登录'],
  expected: '跳转到首页', priority: 'P0' as const
}
