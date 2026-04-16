import type { IUser } from '@metad/contracts'
import { Controller, Get, Query, Request, Response, SetMetadata } from '@nestjs/common'
import { LarkIdentityService } from './lark-identity.service.js'
import { isLarkIdentityError, LarkIdentityError } from './types.js'

const Public = () => SetMetadata('isPublic', true)

type RequestLike = {
  headers: Record<string, string | string[] | undefined>
  host?: string
  protocol?: string
  user?: IUser
}

type ResponseLike = {
  redirect(url: string): void
  status(code: number): {
    json(body: Record<string, unknown>): void
  }
  json(body: Record<string, unknown>): void
}

@Controller('lark-identity')
export class LarkIdentityController {
  constructor(private readonly identityService: LarkIdentityService) {}

  @Get('bind/start')
  async bindStart(
    @Request() req: RequestLike,
    @Response() res: ResponseLike,
    @Query('returnTo') returnTo?: string
  ): Promise<void> {
    try {
      const user = this.resolveCurrentUser(req)
      if (!user?.id) {
        throw new LarkIdentityError('current_user_required', 'Current Xpert user is missing.')
      }

      const tenantId = this.resolveTenantId(req, user)
      const organizationId = this.resolveOrganizationId(req, user)
      const redirectUrl = this.identityService.startBind({
        userId: user.id,
        tenantId,
        organizationId,
        returnTo: this.asString(returnTo),
        requestBaseUrl: this.resolveRequestBaseUrl(req)
      })

      res.redirect(redirectUrl)
    } catch (error) {
      this.handleError(res, error)
    }
  }

  @Public()
  @Get('login/start')
  async loginStart(
    @Request() req: RequestLike,
    @Response() res: ResponseLike,
    @Query('returnTo') returnTo?: string
  ): Promise<void> {
    try {
      const redirectUrl = this.identityService.startLogin({
        tenantId: this.resolveAnonymousTenantId(req),
        organizationId: this.resolveAnonymousOrganizationId(req),
        returnTo: this.asString(returnTo),
        requestBaseUrl: this.resolveRequestBaseUrl(req)
      })

      res.redirect(redirectUrl)
    } catch (error) {
      this.handleError(res, error)
    }
  }

  @Public()
  @Get('callback')
  async callback(
    @Request() req: RequestLike,
    @Response() res: ResponseLike,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') oauthError?: string,
    @Query('error_description') oauthErrorDescription?: string
  ): Promise<void> {
    try {
      const result = await this.identityService.handleCallback({
        code: this.asString(code),
        state: this.asString(state),
        oauthError: this.asString(oauthError),
        oauthErrorDescription: this.asString(oauthErrorDescription),
        requestBaseUrl: this.resolveRequestBaseUrl(req)
      })

      if (result.type === 'redirect') {
        res.redirect(result.location)
        return
      }

      res.status(result.status).json(result.body)
    } catch (error) {
      this.handleError(res, error)
    }
  }

  private resolveCurrentUser(req: RequestLike): IUser | null {
    const user = req.user as IUser | undefined
    return user ?? null
  }

  private resolveTenantId(req: RequestLike, user: IUser): string {
    const tenantId =
      user?.tenantId ??
      this.getFirstHeader(req.headers['tenant-id']) ??
      this.getFirstHeader(req.headers['Tenant-Id'])
    if (!tenantId) {
      throw new LarkIdentityError('tenant_required', 'tenantId is missing from the current request context.')
    }
    return tenantId
  }

  private resolveAnonymousTenantId(req: RequestLike): string {
    const tenantId =
      this.getFirstHeader(req.headers['tenant-id']) ??
      this.getFirstHeader(req.headers['Tenant-Id'])
    if (!tenantId) {
      throw new LarkIdentityError('tenant_required', 'tenantId is missing from the current request context.')
    }
    return tenantId
  }

  private resolveOrganizationId(req: RequestLike, user: IUser): string | undefined {
    const scopedUser = user as IUser & { organizationId?: string | null }
    return (
      (typeof scopedUser.organizationId === 'string' && scopedUser.organizationId.trim().length > 0
        ? scopedUser.organizationId
        : undefined) ??
      this.getFirstHeader(req.headers['organization-id']) ??
      this.getFirstHeader(req.headers['Organization-Id'])
    )
  }

  private resolveAnonymousOrganizationId(req: RequestLike): string | undefined {
    return (
      this.getFirstHeader(req.headers['organization-id']) ??
      this.getFirstHeader(req.headers['Organization-Id'])
    )
  }

  private resolveRequestBaseUrl(req: RequestLike): string {
    const protocol =
      this.getForwardedValue(req.headers['x-forwarded-proto']) ??
      (typeof req.protocol === 'string' && req.protocol ? req.protocol : 'http')
    const host =
      this.getForwardedValue(req.headers['x-forwarded-host']) ??
      this.getFirstHeader(req.headers.host)

    if (!host) {
      throw new LarkIdentityError('oauth_failed', 'Unable to resolve request host for Lark identity callback URL.')
    }

    return `${protocol}://${host}`
  }

  private getForwardedValue(value: string | string[] | undefined): string | undefined {
    const header = this.getFirstHeader(value)
    if (!header) {
      return undefined
    }
    return header
      .split(',')
      .map((part) => part.trim())
      .find(Boolean)
  }

  private getFirstHeader(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0]
    }
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  }

  private handleError(res: ResponseLike, error: unknown) {
    if (isLarkIdentityError(error)) {
      res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message
      })
      return
    }

    res.status(500).json({
      success: false,
      code: 'internal_error',
      message: (error as Error)?.message || 'Unexpected Lark identity error.'
    })
  }
}
