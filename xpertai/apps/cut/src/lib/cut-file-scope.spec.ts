import { cutFileDestination } from './cut-file-scope.js'

describe('Cut background file scope', () => {
  const scope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }
  const fileScope = { ...scope, catalog: 'users' as const, scopeId: 'user-1' }

  it('keeps standalone outputs in the authenticated personal catalog', () => {
    expect(cutFileDestination({ ...scope, fileScope })).toEqual({ ...fileScope, isolateByUser: false })
  })
  it('rejects a missing storage binding instead of using the business project as an Assistant', () => {
    expect(() => cutFileDestination(scope)).toThrow('explicit host storage binding')
  })
  it.each([
    { ...fileScope, userId: 'other-user' }, { ...fileScope, scopeId: 'other-user' },
    { ...fileScope, projectId: 'foreign-project' }, { ...fileScope, rootId: 'foreign-root' },
    { ...fileScope, organizationId: 'other-org' }, { ...fileScope, tenantId: 'other-tenant' }
  ])('rejects a queued scope that changes identity', (files) => {
    expect(() => cutFileDestination({ ...scope, fileScope: files })).toThrow()
  })
  it('preserves existing Project jobs', () => {
    expect(cutFileDestination({ ...scope, projectId: 'project-1' }))
      .toMatchObject({ catalog: 'projects', scopeId: 'project-1', projectId: 'project-1' })
  })
})
