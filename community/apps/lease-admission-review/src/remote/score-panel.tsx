import React from 'react'
import { Input } from '@xpert-ai/plugin-shadcn-ui'
import type { ScoringInput, ScoreResult } from '../lib/scoring-input'
import { t, errorText } from './i18n'
import { windowStart } from '../lib/scoring'
import type { Fields } from '../lib/contracts'

export function ScoringForm({
  inputs,
  disabled,
  onChange
}: {
  inputs: ScoringInput
  disabled: boolean
  onChange: (inputs: ScoringInput) => void
}) {
  const expectedStart = windowStart(inputs.evaluationDate)
  const dates = [
    'evaluationDate',
    'managementStart',
    'managementEnd',
    'pledgeDate',
    'debtDate'
  ] as const
  const checks = [
    'managementScopeVerified',
    'pledgeScopeVerified',
    'debtScopeVerified'
  ] as const
  return (
    <fieldset disabled={disabled} className="space-y-3 border-b pb-4">
      <legend className="font-medium mb-3">{t('scoreInputs')}</legend>
      <div className="field-grid">
        {dates.map((key) => (
          <label key={key}>
            <span>{t(key)}</span>
            <Input
              aria-label={t(key)}
              type="date"
              value={inputs[key]}
              onChange={(e) => onChange({ ...inputs, [key]: e.target.value })}
            />
            {key === 'evaluationDate' && (
              <small className="window-hint">
                {t('expectedWindow')}：
                {expectedStart
                  ? expectedStart + ' → ' + inputs.evaluationDate
                  : '—'}
                <br />
                {t('windowReminder')}
              </small>
            )}
          </label>
        ))}
        <label>
          <span>{t('departureCount')}</span>
          <Input
            aria-label={t('departureCount')}
            inputMode="numeric"
            maxLength={9}
            value={inputs.departureCount}
            onChange={(e) =>
              onChange({ ...inputs, departureCount: e.target.value })
            }
          />
        </label>
      </div>
      {checks.map((key) => (
        <label key={key} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={inputs[key]}
            onChange={(e) => onChange({ ...inputs, [key]: e.target.checked })}
          />
          <span>{t(key)}</span>
        </label>
      ))}
      <p className="text-sm text-muted-foreground">{t('supplement')}</p>
    </fieldset>
  )
}
export function ScorePanel({
  result,
  stale,
  fields
}: {
  result: ScoreResult | null
  stale: boolean
  fields: Fields
}) {
  if (stale) return <p role="status">{t('scoreStale')}</p>
  if (!result) return <p role="status">{t('noScore')}</p>
  return (
    <div className="space-y-3 rounded border p-3" aria-label={t('scoreTitle')}>
      <h3 className="font-semibold">
        {result.complete
          ? `${t('scoreTitle')} ${result.total}/15 ${t('points')}`
          : t('pendingScore')}
      </h3>
      <p className={result.veto === 'hit' ? 'text-destructive' : ''}>
        {t(result.veto)}
      </p>
      {result.items.map((item) => {
        const status = fields.find((field) => field.key === item.key)?.status
        const factIssue =
          status === 'missing'
            ? t('factMissing')
            : status === 'conflict'
            ? t('factConflict')
            : status === 'not_applicable'
            ? t('factNotApplicable')
            : errorText('fact_required')
        const issues = [
          ...new Set(
            item.issues.map((issue) =>
              issue === 'fact_required' ? factIssue : errorText(issue)
            )
          )
        ]
        const suffix =
          item.key === 'managementStability' ? ' ' + t('countUnit') : ''
        return (
          <section
            key={item.key}
            aria-label={t(item.key)}
            className="score-item"
          >
            <h4 className="font-medium">{t(item.key)}</h4>
            <dl className="score-values">
              <div>
                <dt>{t('reviewedValue')}</dt>
                <dd>
                  {item.normalizedValue === null
                    ? '—'
                    : item.normalizedValue + suffix}
                </dd>
              </div>
              <div>
                <dt>{t('scoreBand')}</dt>
                <dd>{item.band ? item.band + suffix : '—'}</dd>
              </div>
              <div>
                <dt>{t('itemScore')}</dt>
                <dd>
                  {item.score === null ? '—' : item.score + '/' + item.maximum}
                </dd>
              </div>
            </dl>
            {!!issues.length && (
              <div className="text-sm text-destructive">
                <p>{t('pendingItems')}</p>
                <ul className="issue-list">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )
      })}
      <small>{result.rulesetVersion}</small>
    </div>
  )
}
