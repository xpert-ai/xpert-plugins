import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { TicketDetail } from '../../domain/contracts.js'
import { CHANNELS, CONTENT_MAX_LENGTH, CONTENT_MIN_LENGTH } from '../../domain/policy.js'
import type { Channel } from '../../domain/policy.js'
import { useServices } from '../context.js'
import { isMessageKey } from '../i18n.js'

const SAMPLE = [
  '我 9 月 2 日在你们旗舰店买的空气炸锅（订单号 8820260902115），用了不到两周，昨天晚上炸鸡翅的时候机器底部突然冒烟，还有一股很重的焦糊味，吓得我赶紧拔了插头，台面都被熏黑了一块。',
  '家里有小孩，这要是着火了谁负责？',
  '我联系过在线客服两次，都只让我“等待专员回电”，三天了没有任何人联系我。',
  '我要求全额退款 399 元，并且赔偿台面的损失。',
  '如果今天之内再没人处理，我就去 12315 投诉，并把视频发到网上。'
].join('')

interface Props {
  onClose: () => void
  onCreated: (ticket: TicketDetail) => void
}

export function CreateTicketDialog({ onClose, onCreated }: Props) {
  const { api, t } = useServices()
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState<Channel>('ecommerce')
  const [customerName, setCustomerName] = useState('')
  const [faultInjection, setFaultInjection] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textarea.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const length = content.trim().length

  // Same limits as the server schema: the user gets the reason before a round trip, and the server
  // still validates because the iframe is not a trust boundary.
  function validate(): string | null {
    if (length < CONTENT_MIN_LENGTH) return t('create.error.tooShort', { min: CONTENT_MIN_LENGTH })
    if (length > CONTENT_MAX_LENGTH) return t('create.error.tooLong', { max: CONTENT_MAX_LENGTH })
    if (customerName.trim().length > 60) return t('create.error.customerTooLong')
    return null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    const invalid = validate()
    setError(invalid)
    if (invalid) {
      textarea.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      const outcome = await api.createTicket({
        content: content.trim(),
        channel,
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        faultInjection: faultInjection ? 'first_attempt' : 'none'
      })
      if (outcome.ok) {
        onCreated(outcome.data)
        return
      }
      const key = `error.${outcome.code}`
      setError(t(isMessageKey(key) ? key : 'error.action_failed'))
    } catch {
      setError(t('error.action_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="xui-modal-backdrop" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <form className="xui-modal" role="dialog" aria-modal="true" aria-labelledby="ct-create-title" onSubmit={submit} noValidate>
        <div className="xui-modal-header">
          <h2 className="xui-modal-title" id="ct-create-title">
            {t('create.title')}
          </h2>
          <button type="button" className="xui-button xui-button-sm" onClick={() => setContent(SAMPLE)}>
            {t('create.sample')}
          </button>
        </div>

        <div className="xui-form">
          <div className="xui-field xui-field-full">
            <label htmlFor="ct-content">{t('create.content')}</label>
            <textarea
              id="ct-content"
              ref={textarea}
              className="xui-textarea ct-content-input"
              value={content}
              aria-invalid={error !== null}
              aria-describedby="ct-content-hint"
              onChange={(event) => {
                setContent(event.target.value)
                if (error) setError(null)
              }}
            />
            <div className="ct-field-foot" id="ct-content-hint">
              <span>{t('create.contentHint', { min: CONTENT_MIN_LENGTH, max: CONTENT_MAX_LENGTH })}</span>
              <span className={length > CONTENT_MAX_LENGTH ? 'ct-over' : undefined}>{t('create.contentCount', { count: length, max: CONTENT_MAX_LENGTH })}</span>
            </div>
          </div>

          <div className="xui-field">
            <label htmlFor="ct-channel">{t('create.channel')}</label>
            <select id="ct-channel" className="xui-control" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
              {CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {t(`channel.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="xui-field">
            <label htmlFor="ct-customer">{t('create.customer')}</label>
            <input id="ct-customer" className="xui-input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          </div>

          <details className="xui-field-full ct-demo">
            <summary>{t('create.demo')}</summary>
            <label className="xui-checkbox">
              <input type="checkbox" checked={faultInjection} onChange={(event) => setFaultInjection(event.target.checked)} />
              {t('create.faultInjection')}
            </label>
          </details>

          {error ? (
            <div className="xui-notice xui-notice-error xui-field-full" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <div className="xui-modal-footer">
          <button type="button" className="xui-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="xui-button xui-button-primary" disabled={submitting}>
            {t('create.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}
