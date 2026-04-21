import { LarkStateService } from './lark-state.service.js'
import { LarkSsoError } from './types.js'

describe('LarkStateService', () => {
  beforeEach(() => {
    jest.useRealTimers()
  })

  function createService() {
    return new LarkStateService({
      appId: 'cli_xxx',
      appSecret: 'secret'
    } as any)
  }

  it('creates and verifies bind state with HS256 signature', () => {
    const service = createService()
    const state = service.createState({
      mode: 'bind',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      returnTo: '/account',
      nonce: 'nonce-1'
    })

    expect(service.verifyState(state)).toEqual(
      expect.objectContaining({
        mode: 'bind',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        returnTo: '/account',
        nonce: 'nonce-1'
      })
    )
  })

  it('fails with state_invalid when signature is tampered', () => {
    const service = createService()
    const state = service.createState({
      mode: 'login',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      returnTo: '/workspace',
      nonce: 'nonce-1'
    })

    const parts = state.split('.')
    parts[1] = Buffer.from(
      JSON.stringify({
        mode: 'login',
        tenantId: 'tenant-2',
        organizationId: 'org-1',
        returnTo: '/workspace',
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      }),
      'utf8'
    ).toString('base64url')

    expect(() => service.verifyState(parts.join('.'))).toThrow(LarkSsoError)
    expect(() => service.verifyState(parts.join('.'))).toThrow(/signature/i)
  })

  it('fails with state_expired after 10 minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-14T00:00:00.000Z'))

    const service = createService()
    const state = service.createState({
      mode: 'login',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      returnTo: '/workspace',
      nonce: 'nonce-1'
    })

    jest.setSystemTime(new Date('2026-04-14T00:11:00.000Z'))

    expect(() => service.verifyState(state)).toThrow(LarkSsoError)
    try {
      service.verifyState(state)
    } catch (error) {
      expect((error as LarkSsoError).code).toBe('state_expired')
    }
  })
})
