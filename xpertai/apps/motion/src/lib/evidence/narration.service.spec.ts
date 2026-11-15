import { MotionNarrationService } from './narration.service.js'
it('never synthesizes again on duplicate delivery of a claimed operation', async () => {
  const exports = {
    findOneByOrFail: jest.fn(async () => ({ id: 'id', status: 'running' })),
    update: jest.fn(async () => ({ affected: 0 }))
  }
  const runtime = { createScopedApi: jest.fn() }
  const service = new MotionNarrationService({} as never, exports as never, {} as never, runtime as never, {} as never)
  await service.handle({ data: { exportId: 'id', tenantId: 'tenant', organizationId: 'org' } } as never)
  expect(runtime.createScopedApi).not.toHaveBeenCalled()
  expect(exports.update).toHaveBeenCalledTimes(1)
})
it('rechecks access after durable claim and records failure before any billable model request', async () => {
  const exports = {
    findOneByOrFail: jest.fn(async () => ({
      id: 'id',
      status: 'queued',
      tenantId: 'tenant',
      organizationId: 'org',
      createdById: 'actor',
      assistantId: 'assistant',
      motionProjectId: 'project'
    })),
    update: jest.fn(async () => ({ affected: 1 }))
  }
  const projects = { findOneByOrFail: jest.fn(async () => ({ contentModel: 'other' })) },
    runtime = { createScopedApi: jest.fn() }
  const service = new MotionNarrationService(
    projects as never,
    exports as never,
    {} as never,
    runtime as never,
    {} as never
  )
  await expect(
    service.handle({ data: { exportId: 'id', tenantId: 'tenant', organizationId: 'org' } } as never)
  ).rejects.toThrow('EVIDENCE_REQUIRED')
  expect(runtime.createScopedApi).not.toHaveBeenCalled()
  expect(exports.update).toHaveBeenLastCalledWith('id', expect.objectContaining({ status: 'failed' }))
})
