import { GitHubStateService } from './github-state.service.js'
import { GitHubSsoError } from './github-sso.error.js'

describe('GitHubStateService', () => {
  const payload = {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    nonce: 'abcdefghijklmnopqrstuvwx',
    redirectUri: 'https://xpert.example.com/api/github-identity/callback',
    returnTo: '/workspace'
  }

  beforeEach(() => {
    jest.useRealTimers()
  })

  it('signs a ten-minute state and verifies its complete payload', () => {
    const service = new GitHubStateService()
    const state = service.createState('client-secret', payload)

    expect(service.readSelector(state)).toEqual({
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      nonce: 'abcdefghijklmnopqrstuvwx'
    })
    expect(service.verifyState('client-secret', state)).toEqual(expect.objectContaining(payload))
  })

  it('rejects a state whose payload was changed without resigning', () => {
    const service = new GitHubStateService()
    const state = service.createState('client-secret', payload)
    const parts = state.split('.')
    parts[1] = Buffer.from(
      JSON.stringify({
        ...payload,
        tenantId: 'tenant-2',
        iat: 1,
        exp: 601
      })
    ).toString('base64url')

    expect(() => service.verifyState('client-secret', parts.join('.'))).toThrow(/signature/i)
  })

  it('rejects state after its ten-minute lifetime', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T00:00:00.000Z'))
    const service = new GitHubStateService()
    const state = service.createState('client-secret', payload)
    jest.setSystemTime(new Date('2026-07-30T00:10:01.000Z'))

    expect(() => service.verifyState('client-secret', state)).toThrow(GitHubSsoError)
    try {
      service.verifyState('client-secret', state)
    } catch (error) {
      expect((error as GitHubSsoError).code).toBe('state_expired')
    }
  })
})
