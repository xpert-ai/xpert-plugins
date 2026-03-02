import { createCipheriv, randomBytes } from 'crypto'
import {
  computeDingTalkSignature,
  decryptDingTalkEncrypt,
  encryptDingTalkMessage,
  verifyDingTalkSignature
} from './types.js'

function encryptDingTalkPayload(params: {
  aesKey: string
  appKey: string
  body: Record<string, unknown>
}): string {
  const random = randomBytes(16)
  const message = Buffer.from(JSON.stringify(params.body), 'utf8')
  const msgLength = Buffer.alloc(4)
  msgLength.writeUInt32BE(message.length, 0)
  const appKey = Buffer.from(params.appKey, 'utf8')

  const raw = Buffer.concat([random, msgLength, message, appKey])
  const blockSize = 32
  const padLength = blockSize - (raw.length % blockSize || blockSize)
  const pad = Buffer.alloc(padLength, padLength)
  const payload = Buffer.concat([raw, pad])

  const key = Buffer.from(`${params.aesKey}=`, 'base64')
  const iv = key.subarray(0, 16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(payload), cipher.final()]).toString('base64')
}

describe('dingtalk callback helpers', () => {
  it('verifies callback signature', () => {
    const token = 'token'
    const timestamp = '1730000000'
    const nonce = 'nonce'
    const encrypt = 'encrypt-value'
    const signature = computeDingTalkSignature({ token, timestamp, nonce, encrypt })

    expect(
      verifyDingTalkSignature({
        token,
        timestamp,
        nonce,
        encrypt,
        signature
      })
    ).toBe(true)

    expect(
      verifyDingTalkSignature({
        token,
        timestamp,
        nonce,
        encrypt,
        signature: 'invalid'
      })
    ).toBe(false)
  })

  it('decrypts encrypted callback payload', () => {
    const aesKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
    const appKey = 'ding-app-key'
    const body = {
      EventType: 'chat_update_title',
      challenge: 'ok'
    }

    const encrypt = encryptDingTalkPayload({
      aesKey,
      appKey,
      body
    })

    expect(
      JSON.parse(
        decryptDingTalkEncrypt({
          encrypt,
          aesKey,
          appKey
        })
      )
    ).toEqual(body)
  })

  it('encrypts callback ack payload', () => {
    const aesKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
    const appKey = 'ding-app-key'
    const encrypted = encryptDingTalkMessage({
      message: 'success',
      aesKey,
      appKey
    })

    expect(
      decryptDingTalkEncrypt({
        encrypt: encrypted,
        aesKey,
        appKey
      })
    ).toBe('success')
  })
})
