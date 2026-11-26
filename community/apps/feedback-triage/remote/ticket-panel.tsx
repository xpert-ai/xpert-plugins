import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Check,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/plugin-shadcn-ui'
import { categorySchema, type Analysis, type Ticket } from '../src/domain'
import { i18n, t } from './i18n'

export function TicketStatus({ status }: { status: Ticket['status'] }) {
  const variant = status === 'failed' ? 'destructive' : status === 'review' ? 'default' : 'secondary'
  return <Badge variant={variant}>{t(`status_${status}`)}</Badge>
}

export function TicketPanel({
  ticket,
  analyzing,
  busy,
  onAnalyze,
  onConfirm
}: {
  ticket: Ticket
  analyzing: boolean
  busy: boolean
  onAnalyze: () => void
  onConfirm: (category: Analysis['category']) => void
}) {
  const { analysis, status } = ticket
  const [correctedCategory, setCorrectedCategory] = useState<Analysis['category']>()
  const chosenCategory = correctedCategory ?? analysis?.category
  const processing = analyzing || status === 'processing'
  return (
    <section className="detail" aria-label={t('detailTitle')}>
      <div className="ticket-heading">
        <div>
          <h2>{t('ticketId', { id: ticket.id.slice(0, 8) })}</h2>
          <p className="metadata">
            {t('updated', { date: i18n.date(ticket.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
          </p>
        </div>
        <TicketStatus status={processing ? 'processing' : status} />
      </div>
      <section className="source-block">
        <h3>
          <MessageSquare size={15} aria-hidden />
          {t('sourceLabel')}
        </h3>
        <p className="preserve">{ticket.source}</p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="with-icon">
              <Sparkles size={16} aria-hidden />
              {t('suggestion')}
            </span>
          </CardTitle>
          {status === 'review' && <CardDescription>{t('reviewHelp')}</CardDescription>}
        </CardHeader>
        <CardContent>
          {analysis && (status === 'review' || status === 'confirmed') ? (
            <dl className="analysis-fields">
              <div>
                <dt>{t(status === 'confirmed' ? 'finalCategory' : 'aiCategory')}</dt>
                <dd>
                  <Badge variant="outline">
                    {t(
                      `category_${
                        status === 'confirmed' ? ticket.confirmedCategory ?? analysis.category : analysis.category
                      }`
                    )}
                  </Badge>
                </dd>
                {status === 'confirmed' &&
                  ticket.confirmedCategory &&
                  ticket.confirmedCategory !== analysis.category && (
                    <dd className="metadata">
                      {t('originalCategory', { category: t(`category_${analysis.category}`) })}
                    </dd>
                  )}
              </div>
              <div>
                <dt>{t('summary')}</dt>
                <dd>{analysis.summary}</dd>
              </div>
              <div>
                <dt>{t('quote')}</dt>
                <dd>
                  <blockquote>{analysis.quote}</blockquote>
                </dd>
              </div>
              <div>
                <dt>{t('nextStep')}</dt>
                <dd>{analysis.nextStep}</dd>
              </div>
            </dl>
          ) : (
            <p role={status === 'failed' && !processing ? 'alert' : 'status'}>
              {processing
                ? t('analyzingHelp')
                : status === 'failed'
                ? t(ticket.errorCode ?? 'failedHelp')
                : t('draftHelp')}
            </p>
          )}
        </CardContent>
        <CardFooter className="ticket-footer">
          {status === 'confirmed' ? (
            <p className="with-icon">
              <Check size={16} aria-hidden />
              {t('confirmedHelp')}
            </p>
          ) : status === 'review' ? (
            <div className="approval-controls">
              <div className="category-field">
                <Label htmlFor="confirm-category">{t('finalCategory')}</Label>
                <Select
                  value={chosenCategory}
                  disabled={busy}
                  onValueChange={(value) => setCorrectedCategory(categorySchema.parse(value))}
                >
                  <SelectTrigger id="confirm-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categorySchema.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`category_${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={busy || !chosenCategory} onClick={() => chosenCategory && onConfirm(chosenCategory)}>
                <Check aria-hidden />
                {t('approve')}
              </Button>
            </div>
          ) : (
            !processing && (
              <Button disabled={busy} onClick={onAnalyze}>
                {status === 'failed' ? <RotateCcw aria-hidden /> : <Sparkles aria-hidden />}
                {t(status === 'failed' ? 'retry' : 'analyze')}
              </Button>
            )
          )}
          {ticket.attempts > 0 && <span className="metadata">{t('attempts', { count: ticket.attempts })}</span>}
        </CardFooter>
      </Card>
    </section>
  )
}
