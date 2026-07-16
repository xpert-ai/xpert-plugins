jest.mock('@xpert-ai/plugin-sdk', () => {
  const { createLarkPluginSdkMock } = require('../../../../test-utils/larkPluginSdkMock.cjs')
  return createLarkPluginSdkMock(jest, {
    WorkspaceFilesRuntimeCapability: Symbol('WorkspaceFilesRuntimeCapability'),
    XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES_TOKEN'
  })
})

import { LarkMessageHistorySchemaService } from './lark-message-history-schema.service.js'

describe('LarkMessageHistorySchemaService', () => {
  function createFixture(queryError?: Error) {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (queryError && sql.includes('CREATE EXTENSION')) {
          throw queryError
        }
        return []
      }),
      release: jest.fn().mockResolvedValue(undefined)
    }
    const service = new LarkMessageHistorySchemaService({
      isInitialized: true,
      options: { type: 'postgres' },
      createQueryRunner: jest.fn().mockReturnValue(queryRunner)
    } as any)
    return { service, queryRunner }
  }

  it('creates a plugin-owned trigram index for exact substring search at scale', async () => {
    const { service, queryRunner } = createFixture()

    await service.ensureSchema()

    expect(queryRunner.query).toHaveBeenNthCalledWith(1, 'CREATE EXTENSION IF NOT EXISTS pg_trgm')
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('plugin_lark_message_log_admin_search_trgm_idx')
    )
    expect(queryRunner.query.mock.calls[2][0]).toContain('CREATE INDEX CONCURRENTLY')
    expect(queryRunner.query.mock.calls[2][0]).toContain('gin_trgm_ops')
    expect(queryRunner.release).toHaveBeenCalled()
  })

  it('does not block plugin startup when pg_trgm cannot be installed', async () => {
    const { service, queryRunner } = createFixture(new Error('permission denied'))

    await expect(service.ensureSchema()).resolves.toBeUndefined()
    expect(queryRunner.release).toHaveBeenCalled()
  })

  it('contains query-runner creation failures without rejecting bootstrap', async () => {
    const service = new LarkMessageHistorySchemaService({
      isInitialized: true,
      options: { type: 'postgres' },
      createQueryRunner: jest.fn().mockImplementation(() => {
        throw new Error('data source is shutting down')
      })
    } as any)

    await expect(service.ensureSchema()).resolves.toBeUndefined()
  })
})
