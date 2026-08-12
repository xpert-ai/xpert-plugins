jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN'
}))

import { DingTalkSsoIntegrationResolver } from './dingtalk-sso-integration.resolver.js'

describe('DingTalkSsoIntegrationResolver', () => {
  function fixture(items: any[]) {
    const findAll = jest.fn().mockResolvedValue({ items })
    const context = { resolve: jest.fn().mockReturnValue({ findAll }) }
    const secret = { decrypt: jest.fn().mockReturnValue('ding-secret') }
    return { resolver: new DingTalkSsoIntegrationResolver(context as any, secret as any), findAll, secret }
  }

  const integration = {
    id: 'integration-1',
    provider: 'dingtalk-sso',
    tenantId: 'tenant-1',
    organizationId: null,
    options: { clientId: 'ding-client', clientSecret: 'enc:v1:value' }
  }

  it('resolves exactly one tenant-level integration', async () => {
    const { resolver, findAll } = fixture([integration])
    await expect(resolver.resolveForTenant('tenant-1')).resolves.toEqual({
      id: 'integration-1', tenantId: 'tenant-1', clientId: 'ding-client', clientSecret: 'ding-secret'
    })
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { provider: 'dingtalk-sso', tenantId: 'tenant-1', organizationId: null }
    }))
  })

  it('rejects missing, duplicate, organization, and invalid integrations', async () => {
    await expect(fixture([]).resolver.resolveForTenant('tenant-1')).rejects.toMatchObject({ code: 'integration_required' })
    await expect(fixture([integration, { ...integration, id: 'integration-2' }]).resolver.resolveForTenant('tenant-1')).rejects.toMatchObject({ code: 'integration_ambiguous' })
    await expect(fixture([{ ...integration, organizationId: 'org-1' }]).resolver.resolveForTenant('tenant-1')).rejects.toMatchObject({ code: 'integration_required' })
    await expect(fixture([{ ...integration, options: {} }]).resolver.resolveForTenant('tenant-1')).rejects.toMatchObject({ code: 'integration_invalid' })
  })

  it('rejects integrations outside the requested tenant and decryption failures', async () => {
    await expect(fixture([{ ...integration, tenantId: 'tenant-2' }]).resolver.resolveById('tenant-1', 'integration-1')).rejects.toMatchObject({ code: 'integration_required' })
    const { resolver, secret } = fixture([integration])
    secret.decrypt.mockImplementation(() => { throw new Error('bad ciphertext') })
    await expect(resolver.resolveForTenant('tenant-1')).rejects.toMatchObject({ code: 'integration_invalid' })
  })
})
