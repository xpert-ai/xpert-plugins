import { createHash } from 'node:crypto'
import { decodeAttachment, mapAccount, mapMessage } from './qq-mail-mappers.js'

describe('QQ Mail MCP mappers', () => {
  it('allowlists GetMe fields and normalizes dynamic limits', () => {
    expect(
      mapAccount({
        data: {
          scopes: ['alias:read', 'mail:read'],
          aliases: [{ alias_id: 'alias-1', email: 'user@qq.com', is_primary: true, secret: 'drop' }],
          rate_limits: { requests_per_minute: 10, internal: 'drop' },
          constraints: { max_attachment_count: 3, max_attachment_size_bytes: 1024 },
          access_token: 'drop'
        }
      })
    ).toEqual({
      scopes: ['alias:read', 'mail:read'],
      aliases: [{ aliasId: 'alias-1', email: 'user@qq.com', name: undefined, isPrimary: true }],
      rateLimits: { requestsPerMinute: 10, requestsPerHour: undefined, dailySendQuota: undefined },
      constraints: {
        maxAttachmentSizeBytes: 1024,
        maxTotalAttachmentsSizeBytes: undefined,
        maxAttachmentCount: 3
      }
    })
  })

  it('converts message HTML to bounded plain text without returning HTML', () => {
    const message = mapMessage({
      data: {
        message_id: 'msg-1',
        subject: 'Status',
        body_format: 'HTML',
        body: '<p>Hello <strong>team</strong></p><script>ignore()</script>',
        from: { email: 'sender@example.com' }
      }
    })
    expect(message.textBody).toContain('Hello team')
    expect(message.textBody).not.toContain('<strong>')
    expect(message.textBody).not.toContain('ignore()')
    expect(message).not.toHaveProperty('body')
    expect(message.untrustedContent).toBe(true)
  })

  it('decodes and verifies an attachment without exposing Base64', () => {
    const buffer = Buffer.from('attachment bytes')
    const attachment = decodeAttachment({
      data: {
        attachment_id: 'att-1',
        filename: 'report.txt',
        content_type: 'text/plain',
        content: buffer.toString('base64'),
        size: buffer.length,
        sha1: createHash('sha1').update(buffer).digest('hex')
      }
    })
    expect(attachment.buffer).toEqual(buffer)
    expect(attachment).not.toHaveProperty('content')
  })

  it('rejects attachment checksum mismatches', () => {
    expect(() =>
      decodeAttachment({
        data: {
          attachment_id: 'att-1',
          filename: 'report.txt',
          content: Buffer.from('bytes').toString('base64'),
          size: 5,
          sha1: '0000000000000000000000000000000000000000'
        }
      })
    ).toThrow('SHA-1 verification failed')
  })
})
