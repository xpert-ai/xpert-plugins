import { isUncertainSmtpDelivery, normalizeMailConnectionError, normalizeMailSendError } from './errors.js'

describe('NetEase Mail error normalization', () => {
  it('normalizes authentication and timeout failures without provider text', () => {
    expect(normalizeMailConnectionError({ code: 'EAUTH' }, 'imap').code).toBe('MAIL_AUTH_FAILED')
    expect(normalizeMailConnectionError({ code: 'ETIMEDOUT' }, 'smtp').code).toBe('MAIL_CONNECTION_TIMEOUT')
  })

  it('distinguishes SMTP recipient rejection from unavailable SMTP', () => {
    expect(normalizeMailSendError({ code: 'EENVELOPE', responseCode: 550 }).code).toBe('MAIL_SEND_REJECTED')
    expect(normalizeMailSendError({ code: 'ECONNREFUSED' }).code).toBe('MAIL_SMTP_DISABLED')
  })

  it('recognizes an uncertain result only after the SMTP DATA command', () => {
    expect(isUncertainSmtpDelivery({ command: 'DATA', code: 'ETIMEDOUT' })).toBe(true)
    expect(isUncertainSmtpDelivery({ command: 'AUTH', code: 'ETIMEDOUT' })).toBe(false)
  })
})
