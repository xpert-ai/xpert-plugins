import { MailReferenceService } from './mail-reference.service.js'

describe('MailReferenceService', () => {
  const references = new MailReferenceService()

  it('round-trips opaque message references', () => {
    const encoded = references.encodeMessage({ folder: 'INBOX', uidValidity: '1234', uid: 42 })
    expect(encoded).not.toContain('INBOX')
    expect(references.decodeMessage(encoded)).toEqual({
      v: 1,
      folder: 'INBOX',
      uidValidity: '1234',
      uid: 42
    })
  })

  it('round-trips pagination cursors', () => {
    const encoded = references.encodeCursor({ folder: 'Sent', uidValidity: '99', beforeUid: 18 })
    expect(references.decodeCursor(encoded)).toEqual({
      v: 1,
      folder: 'Sent',
      uidValidity: '99',
      beforeUid: 18
    })
  })

  it.each(['', 'not-base64-json', Buffer.from('{"v":2}').toString('base64url')])(
    'rejects malformed reference %p',
    (value) => {
      expect(() => references.decodeMessage(value)).toThrow('MAIL_REFERENCE_INVALID')
    }
  )
})
