import { createHmac, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { LarkSsoPluginConfig } from './plugin-config.js'
import { LARK_SSO_PLUGIN_CONFIG } from './tokens.js'
import {
  LarkSsoError,
  LarkSsoState,
  LarkSsoStateInput,
  LarkSsoStateSchema
} from './types.js'

@Injectable()
export class LarkStateService {
  constructor(
    @Inject(LARK_SSO_PLUGIN_CONFIG)
    private readonly config: LarkSsoPluginConfig
  ) {}

  createState(payload: LarkSsoStateInput): string {
    const issuedAt = Math.floor(Date.now() / 1000)
    const tokenPayload = {
      ...payload,
      iat: issuedAt,
      exp: issuedAt + 10 * 60
    }

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    }

    const encodedHeader = this.encodeSegment(header)
    const encodedPayload = this.encodeSegment(tokenPayload)
    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    return `${unsignedToken}.${this.sign(unsignedToken)}`
  }

  verifyState(token: string): LarkSsoState {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new LarkSsoError('state_invalid', 'Invalid OAuth state token.')
    }

    const [encodedHeader, encodedPayload, signature] = parts
    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    const decodedHeader = this.decodeSegment<{ alg?: string }>(encodedHeader)
    if (decodedHeader.alg !== 'HS256') {
      throw new LarkSsoError('state_invalid', 'Unsupported OAuth state algorithm.')
    }

    const expectedSignature = this.sign(unsignedToken)
    const signatureBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new LarkSsoError('state_invalid', 'OAuth state signature is invalid.')
    }

    const payload = LarkSsoStateSchema.safeParse(this.decodeSegment(encodedPayload))
    if (!payload.success) {
      throw new LarkSsoError('state_invalid', 'OAuth state payload is invalid.')
    }

    const now = Math.floor(Date.now() / 1000)
    if (payload.data.exp <= now) {
      throw new LarkSsoError('state_expired', 'OAuth state has expired.')
    }

    return payload.data
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.appSecret)
      .update(value)
      .digest('base64url')
  }

  private encodeSegment(value: unknown): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  }

  private decodeSegment<T = Record<string, unknown>>(value: string): T {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
    } catch (error) {
      throw new LarkSsoError('state_invalid', 'OAuth state payload cannot be decoded.', 400, error)
    }
  }
}
