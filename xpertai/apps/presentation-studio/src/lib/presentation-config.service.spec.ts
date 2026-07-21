import { PRESENTATION_CONFIG_DEFAULTS, PresentationConfigService } from './presentation-config.service.js'

describe('PresentationConfigService sharing policy', () => {
  it('keeps bundled fonts by default and accepts the managed online mode', () => {
    expect(PRESENTATION_CONFIG_DEFAULTS.fontSourceMode).toBe('bundled')
    const resolver = {
      resolve: jest.fn().mockReturnValue({ ...PRESENTATION_CONFIG_DEFAULTS, fontSourceMode: 'online' })
    }

    expect(new PresentationConfigService(resolver).get().fontSourceMode).toBe('online')
  })

  it('resolves sharing configuration from the current organization scope', () => {
    const resolver = {
      resolve: jest.fn().mockReturnValue({
        ...PRESENTATION_CONFIG_DEFAULTS,
        defaultShareAccessMode: 'organization_all',
        allowedShareAccessModes: ['workspace_all', 'organization_all']
      })
    }
    const service = new PresentationConfigService(resolver)

    expect(service.getSharePolicy({ organizationId: 'org-1' })).toEqual({
      defaultAccessMode: 'organization_all',
      allowedAccessModes: ['workspace_all', 'organization_all'],
      allowAgentPublicSharing: true,
      allowWorkbenchPublicSharing: true
    })
    expect(resolver.resolve).toHaveBeenCalledWith('@xpert-ai/plugin-presentation-studio', expect.objectContaining({
      organizationId: 'org-1'
    }))
  })

  it('rejects Agent public sharing when the organization policy disables it', () => {
    const resolver = {
      resolve: jest.fn().mockReturnValue({
        ...PRESENTATION_CONFIG_DEFAULTS,
        allowAgentPublicSharing: false
      })
    }
    const service = new PresentationConfigService(resolver)

    expect(() => service.resolveShareAccessMode({ organizationId: 'org-1' }, 'public_link', 'agent'))
      .toThrow('does not allow agents to create public presentation links')
  })
})
