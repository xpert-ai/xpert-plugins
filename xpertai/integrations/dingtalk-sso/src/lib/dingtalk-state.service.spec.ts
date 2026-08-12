import { DingTalkStateService } from './dingtalk-state.service.js'
import { DingTalkSsoError } from './types.js'

describe('DingTalkStateService', () => {
  beforeEach(() => jest.useRealTimers())

  function createService() {
    return new DingTalkStateService()
  }

  it('signs and verifies a complete login state', () => {
    const service = createService()
    const state = service.createState('ding-secret', {
      mode: 'login',
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      organizationId: 'org-1',
      returnTo: '/workspace',
      redirectUri: 'https://xpert.example.com/api/dingtalk-identity/callback',
      nonce: 'nonce-1'
    })

    expect(service.verifyState('ding-secret', state)).toEqual(
      expect.objectContaining({
        mode: 'login',
        tenantId: 'tenant-1',
        integrationId: 'integration-1',
        organizationId: 'org-1',
        returnTo: '/workspace',
        redirectUri: 'https://xpert.example.com/api/dingtalk-identity/callback'
      })
    )
  })

  it('rejects a tampered payload', () => {
    const service = createService()
    const state = service.createState('ding-secret', {
      mode: 'login',
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      redirectUri: 'https://xpert.example.com/api/dingtalk-identity/callback',
      nonce: 'nonce-1'
    })
    const parts = state.split('.')
    parts[1] = Buffer.from(JSON.stringify({ mode: 'login', tenantId: 'tenant-2' })).toString('base64url')

    expect(() => service.verifyState('ding-secret', parts.join('.'))).toThrow(/signature/i)
  })

  it('rejects state after ten minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T00:00:00.000Z'))
    const service = createService()
    const state = service.createState('ding-secret', {
      mode: 'login',
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      redirectUri: 'https://xpert.example.com/api/dingtalk-identity/callback',
      nonce: 'nonce-1'
    })
    jest.setSystemTime(new Date('2026-08-11T00:11:00.000Z'))

    expect(() => service.verifyState('ding-secret', state)).toThrow(DingTalkSsoError)
    try {
      service.verifyState('ding-secret', state)
    } catch (error) {
      expect((error as DingTalkSsoError).code).toBe('state_expired')
    }
  })
})
