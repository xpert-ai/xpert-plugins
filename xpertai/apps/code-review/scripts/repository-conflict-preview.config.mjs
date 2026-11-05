// Synthetic ownership cases for the real built View/bridge; never contacts GitHub.
import base from './preview.config.mjs'
import { repositoryConflictSchema } from '../dist/repository-conflict-contract.js'

export default {
  ...base,
  title: 'Repository ownership conflicts',
  hostContext: { ...base.hostContext, initialQuery: { parameters: { section: 'repositories' } } },
  async handleRequest(message, context) {
    if (message.type === 'requestData' && message.query?.parameters?.automation) {
      return { scopeRevision: message.scopeRevision, type: 'data', data: { items: [], meta: {
        repositories: [], runs: [], total: 0,
        access: { canRead: true, canManage: true, organizationName: '当前组织' },
        labels: { users: [], assistants: [], workspaces: [] },
        app: { configured: true, installUrl: null, webhookUrl: null, integrationName: 'GitHub fixture' }
      } } }
    }
    if (message.type === 'executeAction' && message.actionKey === 'repository.add') {
      const { owner, repository: name } = message.input
      const envelope = { scopeRevision: message.scopeRevision, type: 'actionResult' }
      if (name === 'allowed') return { ...envelope, result: { success: true, data: { id: 'fixture' } } }
      if (name === 'unauthorized') return { ...envelope, result: { success: false, data: { code: 'repository_management_required' } } }
      const conflict = repositoryConflictSchema.parse(name === 'other-tenant'
        ? { kind: 'other_tenant', repository: { owner, name } }
        : { kind: name === 'other-assistant' ? 'other_assistant' : 'other_organization', repository: { owner, name },
          organization: { id: 'fixture-org', label: '示例研发组织' },
          configuredBy: { id: 'fixture-configurer', label: name === 'legacy' ? null : '配置人甲' },
          maintainer: { id: 'fixture-maintainer', label: '维护人乙' },
          assistant: name === 'other-assistant' ? { id: 'fixture-assistant', label: '已有代码审查助手' } : null,
          enabled: true, createdAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-04T01:00:00.000Z' })
      return { ...envelope, result: { success: false, refresh: false, data: { code: 'repository_owned_elsewhere', conflict } } }
    }
    return base.handleRequest(message, context)
  }
}
