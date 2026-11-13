import { Badge, Button } from '@xpert-ai/plugin-shadcn-ui'
import type { CaseDetail } from '../../../domain/case'
import type { CategoryView } from './data'
import { i18n } from './i18n'
import { FAILURE_KEYS, STATUS_KEYS, STATUS_VARIANTS } from './status'

interface Props {
  detail: CaseDetail
  categories: CategoryView[]
  sending: boolean
  notice: string
  onBack: () => void
  onAnalyze: () => void
}

export function CaseDetailView({ detail, categories, sending, notice, onBack, onAnalyze }: Props) {
  const categoryLabel = (id: string) => {
    const category = categories.find(item => item.id === id)
    return category ? i18n.label(category.label, id) : i18n.t('suggestions.unknownCategory', { id })
  }
  const failureKey = detail.failureCode ? FAILURE_KEYS[detail.failureCode] : 'failure.unknown'
  const analyzable = detail.canAnalyze && detail.photoDataUrl !== null

  return (
    <section className="flex flex-col gap-4" aria-labelledby="case-title-heading">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>{i18n.t('detail.back')}</Button>
      </div>

      <header className="flex items-start justify-between gap-3">
        <h2 id="case-title-heading" className="text-base font-semibold">{detail.title}</h2>
        <Badge variant={STATUS_VARIANTS[detail.status]}>{i18n.t(STATUS_KEYS[detail.status])}</Badge>
      </header>

      {detail.photoDataUrl ? (
        <img
          src={detail.photoDataUrl}
          alt={i18n.t('detail.photoAlt', { title: detail.title })}
          className="max-h-80 w-full rounded-md border object-contain"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{i18n.t('detail.noPhoto')}</p>
      )}

      {detail.status === 'analyzing' && !detail.canAnalyze ? (
        <p role="status" className="text-sm text-muted-foreground">{i18n.t('analyze.running')}</p>
      ) : null}

      {detail.status === 'failed' ? (
        <p role="alert" className="text-sm text-destructive">{i18n.t(failureKey)}</p>
      ) : null}

      {analyzable ? (
        <div className="flex flex-col gap-2">
          <div>
            <Button variant={detail.status === 'suggested' ? 'outline' : 'default'} onClick={onAnalyze} disabled={sending}>
              {i18n.t(detail.status === 'draft' ? 'analyze.start' : 'analyze.restart')}
            </Button>
          </div>
          {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        </div>
      ) : null}

      {detail.suggestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{i18n.t('suggestions.heading')}</h3>
          <ol className="flex flex-col gap-2">
            {detail.suggestions.map(suggestion => (
              <li key={suggestion.categoryId} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{categoryLabel(suggestion.categoryId)}</span>
                  <span className="text-sm text-muted-foreground">
                    {i18n.t('suggestions.confidence', {
                      value: i18n.number(suggestion.confidence, { style: 'percent', maximumFractionDigits: 0 })
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{suggestion.reason}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">{i18n.t('suggestions.note')}</p>
        </div>
      ) : null}
    </section>
  )
}
