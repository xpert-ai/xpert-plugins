import {
  mailFileDescriptorSchema,
  replyEmailSchema,
  searchEmailsSchema,
  sendEmailSchema,
  setEmailFlagsSchema
} from './tool-schemas.js'

describe('NetEase Mail tool schemas', () => {
  const baseSend = {
    operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
    to: ['alice@example.com'],
    subject: 'Hello',
    text: 'Body'
  }

  it('rejects unknown fields and empty bodies', () => {
    expect(sendEmailSchema.safeParse({ ...baseSend, unknown: true }).success).toBe(false)
    expect(sendEmailSchema.safeParse({ ...baseSend, text: ' ' }).success).toBe(false)
  })

  it('rejects duplicate recipients across recipient fields', () => {
    expect(sendEmailSchema.safeParse({ ...baseSend, cc: ['ALICE@example.com'] }).success).toBe(false)
  })

  it('requires confirmation fields as a pair', () => {
    expect(sendEmailSchema.safeParse({ ...baseSend, confirmed: true }).success).toBe(false)
    expect(sendEmailSchema.safeParse({ ...baseSend, confirmation_handle: crypto.randomUUID() }).success).toBe(false)
    expect(
      sendEmailSchema.safeParse({
        ...baseSend,
        confirmation_handle: crypto.randomUUID(),
        confirmed: true
      }).success
    ).toBe(true)
  })

  it('accepts portable workspace references but not undeclared attachment fields', () => {
    expect(mailFileDescriptorSchema.safeParse({ path: 'reports/result.pdf' }).success).toBe(true)
    expect(mailFileDescriptorSchema.safeParse({ url: 'https://example.com/file' }).success).toBe(false)
  })

  it('bounds search ranges and flag mutations', () => {
    expect(
      searchEmailsSchema.safeParse({
        since: '2024-01-01T00:00:00Z',
        before: '2025-01-03T00:00:00Z'
      }).success
    ).toBe(false)
    expect(setEmailFlagsSchema.safeParse({ messageRef: 'ref' }).success).toBe(false)
  })

  it('applies the same body and confirmation policy to replies', () => {
    expect(
      replyEmailSchema.safeParse({
        operationId: baseSend.operationId,
        messageRef: 'ref',
        text: 'Reply'
      }).success
    ).toBe(true)
    expect(
      replyEmailSchema.safeParse({
        operationId: baseSend.operationId,
        messageRef: 'ref',
        text: ''
      }).success
    ).toBe(false)
  })
})
