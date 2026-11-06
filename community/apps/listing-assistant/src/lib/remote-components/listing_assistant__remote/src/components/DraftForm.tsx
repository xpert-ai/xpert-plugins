import {
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import type { ChangeEvent } from 'react'
import { React } from '../vendor'
import type { Catalog } from '../i18n'
import type { TaskDetail } from '../types'
import type { FormState } from '../workbench-utils'

type DraftFormProps = {
  t: Catalog
  detail: TaskDetail
  form: FormState
  activeEvidence: string | null
  onChange: (patch: Partial<FormState>) => void
  onEvidenceFocus: (field: string) => void
}

export function DraftForm({ t, detail, form, activeEvidence, onChange, onEvidenceFocus }: DraftFormProps) {
  const flags = detail.draft?.fieldFlags ?? {}
  const evidence = detail.draft?.evidence ?? {}

  const renderEvidence = (field: string) => (
    <EvidenceNote
      t={t}
      field={field}
      quote={evidence[field]}
      active={activeEvidence === field}
      onFocus={onEvidenceFocus}
    />
  )

  const fieldClass = (name: string) => `la-field${flags[name] ? ` la-field--${flags[name]}` : ''}`

  const renderFlag = (name: string) => {
    const flag = flags[name]
    if (!flag) return null
    if (flag === 'missing') return <span className="la-flag la-flag--missing">{t.flagMissing}</span>
    if (flag === 'uncertain') return <span className="la-flag la-flag--uncertain">{t.flagUncertain}</span>
    return <span className="la-flag la-flag--ai">{t.flagAi}</span>
  }

  return (
    <div className="la-form">
      <p className="la-note">{t.flagsHint}</p>

      <div className={fieldClass('title')}>
        <Label className="la-label" htmlFor="la-title">
          {t.fieldTitle}
          {renderFlag('title')}
        </Label>
        <div className="la-control">
          <Input
            id="la-title"
            value={form.title}
            placeholder={t.titlePlaceholder}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ title: event.target.value })}
          />
        </div>
        {renderEvidence('title')}
      </div>

      <div className={fieldClass('description')}>
        <Label className="la-label" htmlFor="la-description">
          {t.fieldDescription}
          {renderFlag('description')}
        </Label>
        <div className="la-control">
          <Textarea
            id="la-description"
            value={form.description}
            placeholder={t.descriptionPlaceholder}
            rows={5}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ description: event.target.value })}
          />
        </div>
        {renderEvidence('description')}
      </div>

      <div className="la-grid-2">
        <div className={fieldClass('price')}>
          <Label className="la-label" htmlFor="la-price">
            {t.fieldPrice}
            {renderFlag('price')}
          </Label>
          <div className="la-control">
            <Input
              id="la-price"
              value={form.price}
              placeholder={t.pricePlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ price: event.target.value })}
            />
          </div>
          {renderEvidence('price')}
        </div>
        <div className="la-field">
          <Label className="la-label" htmlFor="la-currency">
            {t.fieldCurrency}
          </Label>
          <Input
            id="la-currency"
            value={form.currency}
            placeholder={t.currencyPlaceholder}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ currency: event.target.value })}
          />
        </div>
      </div>

      <div className={fieldClass('category')}>
        <Label className="la-label" htmlFor="la-category">
          {t.fieldCategory}
          {renderFlag('category')}
        </Label>
        <div className="la-control">
          <Input
            id="la-category"
            value={form.category}
            placeholder={t.categoryPlaceholder}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ category: event.target.value })}
          />
        </div>
        {renderEvidence('category')}
      </div>

      <div className={fieldClass('attributes')}>
        <Label className="la-label">{t.fieldAttributes}</Label>
        {form.attributes.map((pair, index) => (
          <div className="la-attr-row" key={`attr-${index}`}>
            <Input
              value={pair.key}
              placeholder={t.attrKeyPlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const next = [...form.attributes]
                next[index] = { ...pair, key: event.target.value }
                onChange({ attributes: next })
              }}
            />
            <Input
              value={pair.value}
              placeholder={t.attrValuePlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const next = [...form.attributes]
                next[index] = { ...pair, value: event.target.value }
                onChange({ attributes: next })
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ attributes: form.attributes.filter((_, i) => i !== index) })}
            >
              {t.remove}
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="la-inline-add"
          onClick={() => onChange({ attributes: [...form.attributes, { key: '', value: '' }] })}
        >
          {t.addAttribute}
        </Button>
      </div>

      <div className={fieldClass('specs')}>
        <Label className="la-label">
          {t.fieldSpecs}
          {renderFlag('specs')}
        </Label>
        {form.specs.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.specName}</TableHead>
                <TableHead>{t.specPrice}</TableHead>
                <TableHead>{t.specStock}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.specs.map((spec, index) => (
                <TableRow key={`spec-${index}`}>
                  <TableCell>
                    <Input
                      value={spec.name}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const next = [...form.specs]
                        next[index] = { ...spec, name: event.target.value }
                        onChange({ specs: next })
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={spec.price}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const next = [...form.specs]
                        next[index] = { ...spec, price: event.target.value }
                        onChange({ specs: next })
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={spec.stock}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const next = [...form.specs]
                        next[index] = { ...spec, stock: event.target.value }
                        onChange({ specs: next })
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onChange({ specs: form.specs.filter((_, i) => i !== index) })}
                    >
                      {t.remove}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="la-inline-add"
          onClick={() => onChange({ specs: [...form.specs, { name: '', price: '', stock: '' }] })}
        >
          {t.addSpec}
        </Button>
        {renderEvidence('specs')}
      </div>

      <p className="la-note">{t.saveHint}</p>
      <p className="la-note">{t.aiNote}</p>

      {detail.runs.length ? (
        <div className="la-runs">
          <strong>{t.runHistory}</strong>
          {detail.runs.slice(0, 5).map((run) => (
            <span key={run.attempt}>
              {`${t.attemptPrefix} ${run.attempt} · ${run.status}${run.errorMessage ? ` · ${run.errorMessage}` : ''}`}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

type EvidenceNoteProps = {
  t: Catalog
  field: string
  quote?: string
  active: boolean
  onFocus: (field: string) => void
}

/** Shows the verbatim source excerpt behind an AI-extracted field. */
function EvidenceNote({ t, field, quote, active, onFocus }: EvidenceNoteProps) {
  if (!quote) return null
  return (
    <button
      type="button"
      className={`la-evidence-note${active ? ' la-evidence-note--active' : ''}`}
      onClick={() => onFocus(field)}
      title={t.evidenceHint}
    >
      <span className="la-evidence-tag">{t.evidenceLabel}</span>
      <span className="la-evidence-quote">{quote}</span>
    </button>
  )
}
