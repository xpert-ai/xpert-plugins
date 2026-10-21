import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const configForm = {
  type: 'object', properties: {
    githubIntegrationId: {
      type: 'string', title: text('GitHub system integration', 'GitHub 系统集成'),
      description: text('Select a tenant-level GitHub integration. Manage App credentials in Settings → System integrations. The Connector must authorize with this same integration.',
        '选择租户级 GitHub 集成。App 凭据统一在“设置 → 系统集成”管理，Connector 必须使用同一条集成授权。'),
      'x-ui': { component: 'remoteSelect', selectUrl: '/api/integration/select-options?provider=github&tenantOnly=true' }
    }
  }
} satisfies JsonSchemaObjectType
