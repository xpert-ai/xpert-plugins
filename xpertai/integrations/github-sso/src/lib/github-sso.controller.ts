import { Controller, Get, Query, Request, Response, SetMetadata } from '@nestjs/common'
import { GITHUB_SSO_CALLBACK_PATH, GITHUB_SSO_STATE_TTL_SECONDS } from './constants.js'
import { isGitHubSsoError, GitHubSsoError } from './github-sso.error.js'
import { GitHubSsoService } from './github-sso.service.js'

const Public = () => SetMetadata('isPublic', true)

type RequestLike = {
  headers: Readonly<Record<string, string | string[] | undefined>>
  host?: string
  protocol?: string
  cookies?: Readonly<Record<string, string | undefined>>
  'anonymous-tenant-resolution'?: {
    tenantId?: string | null
  }
}

type CookieOptions = {
  httpOnly?: boolean
  sameSite?: 'lax'
  secure?: boolean
  maxAge?: number
  path?: string
}

type ResponseLike = {
  cookie(name: string, value: string, options: CookieOptions): void
  clearCookie(name: string, options: CookieOptions): void
  redirect(url: string): void
  status(code: number): {
    json(body: Record<string, unknown>): void
  }
}

@Controller('github-identity')
export class GitHubSsoController {
  constructor(private readonly identityService: GitHubSsoService) {}

  @Public()
  @Get('login/start')
  async loginStart(
    @Request() req: RequestLike,
    @Response() res: ResponseLike,
    @Query('returnTo') returnTo?: string
  ): Promise<void> {
    try {
      const result = await this.identityService.startLogin({
        tenantId: this.resolveTenantId(req),
        returnTo: asString(returnTo),
        requestBaseUrl: this.resolveRequestBaseUrl(req)
      })
      res.cookie(result.pkceCookie.name, result.pkceCookie.value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: result.pkceCookie.secure,
        maxAge: GITHUB_SSO_STATE_TTL_SECONDS * 1000,
        path: GITHUB_SSO_CALLBACK_PATH
      })
      res.redirect(result.authorizationUrl)
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
    const normalizedState = asString(state)
    const cookieName = this.identityService.resolvePkceCookieName(normalizedState)
    let secure = false

    try {
      const requestBaseUrl = this.resolveRequestBaseUrl(req)
      secure = requestBaseUrl.startsWith('https://')
      const result = await this.identityService.handleCallback({
        code: asString(code),
        state: normalizedState,
        oauthError: asString(oauthError),
        oauthErrorDescription: asString(oauthErrorDescription),
        requestBaseUrl,
        cookies: req.cookies
      })
      res.redirect(result.location)
    } catch (error) {
      this.handleError(res, error)
    } finally {
      if (cookieName) {
        res.clearCookie(cookieName, {
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: GITHUB_SSO_CALLBACK_PATH
        })
      }
    }
  }

  private resolveTenantId(req: RequestLike): string {
    const headerTenantId = firstHeader(req.headers['tenant-id']) ?? firstHeader(req.headers['Tenant-Id'])
    const resolvedTenantId = asString(req['anonymous-tenant-resolution']?.tenantId)

    if (!resolvedTenantId || !headerTenantId) {
      throw new GitHubSsoError(
        'tenant_context_invalid',
        'GitHub sign-in requires a tenant resolved from the current login domain.'
      )
    }
    if (resolvedTenantId !== headerTenantId) {
      throw new GitHubSsoError('tenant_context_invalid', 'The tenant header does not match the current login domain.')
    }
    return resolvedTenantId
  }

  private resolveRequestBaseUrl(req: RequestLike): string {
    const protocol = typeof req.protocol === 'string' && req.protocol ? req.protocol : 'http'
    const host = asString(req.host) ?? firstHeader(req.headers.host)

    if ((protocol !== 'http' && protocol !== 'https') || !host) {
      throw new GitHubSsoError('oauth_failed', 'Unable to resolve the Xpert public URL for GitHub OAuth.')
    }
    return `${protocol}://${host}`
  }

  private handleError(res: ResponseLike, error: unknown): void {
    if (isGitHubSsoError(error)) {
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
      message: 'Unexpected GitHub SSO error.'
    })
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
