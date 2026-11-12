import { Fragment, useId, useState, type ReactNode } from 'react'
import {
  Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@xpert-ai/plugin-shadcn-ui'
import {
  CATEGORIES, MAX_INQUIRY, MAX_LINES, PRICE_MARKERS, validateLines,
  type ActionKey, type Draft, type DraftLine, type LineEditorRow, type Projection, type Quote,
} from './contracts'
import { errorKey, i18n, t } from './i18n'

export type Edits = { revision: number; rows: LineEditorRow[] }

function productLabel(product: Pick<Quote['lines'][number], 'category' | 'productName' | 'specification'>) {
  return t('productDescription', {
    category: product.category,
    name: product.productName,
    specification: product.specification,
  })
}

export function StatusBadge({ status }: { status: Draft['status'] }) {
  const variant = status === 'failed' || status === 'ocr_failed' ? 'destructive' : status === 'review' ? 'default' : 'outline'
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>
}

function money(value: string, currency: Quote['currency']) {
  const format = new Intl.NumberFormat(i18n.getLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.max(2, value.split('.')[1]?.length ?? 0),
  }).format as (decimal: number | string) => string
  // ECMA-402 accepts decimal strings without a binary floating-point conversion.
  return format(value)
}

function Quotation({ quote }: { quote: Quote }) {
  return <section aria-labelledby="confirmed-quote">
    <Card>
      <CardHeader>
        <CardTitle><h2 id="confirmed-quote">{t('quote')}</h2></CardTitle>
        <CardDescription>{t('quoteHelp')}</CardDescription>
        <CardAction>
          <dl className="text-right">
            <dt className="text-xs text-muted-foreground">{t(quote.totalKind === 'subtotal' ? 'subtotal' : 'total')}</dt>
            <dd className="font-semibold tabular-nums">{money(quote.total, quote.currency)}</dd>
          </dl>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table aria-labelledby="confirmed-quote">
          <TableHeader><TableRow>
            <TableHead scope="col">{t('product')}</TableHead>
            <TableHead scope="col">{t('grade')}</TableHead>
            <TableHead scope="col" className="text-right">{t('cartons')}</TableHead>
            <TableHead scope="col" className="text-right">{t('packing')}</TableHead>
            <TableHead scope="col" className="text-right">{t('pieces')}</TableHead>
            <TableHead scope="col" className="text-right">{t('unitPrice')}</TableHead>
            <TableHead scope="col" className="text-right">{t('amount')}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{quote.lines.map((line, index) => <TableRow key={index}>
            <TableCell>{productLabel(line)}</TableCell>
            <TableCell>{line.priceMarker ?? t('noEvidence')}</TableCell>
            <TableCell className="text-right tabular-nums">{i18n.number(line.quantityCartons)}</TableCell>
            <TableCell className="text-right tabular-nums">{line.packingQuantity == null ? t('noEvidence') : i18n.number(line.packingQuantity)}</TableCell>
            <TableCell className="text-right tabular-nums">{line.totalPieces == null ? t('noEvidence') : i18n.number(line.totalPieces)}</TableCell>
            <TableCell className="text-right tabular-nums">{line.unitPrice == null ? t('noEvidence') : money(line.unitPrice, quote.currency)}</TableCell>
            <TableCell className="text-right tabular-nums">{line.lineAmount == null
              ? t(line.status === 'pending_price' ? 'quotePendingPrice'
                : line.status === 'missing_packaging' ? 'quoteMissingPackaging' : 'noEvidence')
              : money(line.lineAmount, quote.currency)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  </section>
}

function rowsFrom(lines: DraftLine[]): LineEditorRow[] {
  return lines.map(({ quantityCartons, ...line }, key) => ({ ...line, key, cartons: String(quantityCartons) }))
}

function equalLines(rows: LineEditorRow[], lines: DraftLine[]) {
  return rows.length === lines.length && rows.every((row, index) => (
    row.category === lines[index].category &&
    row.productName === lines[index].productName &&
    row.specification === lines[index].specification &&
    row.priceMarker === lines[index].priceMarker &&
    row.gradeRaw === lines[index].gradeRaw &&
    /^\d+$/.test(row.cartons) && Number(row.cartons) === lines[index].quantityCartons &&
    row.evidence === lines[index].evidence
  ))
}

type DetailProps = {
  draft: Draft
  catalog: Projection['catalog']
  edits: Edits | undefined
  updateEdits: (edits?: Edits) => void
  pending: ActionKey | null
  disabled: boolean
  canResend: boolean
  analyze: (action: 'analyze' | 'retry') => void
  saveInquiry: (inquiry: string) => void
  retryOcr: () => void
  submit: (action: 'save_lines' | 'confirm', lines: DraftLine[]) => void
}

function Review({ draft, catalog, edits, updateEdits, pending, disabled, analyze, submit }: DetailProps) {
  const savedLines = draft.lines.filter((line): line is DraftLine => 'category' in line)
  const rows = edits?.rows ?? rowsFrom(savedLines)
  const dirty = !!edits && !equalLines(rows, savedLines)
  const conflict = !!edits && dirty && edits.revision !== draft.revision
  const staleCatalog = savedLines.length !== draft.lines.length || (!!catalog && catalog.catalogVersion !== draft.catalogVersion)
  const blocked = disabled || !catalog || staleCatalog || conflict
  const validation = validateLines(rows)
  const lines = validation.lines
  const update = (newRows: LineEditorRow[]) => updateEdits({ revision: draft.revision, rows: newRows })
  const patch = (key: number, patch: Partial<LineEditorRow>) =>
    update(rows.map((row) => row.key === key ? { ...row, ...patch } : row))

  return <section aria-labelledby="review-items">
    <Card>
      <CardHeader>
        <CardTitle><h2 id="review-items">{t('candidates')}</h2></CardTitle>
        <CardDescription>{t('reviewHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {staleCatalog && <p role="alert" className="text-sm text-destructive">{t('error.stale_catalog')}</p>}
        {conflict && <div className="manufacturing-actions">
          <p role="alert" className="text-sm text-destructive">{t('error.conflict')}</p>
          <Button type="button" variant="outline" onClick={() => updateEdits()} disabled={disabled}>
            {t('reloadEdits')}
          </Button>
        </div>}
        {!staleCatalog && <Table aria-labelledby="review-items">
          <TableHeader><TableRow>
            <TableHead scope="col">{t('category')}</TableHead>
            <TableHead scope="col">{t('product')}</TableHead>
            <TableHead scope="col">{t('specification')}</TableHead>
            <TableHead scope="col">{t('cartons')}</TableHead>
            <TableHead scope="col">{t('grade')}</TableHead>
            <TableHead scope="col"><span className="sr-only">{t('remove')}</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row, index) => {
            const position = i18n.number(index + 1)
            return <Fragment key={row.key}>
              <TableRow>
                <TableCell className="manufacturing-category-cell">
                  <Select value={row.category} disabled={blocked}
                    onValueChange={(category) => patch(row.key, { category: category as DraftLine['category'] })}>
                    <SelectTrigger className="w-full" aria-label={t('categoryLabel', { line: position })}>
                      <SelectValue placeholder={t('chooseCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="manufacturing-product-cell">
                  <Input aria-label={t('productLabel', { line: position })} value={row.productName} disabled={blocked} maxLength={100}
                    onChange={(event) => patch(row.key, { productName: event.currentTarget.value })} />
                </TableCell>
                <TableCell className="manufacturing-specification-cell">
                  <Input aria-label={t('specificationLabel', { line: position })} value={row.specification} disabled={blocked} maxLength={100}
                    onChange={(event) => patch(row.key, { specification: event.currentTarget.value })} />
                </TableCell>
                <TableCell className="manufacturing-quantity-cell">
                  <Input
                    aria-label={t('cartonLabel', { line: position })}
                    inputMode="numeric"
                    maxLength={7}
                    value={row.cartons}
                    disabled={blocked}
                    onChange={(event) => patch(row.key, { cartons: event.currentTarget.value })}
                  />
                </TableCell>
                <TableCell className="manufacturing-grade-cell">
                  <Select value={row.priceMarker} disabled={blocked} onValueChange={(grade) =>
                    patch(row.key, { priceMarker: grade as DraftLine['priceMarker'], gradeRaw: grade })}>
                    <SelectTrigger className="w-full" aria-label={t('gradeLabel', { line: position })}>
                      <SelectValue placeholder={t('chooseGrade')} />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_MARKERS.map((grade) => <SelectItem key={grade} value={grade}>{grade}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" disabled={blocked}
                    aria-label={t('removeLabel', { line: position })} onClick={() => update(rows.filter((item) => item.key !== row.key))}>
                    {t('remove')}
                  </Button>
                </TableCell>
              </TableRow>
              {(row.evidence || row.correctionReason) && <TableRow>
                <TableCell colSpan={6} className="manufacturing-inquiry text-xs text-muted-foreground">
                  {row.evidence && <p>{t('evidenceLine', { evidence: row.evidence })}</p>}
                  {row.correctionReason && <p>{t('correctionReasonLine', { reason: row.correctionReason })}</p>}
                </TableCell>
              </TableRow>}
            </Fragment>
          })}</TableBody>
        </Table>}
        {catalog && validation.error && !staleCatalog && !conflict &&
          <p className="text-sm text-muted-foreground" role="status">{t(errorKey(validation.error))}</p>}
        <div className="manufacturing-review-footer">
          <div className="manufacturing-actions">
            <Button type="button" variant="outline" disabled={blocked || rows.length >= MAX_LINES}
              onClick={() => update([...rows, {
                key: Math.max(-1, ...rows.map((row) => row.key)) + 1,
                category: '', productName: '', specification: '', cartons: '', priceMarker: '', gradeRaw: '', evidence: '',
              }])}>{t('addLine')}</Button>
            <Button type="button" variant="ghost" disabled={disabled || !catalog || (dirty && !staleCatalog)}
              onClick={() => analyze('analyze')}>{t('reanalyze')}</Button>
          </div>
          <div className="manufacturing-actions">
            {dirty && !conflict && <span className="text-sm text-muted-foreground" role="status">{t('unsaved')}</span>}
            <Button type="button" variant="outline" disabled={blocked || !lines || !dirty}
              onClick={() => { if (lines) submit('save_lines', lines) }}>{t('saveEdits')}</Button>
            <Button type="button" disabled={blocked || !lines}
              onClick={() => { if (lines) submit('confirm', lines) }}>
              {t(pending === 'confirm' ? 'confirming' : 'confirm')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>
}

export function DraftDetail(props: DetailProps) {
  const { draft, catalog, disabled, canResend, analyze, saveInquiry } = props
  const expired = !!draft.retryAt && Date.parse(draft.retryAt) <= Date.now()
  const updated = i18n.date(draft.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })
  const analyzeButton = (!draft.source && (draft.status === 'draft' || draft.status === 'failed')) ||
    (draft.status === 'analyzing' && (expired || canResend))
  return <>
    <header className="manufacturing-detail-header">
      <div className="grid min-w-0 gap-1">
        <h2 className="break-words text-xl font-semibold">{draft.title}</h2>
        {updated && <p className="text-sm text-muted-foreground">{t('updated', { date: updated })}</p>}
      </div>
      <div className="manufacturing-actions">
        <div role="status"><StatusBadge status={draft.status} /></div>
        {analyzeButton && <Button type="button" disabled={disabled || !catalog}
          onClick={() => analyze(draft.status === 'draft' ? 'analyze' : 'retry')}>
          {t(draft.status === 'draft' ? 'identify' : 'retry')}
        </Button>}
      </div>
    </header>
    {draft.source ? <ImageInquiry key={`${draft.id}:${draft.revision}`} {...props} source={draft.source} /> :
    <section aria-labelledby="original-inquiry">
      <Card>
        <CardHeader><CardTitle><h2 id="original-inquiry">{t('original')}</h2></CardTitle></CardHeader>
        <CardContent>
          {draft.status === 'failed' ? <InquiryEditor key={`${draft.id}:${draft.revision}`} initialText={draft.inquiry}
            label={t('inquiry')} placeholder={t('inquiryPlaceholder')} disabled={disabled} catalog={catalog} saveInquiry={saveInquiry} />
            : <p className="manufacturing-inquiry">{draft.inquiry}</p>}
        </CardContent>
      </Card>
    </section>}
    {draft.status === 'analyzing' && !canResend && <p role="status" className="text-sm text-muted-foreground">
      {t(expired ? 'retryExpired' : 'identifying')}
    </p>}
    {draft.errorCode && <p role="alert" className="text-sm text-destructive">{t(errorKey(draft.errorCode))}</p>}
    {draft.status === 'review' && <Review {...props} />}
    {draft.quote && <Quotation quote={draft.quote} />}
  </>
}

function InquiryEditor({ initialText, label, placeholder, disabled, catalog, saveInquiry, children }:
  Pick<DetailProps, 'disabled' | 'catalog' | 'saveInquiry'> & {
    initialText: string; label: string; placeholder: string; children?: ReactNode
  }) {
  const [inquiry, setInquiry] = useState(initialText)
  const id = useId()
  const trimmedInquiry = inquiry.trim()
  return <form className="manufacturing-form" onSubmit={(event) => {
    event.preventDefault()
    if (!disabled && catalog && trimmedInquiry) saveInquiry(trimmedInquiry)
  }}>
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={inquiry} disabled={disabled} rows={6} maxLength={MAX_INQUIRY}
        placeholder={placeholder} onChange={(event) => setInquiry(event.currentTarget.value)} />
    </div>
    <div className="manufacturing-actions">
      <Button type="submit" disabled={disabled || !catalog || !trimmedInquiry}>{t('saveAndIdentify')}</Button>
      {children}
    </div>
  </form>
}

function ImageInquiry({ draft, source, disabled, catalog, saveInquiry, retryOcr }:
  DetailProps & { source: NonNullable<Draft['source']> }) {
  const editing = draft.status === 'draft' || draft.status === 'ocr_failed' || draft.status === 'failed'
  const expired = draft.status === 'ocr_pending' && (draft.retryAt
    ? Date.parse(draft.retryAt) <= Date.now()
    : Date.parse(draft.updatedAt) + 120_000 <= Date.now())
  return <section aria-labelledby="image-inquiry">
    <Card>
      <CardHeader>
        <CardTitle><h2 id="image-inquiry">{t('originalImage')}</h2></CardTitle>
        <CardDescription>{source.fileName}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <img className="manufacturing-source-image" src={source.dataUrl} alt={t('imageAlt', { name: source.fileName })} />
        {source.warnings?.length ? <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {source.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
        </ul> : null}
        {draft.status === 'ocr_pending' ? <div className="manufacturing-actions">
          <p role="status" className="text-sm text-muted-foreground">{t(expired ? 'ocrExpired' : 'recognizingImage')}</p>
          {expired && <Button type="button" variant="outline" disabled={disabled} onClick={retryOcr}>{t('retryOcr')}</Button>}
        </div>
          : editing ? <InquiryEditor initialText={draft.inquiry || source.ocrText || ''} label={t('recognizedText')}
            placeholder={t('recognizedTextPlaceholder')} disabled={disabled} catalog={catalog} saveInquiry={saveInquiry}>
            {draft.status === 'ocr_failed' &&
              <Button type="button" variant="outline" disabled={disabled} onClick={retryOcr}>{t('retryOcr')}</Button>}
          </InquiryEditor> : <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t('original')}</h3>
            <p className="manufacturing-inquiry">{draft.inquiry}</p>
          </div>}
      </CardContent>
    </Card>
  </section>
}
