jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'integration-permission-service'
}))

import { BaiduNetdiskConfigService, BaiduNetdiskPluginConfigSchema } from '../plugin-config.js'
import { BaiduNetdiskOAuthConfigService } from './baidu-netdisk-oauth-config.service.js'
import { BaiduNetdiskConnectorError } from '../errors.js'

describe('BaiduNetdiskOAuthConfigService', () => {
  const pluginConfig = new BaiduNetdiskConfigService(BaiduNetdiskPluginConfigSchema.parse({}))

  it('selects a tenant integration and ignores organization overrides', async () => {
    const permissionService = {
      findAllWithInheritance: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'org-app',
            provider: 'baidu-netdisk-oauth',
            organizationId: 'org-1',
            options: { appKey: 'wrong', secretKey: 'wrong' }
          },
          { id: 'tenant-app', provider: 'baidu-netdisk-oauth', options: { appKey: 'app-key', secretKey: 'secret-key' } }
        ],
        total: 2
      })
    }
    const context = { resolve: jest.fn().mockReturnValue(permissionService) }
    const service = new BaiduNetdiskOAuthConfigService(pluginConfig, context as never)
    await expect(service.resolve()).resolves.toMatchObject({
      integrationId: 'tenant-app',
      config: { appKey: 'app-key' }
    })
    await expect(service.resolve('org-app')).rejects.toMatchObject({ code: 'CONNECTOR_UNAVAILABLE' })
  })

  it('fails clearly when the tenant System Integration is missing', async () => {
    const context = {
      resolve: jest
        .fn()
        .mockReturnValue({ findAllWithInheritance: jest.fn().mockResolvedValue({ items: [], total: 0 }) })
    }
    const service = new BaiduNetdiskOAuthConfigService(pluginConfig, context as never)
    await expect(service.resolve()).rejects.toEqual(
      expect.objectContaining<Partial<BaiduNetdiskConnectorError>>({
        code: 'CONNECTOR_UNAVAILABLE'
      })
    )
  })
})
