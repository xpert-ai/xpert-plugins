import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { GITHUB_SSO_STATE_TTL_SECONDS } from './constants.js'
import { GitHubSsoError } from './github-sso.error.js'
import {
  GitHubSsoStateSchema,
  GitHubSsoStateSelectorSchema,
  type GitHubSsoState,
  type GitHubSsoStateInput,
  type GitHubSsoStateSelector
} from './types.js'

@Injectable()
export class GitHubStateService {
  createState(secret: string, payload: GitHubSsoStateInput): string {
    const issuedAt = Math.floor(Date.now() / 1000)
    const tokenPayload = {
      ...payload,
      iat: issuedAt,
      exp: issuedAt + GITHUB_SSO_STATE_TTL_SECONDS
    }
    const encodedHeader = encodeSegment({ alg: 'HS256', typ: 'JWT' })
    const encodedPayload = encodeSegment(tokenPayload)
    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    return `${unsignedToken}.${sign(secret, unsignedToken)}`
  }

  readSelector(token: string): GitHubSsoStateSelector {
    const [, encodedPayload] = splitToken(token)
    const parsed = GitHubSsoStateSelectorSchema.safeParse(decodeSegment(encodedPayload))
    if (!parsed.success) {
      throw new GitHubSsoError('state_invalid', 'OAuth state selector is invalid.')
    }
    return parsed.data
  }

  verifyState(secret: string, token: string): GitHubSsoState {
    const [encodedHeader, encodedPayload, signature] = splitToken(token)
    const header = asRecord(decodeSegment(encodedHeader))
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new GitHubSsoError('state_invalid', 'Unsupported OAuth state header.')
    }

    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    const actual = Buffer.from(signature, 'utf8')
    const expected = Buffer.from(sign(secret, unsignedToken), 'utf8')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new GitHubSsoError('state_invalid', 'OAuth state signature is invalid.')
    }

    const parsed = GitHubSsoStateSchema.safeParse(decodeSegment(encodedPayload))
    if (!parsed.success) {
      throw new GitHubSsoError('state_invalid', 'OAuth state payload is invalid.')
    }

    const now = Math.floor(Date.now() / 1000)
    if (parsed.data.exp <= now) {
      throw new GitHubSsoError('state_expired', 'OAuth state has expired.')
    }
    if (parsed.data.iat > now + 60) {
      throw new GitHubSsoError('state_invalid', 'OAuth state issue time is invalid.')
    }

    return parsed.data
  }
}

function splitToken(token: string): [string, string, string] {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new GitHubSsoError('state_invalid', 'Invalid OAuth state token.')
  }
  return [parts[0], parts[1], parts[2]]
}

function sign(secret: string, value: string): string {
  if (!secret.trim()) {
    throw new GitHubSsoError('integration_invalid', 'GitHub OAuth integration secret is missing.')
  }
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeSegment(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch (error) {
    throw new GitHubSsoError('state_invalid', 'OAuth state cannot be decoded.', 400, error)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
