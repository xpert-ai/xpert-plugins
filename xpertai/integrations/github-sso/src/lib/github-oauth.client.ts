import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { EnvHttpProxyAgent, fetch as undiciFetch, type RequestInit, type Response } from 'undici'
import { GITHUB_ACCESS_TOKEN_URL, GITHUB_API_URL, GITHUB_AUTHORIZE_URL } from './constants.js'
import { GitHubSsoError } from './github-sso.error.js'
import type { GitHubOAuthEmail, GitHubOAuthUser, GitHubVerifiedProfile, ResolvedGitHubSsoIntegration } from './types.js'

const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_USER_AGENT = 'Xpert-GitHub-SSO'
const GITHUB_REQUEST_TIMEOUT_MS = 15_000
let proxyDispatcher: EnvHttpProxyAgent | null = null

@Injectable()
export class GitHubOAuthClient {
  createPkce(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString('base64url')
    return {
      verifier,
      challenge: createHash('sha256').update(verifier).digest('base64url')
    }
  }

  buildAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
    const url = new URL(GITHUB_AUTHORIZE_URL)
    url.searchParams.set('client_id', input.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('scope', 'user:email')
    url.searchParams.set('state', input.state)
    url.searchParams.set('code_challenge', input.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  }

  async exchangeCode(
    integration: ResolvedGitHubSsoIntegration,
    input: {
      code: string
      redirectUri: string
      codeVerifier: string
    }
  ): Promise<string> {
    const payload = await requestJson(GITHUB_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': GITHUB_USER_AGENT
      },
      body: new URLSearchParams({
        client_id: integration.clientId,
        client_secret: integration.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier
      })
    })

    const error = readString(payload, 'error')
    if (error) {
      throw new GitHubSsoError(
        'oauth_failed',
        readString(payload, 'error_description') ?? 'GitHub rejected the OAuth authorization code.'
      )
    }

    const accessToken = readString(payload, 'access_token')
    if (!accessToken) {
      throw new GitHubSsoError('oauth_failed', 'GitHub OAuth response did not include an access token.')
    }
    return accessToken
  }

  async fetchVerifiedProfile(accessToken: string): Promise<GitHubVerifiedProfile> {
    const userPayload = await requestJson(`${GITHUB_API_URL}/user`, {
      headers: githubHeaders(accessToken)
    })
    const user = parseUser(userPayload)

    const emailPayload = await requestJson(`${GITHUB_API_URL}/user/emails`, {
      headers: githubHeaders(accessToken)
    })
    const emails = parseEmails(emailPayload)
    const primaryVerifiedEmail = emails.find((candidate) => candidate.primary && candidate.verified)
    if (!primaryVerifiedEmail) {
      throw new GitHubSsoError('verified_email_missing', 'GitHub did not return a primary verified email address.')
    }

    return {
      ...user,
      email: primaryVerifiedEmail.email.trim().toLowerCase()
    }
  }
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await undiciFetch(
      url,
      withProxyDispatcher({
        ...init,
        signal: init.signal ?? AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS)
      })
    )
  } catch (error) {
    throw new GitHubSsoError('oauth_failed', 'Unable to reach GitHub OAuth.', 400, error)
  }

  let body: unknown
  try {
    const text = await response.text()
    body = text ? JSON.parse(text) : {}
  } catch (error) {
    throw new GitHubSsoError('oauth_failed', 'GitHub returned an invalid JSON response.', 400, error)
  }

  if (!response.ok) {
    throw new GitHubSsoError(
      'oauth_failed',
      readString(body, 'message') ??
        readString(body, 'error_description') ??
        `GitHub request failed with HTTP ${response.status}.`
    )
  }
  return body
}

function withProxyDispatcher(init: RequestInit): RequestInit {
  if (!hasProxyConfiguration()) {
    return init
  }

  proxyDispatcher ??= new EnvHttpProxyAgent()
  return {
    ...init,
    dispatcher: proxyDispatcher
  }
}

function hasProxyConfiguration(): boolean {
  return [process.env.https_proxy, process.env.HTTPS_PROXY, process.env.http_proxy, process.env.HTTP_PROXY].some(
    (value) => Boolean(value?.trim())
  )
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${accessToken}`,
    'user-agent': GITHUB_USER_AGENT,
    'x-github-api-version': GITHUB_API_VERSION
  }
}

function parseUser(value: unknown): GitHubOAuthUser {
  const record = asRecord(value)
  const id = record.id
  const login = readString(record, 'login')
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !login) {
    throw new GitHubSsoError('github_user_invalid', 'GitHub returned an invalid user profile.')
  }

  return {
    id,
    login,
    name: readString(record, 'name'),
    avatarUrl: readString(record, 'avatar_url'),
    profileUrl: readString(record, 'html_url')
  }
}

function parseEmails(value: unknown): GitHubOAuthEmail[] {
  if (!Array.isArray(value)) {
    throw new GitHubSsoError('oauth_failed', 'GitHub returned an invalid email response.')
  }

  return value.flatMap((candidate): GitHubOAuthEmail[] => {
    const record = asRecord(candidate)
    const email = readString(record, 'email')
    if (!email || typeof record.primary !== 'boolean' || typeof record.verified !== 'boolean') {
      return []
    }
    return [
      {
        email,
        primary: record.primary,
        verified: record.verified
      }
    ]
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown, key: string): string | null {
  const candidate = asRecord(value)[key]
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}
