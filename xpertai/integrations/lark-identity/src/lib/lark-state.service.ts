import { createHmac, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { LarkIdentityPluginConfig } from './plugin-config.js'
import { LARK_IDENTITY_PLUGIN_CONFIG } from './tokens.js'
import {
  LarkIdentityError,
  LarkIdentityState,
  LarkIdentityStateInput,
  LarkIdentityStateSchema
} from './types.js'

@Injectable()
export class LarkStateService {
  constructor(
    @Inject(LARK_IDENTITY_PLUGIN_CONFIG)
    private readonly config: LarkIdentityPluginConfig
  ) {}

  createState(payload: LarkIdentityStateInput): string {
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

  verifyState(token: string): LarkIdentityState {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new LarkIdentityError('state_invalid', 'Invalid OAuth state token.')
    }

    const [encodedHeader, encodedPayload, signature] = parts
    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    const decodedHeader = this.decodeSegment<{ alg?: string }>(encodedHeader)
    if (decodedHeader.alg !== 'HS256') {
      throw new LarkIdentityError('state_invalid', 'Unsupported OAuth state algorithm.')
    }

    const expectedSignature = this.sign(unsignedToken)
    const signatureBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new LarkIdentityError('state_invalid', 'OAuth state signature is invalid.')
    }

    const payload = LarkIdentityStateSchema.safeParse(this.decodeSegment(encodedPayload))
    if (!payload.success) {
      throw new LarkIdentityError('state_invalid', 'OAuth state payload is invalid.')
    }

    const now = Math.floor(Date.now() / 1000)
    if (payload.data.exp <= now) {
      throw new LarkIdentityError('state_expired', 'OAuth state has expired.')
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
      throw new LarkIdentityError('state_invalid', 'OAuth state payload cannot be decoded.', 400, error)
    }
  }
}
