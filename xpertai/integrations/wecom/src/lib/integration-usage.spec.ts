import { requireWeComUsage } from './integration-usage.js'
import type { IntegrationPermissionService } from '@xpert-ai/plugin-sdk'

const scope = { tenantId: 'tenant', organizationId: 'org' }
describe('WeCom consumption authorization', () => {
  it('fails closed on hosts without usage authorization', async () => {
    await expect(requireWeComUsage({} as IntegrationPermissionService, 'id', 'bind', scope)).rejects.toThrow('Upgrade')
  })
  it('passes trusted scope and usage and rejects denial or another provider', async () => {
    const readForUsage = jest.fn().mockResolvedValue({ id: 'id', provider: 'wecom' })
    const reader = { readForUsage } as IntegrationPermissionService
    await requireWeComUsage(reader, 'id', 'invoke', scope)
    expect(readForUsage).toHaveBeenCalledWith('id', 'invoke', scope)
    readForUsage.mockResolvedValueOnce(null)
    await expect(requireWeComUsage(reader, 'id', 'bind', scope)).rejects.toThrow('not authorized')
    readForUsage.mockResolvedValueOnce({ id: 'id', provider: 'github' })
    await expect(requireWeComUsage(reader, 'id', 'invoke', scope)).rejects.toThrow('not authorized')
  })
})
