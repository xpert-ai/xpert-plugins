import type { IUser } from '@xpert-ai/contracts'
import { Controller, Get, Query, Request, Response, SetMetadata } from '@nestjs/common'
import { DingTalkSsoService } from './dingtalk-sso.service.js'
import { DingTalkSsoError, isDingTalkSsoError } from './types.js'

const Public = () => SetMetadata('isPublic', true)

type RequestLike = {
  headers: Readonly<Record<string, string | string[] | undefined>>
  host?: string
  protocol?: string
  user?: IUser
  'anonymous-tenant-resolution'?: {
    tenantId?: string | null
    organizationId?: string | null
  }
}

type ResponseLike = {
  redirect(url: string): void
  status(code: number): {
    json(body: Record<string, unknown>): void
  }
}

@Controller('dingtalk-identity')
export class DingTalkSsoController {
  constructor(private readonly identityService: DingTalkSsoService) {}

  @Get('bind/start')
  async bindStart(
    @Request() req: RequestLike,
    @Response() res: ResponseLike,
    @Query('returnTo') returnTo?: string
  ): Promise<void> {
    try {
      const user = req.user
      if (!user?.id) {
        throw new DingTalkSsoError('current_user_required', 'Current Xpert user is missing.')
      }
      const tenantId = user.tenantId ?? this.firstHeader(req.headers['tenant-id'])
      if (!tenantId) {
        throw new DingTalkSsoError('tenant_required', 'tenantId is missing from the current request context.')
      }

      const scopedUser = user as IUser & { organizationId?: string | null }
      const organizationId =
        this.asString(scopedUser.organizationId) ?? this.firstHeader(req.headers['organization-id'])
      res.redirect(
        await this.identityService.startBind({
          userId: user.id,
          tenantId,
          organizationId,
          returnTo: this.asString(returnTo),
          requestBaseUrl: this.resolveRequestBaseUrl(req)
        })
      )
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
      const tenantId = this.resolveAnonymousTenantId(req)
      const resolvedOrganizationId = this.asString(req['anonymous-tenant-resolution']?.organizationId)
      const headerOrganizationId = this.firstHeader(req.headers['organization-id'])
      if (resolvedOrganizationId && headerOrganizationId && resolvedOrganizationId !== headerOrganizationId) {
        throw new DingTalkSsoError(
          'tenant_required',
          'The organization header does not match the current login domain.'
        )
      }

      res.redirect(
        await this.identityService.startLogin({
          tenantId,
          organizationId: resolvedOrganizationId ?? headerOrganizationId,
          returnTo: this.asString(returnTo),
          requestBaseUrl: this.resolveRequestBaseUrl(req)
        })
      )
    } catch (error) {
      this.handleError(res, error)
    }
  }

  @Public()
  @Get('callback')
  async callback(
    @Request() req: RequestLike,
    @Response() res: ResponseLike,
    @Query('authCode') authCode?: string,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') oauthError?: string,
    @Query('error_description') oauthErrorDescription?: string
  ): Promise<void> {
    try {
      const result = await this.identityService.handleCallback({
        authorizationCode: this.asString(authCode) ?? this.asString(code),
        state: this.asString(state),
        oauthError: this.asString(oauthError),
        oauthErrorDescription: this.asString(oauthErrorDescription),
        requestBaseUrl: this.resolveRequestBaseUrl(req)
      })
      res.redirect(result.location)
    } catch (error) {
      this.handleError(res, error)
    }
  }

  private resolveAnonymousTenantId(req: RequestLike): string {
    const resolvedTenantId = this.asString(req['anonymous-tenant-resolution']?.tenantId)
    const headerTenantId = this.firstHeader(req.headers['tenant-id'])
    if (!resolvedTenantId && !headerTenantId) {
      throw new DingTalkSsoError('tenant_required', 'tenantId is missing from the current login domain.')
    }
    if (resolvedTenantId && headerTenantId && resolvedTenantId !== headerTenantId) {
      throw new DingTalkSsoError('tenant_required', 'The tenant header does not match the current login domain.')
    }
    if (resolvedTenantId) {
      return resolvedTenantId
    }
    if (headerTenantId) {
      return headerTenantId
    }
    throw new DingTalkSsoError('tenant_required', 'tenantId is missing from the current login domain.')
  }

  private resolveRequestBaseUrl(req: RequestLike): string {
    const protocol = this.forwardedHeader(req.headers['x-forwarded-proto']) ?? this.asString(req.protocol) ?? 'http'
    const host =
      this.forwardedHeader(req.headers['x-forwarded-host']) ??
      this.asString(req.host) ??
      this.firstHeader(req.headers.host)
    if (!['http', 'https'].includes(protocol) || !host) {
      throw new DingTalkSsoError('oauth_failed', 'Unable to resolve the Xpert public URL.')
    }
    return `${protocol}://${host}`
  }

  private handleError(res: ResponseLike, error: unknown): void {
    if (isDingTalkSsoError(error)) {
      res.status(error.status).json({ success: false, code: error.code, message: error.message })
      return
    }
    res.status(500).json({
      success: false,
      code: 'internal_error',
      message: 'Unexpected DingTalk SSO error.'
    })
  }

  private firstHeader(value: string | string[] | undefined): string | undefined {
    return this.asString(Array.isArray(value) ? value[0] : value)
  }

  private forwardedHeader(value: string | string[] | undefined): string | undefined {
    return this.firstHeader(value)
      ?.split(',')
      .map((part) => part.trim())
      .find(Boolean)
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
}
