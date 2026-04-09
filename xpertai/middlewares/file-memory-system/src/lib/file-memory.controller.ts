import type { IUser } from '@metad/contracts'
import { Body, Controller, Get, Param, Put, Query, Request, UnauthorizedException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertFileMemoryService } from './file-memory.service.js'

@Controller('file-memory')
export class FileMemoryController {
  constructor(private readonly fileMemoryService: XpertFileMemoryService) {}

  @Get('xpert/:xpertId/files')
  async getFiles(
    @Param('xpertId') xpertId: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('path') path?: string,
    @Request() req?: { user?: IUser }
  ) {
    const context = this.getRequestContext(req)
    const scope = this.fileMemoryService.resolveScope({
      id: xpertId,
      workspaceId: normalizeOptionalValue(workspaceId)
    })

    return this.fileMemoryService.listWorkbenchFiles(context.tenantId, scope, context.userId, path ?? '')
  }

  @Get('xpert/:xpertId/file')
  async getFile(
    @Param('xpertId') xpertId: string,
    @Query('workspaceId') workspaceId: string | undefined,
    @Query('path') path: string,
    @Request() req?: { user?: IUser }
  ) {
    const context = this.getRequestContext(req)
    const scope = this.fileMemoryService.resolveScope({
      id: xpertId,
      workspaceId: normalizeOptionalValue(workspaceId)
    })

    return this.fileMemoryService.readWorkbenchFile(context.tenantId, scope, context.userId, path)
  }

  @Put('xpert/:xpertId/file')
  async saveFile(
    @Param('xpertId') xpertId: string,
    @Body()
    body: {
      workspaceId?: string | null
      path: string
      content: string
    },
    @Request() req?: { user?: IUser }
  ) {
    const context = this.getRequestContext(req)
    const scope = this.fileMemoryService.resolveScope({
      id: xpertId,
      workspaceId: normalizeOptionalValue(body?.workspaceId)
    })

    return this.fileMemoryService.saveWorkbenchFile(
      context.tenantId,
      scope,
      context.userId,
      body?.path,
      body?.content ?? '',
      context.userId
    )
  }

  private getRequestContext(req?: { user?: IUser }) {
    const contextUser = (RequestContext.currentUser() ?? req?.user) as IUser | undefined
    const tenantId = contextUser?.tenantId ?? RequestContext.currentTenantId()
    const userId = contextUser?.id ?? RequestContext.currentUserId()

    if (!tenantId || !userId) {
      throw new UnauthorizedException('Authenticated tenant and user context are required')
    }

    return {
      tenantId,
      userId
    }
  }
}

function normalizeOptionalValue(value?: string | null) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}
