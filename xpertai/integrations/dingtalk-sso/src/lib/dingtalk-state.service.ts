import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  DingTalkSsoError,
  type DingTalkSsoState,
  type DingTalkSsoStateInput,
  DingTalkSsoStateSchema
} from './types.js'

const STATE_TTL_SECONDS = 10 * 60

@Injectable()
export class DingTalkStateService {
  createState(secret: string, payload: DingTalkSsoStateInput): string {
    const issuedAt = Math.floor(Date.now() / 1000)
    const encodedHeader = this.encodeSegment({ alg: 'HS256', typ: 'JWT' })
    const encodedPayload = this.encodeSegment({
      ...payload,
      iat: issuedAt,
      exp: issuedAt + STATE_TTL_SECONDS
    })
    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    return `${unsignedToken}.${this.sign(secret, unsignedToken)}`
  }

  verifyState(secret: string, token: string): DingTalkSsoState {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new DingTalkSsoError('state_invalid', 'Invalid OAuth state token.')
    }

    const [encodedHeader, encodedPayload, signature] = parts
    const header = this.decodeSegment<{ alg?: string }>(encodedHeader)
    if (header.alg !== 'HS256') {
      throw new DingTalkSsoError('state_invalid', 'Unsupported OAuth state algorithm.')
    }

    const unsignedToken = `${encodedHeader}.${encodedPayload}`
    const expectedSignature = this.sign(secret, unsignedToken)
    const signatureBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new DingTalkSsoError('state_invalid', 'OAuth state signature is invalid.')
    }

    const payload = DingTalkSsoStateSchema.safeParse(this.decodeSegment(encodedPayload))
    if (!payload.success) {
      throw new DingTalkSsoError('state_invalid', 'OAuth state payload is invalid.', 400, payload.error)
    }

    if (payload.data.exp <= Math.floor(Date.now() / 1000)) {
      throw new DingTalkSsoError('state_expired', 'OAuth state has expired.')
    }

    return payload.data
  }

  private sign(secret: string, value: string): string {
    return createHmac('sha256', secret)
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
      throw new DingTalkSsoError('state_invalid', 'OAuth state payload cannot be decoded.', 400, error)
    }
  }
}
