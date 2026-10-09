import { React } from '../vendor'
import { newRequestId } from '../utils'
import type { Text } from '../i18n'
import type { TicketChannel, TicketOption } from '../types'

const { useState } = React

export interface IntakePayload {
  requestId: string
  customerName: string
  channel: TicketChannel
  originalMessage: string
}

interface IntakeFormProps {
  t: Text
  locale: string
  channels: TicketOption[]
  maxMessageLength: number
  busy: boolean
  onSubmit: (payload: IntakePayload) => void
}

export function IntakeForm(props: IntakeFormProps) {
  const { t, locale, channels, maxMessageLength, busy, onSubmit } = props
  const [customerName, setCustomerName] = useState('')
  const [channel, setChannel] = useState<TicketChannel>('email')
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)

  const nameError = touched && !customerName.trim() ? t('required') : ''
  const messageError = touched
    ? !message.trim()
      ? t('required')
      : message.length > maxMessageLength
        ? t('messageTooLong', { max: maxMessageLength })
        : ''
    : ''
  const canSubmit = Boolean(customerName.trim() && message.trim() && message.length <= maxMessageLength)

  return (
    <section className="st-section">
      <div className="st-section-head">
        <div>
          <div className="st-section-title">{t('newTicket')}</div>
          <div className="st-section-hint">{t('subtitle')}</div>
        </div>
      </div>
      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor="st-customer">
            {t('customer')} <b>*</b>
          </label>
          <input
            id="st-customer"
            className="st-input"
            value={customerName}
            placeholder={t('customerPlaceholder')}
            onChange={(event: { target: { value: string } }) => setCustomerName(event.target.value)}
          />
          {nameError ? <div className="st-error">{nameError}</div> : null}
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor="st-channel">
            {t('channel')}
          </label>
          <select
            id="st-channel"
            className="st-select"
            value={channel}
            onChange={(event: { target: { value: string } }) => setChannel(event.target.value as TicketChannel)}
          >
            {channels.map((item) => (
              <option key={item.value} value={item.value}>
                {locale === 'en-US' ? item.en_US : item.zh_Hans}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label className="st-label" htmlFor="st-message">
          {t('message')} <b>*</b>
        </label>
        <textarea
          id="st-message"
          className="st-textarea"
          value={message}
          placeholder={t('messagePlaceholder')}
          onChange={(event: { target: { value: string } }) => setMessage(event.target.value)}
        />
        <div className="st-section-hint st-mono">
          {message.length} / {maxMessageLength}
        </div>
        {messageError ? <div className="st-error">{messageError}</div> : null}
      </div>
      <div className="st-actions">
        <button
          type="button"
          className="st-btn st-btn-primary"
          disabled={busy}
          onClick={() => {
            setTouched(true)
            if (!canSubmit) {
              return
            }
            onSubmit({
              requestId: newRequestId(),
              customerName: customerName.trim(),
              channel,
              originalMessage: message.trim()
            })
            setCustomerName('')
            setMessage('')
            setTouched(false)
          }}
        >
          {busy ? t('submitting') : t('submit')}
        </button>
        {!canSubmit && touched ? <span className="st-section-hint">{t('required')}</span> : null}
      </div>
    </section>
  )
}
