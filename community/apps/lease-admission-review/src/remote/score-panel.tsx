import React from 'react'
import { Input } from '@xpert-ai/plugin-shadcn-ui'
import type { ScoringInput, ScoreResult } from '../lib/scoring-input'
import { t, errorText } from './i18n'

export function ScoringForm({
  inputs,
  disabled,
  onChange
}: {
  inputs: ScoringInput
  disabled: boolean
  onChange: (inputs: ScoringInput) => void
}) {
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
  stale
}: {
  result: ScoreResult | null
  stale: boolean
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
      {result.items.map((item) => (
        <div key={item.key}>
          <p>
            {t(item.key)}：
            {item.score === null ? '—' : `${item.score}/${item.maximum}`}{' '}
            {item.normalizedValue ?? ''} {item.band}
          </p>
          {item.issues.map((issue) => (
            <p className="text-sm text-destructive" key={issue}>
              {errorText(issue)}
            </p>
          ))}
        </div>
      ))}
      <small>{result.rulesetVersion}</small>
    </div>
  )
}
