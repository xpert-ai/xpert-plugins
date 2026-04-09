jest.mock('@metad/contracts', () => ({
  __esModule: true,
  LongTermMemoryTypeEnum: {
    PROFILE: 'profile',
    QA: 'qa'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  RequestContext: {
    currentUser: jest.fn(() => null),
    currentTenantId: jest.fn(() => null),
    currentUserId: jest.fn(() => null)
  }
}))

import type { IUser } from '@metad/contracts'
import { UnauthorizedException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FileMemoryController } from './file-memory.controller.js'

describe('FileMemoryController request context resolution', () => {
  const scope = {
    scopeType: 'xpert' as const,
    scopeId: 'xpert-1',
    workspaceId: 'workspace-1'
  }

  function createController() {
    const service = {
      resolveScope: jest.fn().mockReturnValue(scope),
      listWorkbenchFiles: jest.fn().mockResolvedValue([]),
      readWorkbenchFile: jest.fn().mockResolvedValue({ path: 'my/test.md', content: 'hello' }),
      saveWorkbenchFile: jest.fn().mockResolvedValue({ path: 'my/test.md', content: 'hello' })
    }

    return {
      controller: new FileMemoryController(service as any),
      service
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('falls back to req.user for authenticated host requests', async () => {
    const { controller, service } = createController()
    const req = {
      user: {
        id: 'user-1',
        tenantId: 'tenant-1'
      } satisfies Partial<IUser>
    } as any

    await controller.getFiles('xpert-1', 'workspace-1', '', req)

    expect(service.listWorkbenchFiles).toHaveBeenCalledWith('tenant-1', scope, 'user-1', '')
  })

  it('keeps throwing unauthorized when neither RequestContext nor req.user provides identity', async () => {
    const { controller } = createController()

    await expect(controller.getFiles('xpert-1', 'workspace-1', '', {} as any)).rejects.toThrow(
      new UnauthorizedException('Authenticated tenant and user context are required')
    )
  })

  it('still prefers plugin RequestContext when it is available', async () => {
    const { controller, service } = createController()
    ;(RequestContext.currentUser as jest.Mock).mockReturnValue({
      id: 'context-user',
      tenantId: 'context-tenant'
    } satisfies Partial<IUser>)

    await controller.getFiles('xpert-1', 'workspace-1', '', {
      user: {
        id: 'request-user',
        tenantId: 'request-tenant'
      }
    } as any)

    expect(service.listWorkbenchFiles).toHaveBeenCalledWith('context-tenant', scope, 'context-user', '')
  })
})
