import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { ChevronDown, WandSparkles } from 'lucide-react'
import { React } from './vendor'
import type { ProposalDto } from '../../../workbench-contract'
import { DEMO_REPLIES } from '../../../demo-data'
import { t, type MessageKey } from './i18n'

const { useEffect, useId, useState } = React

export const MAX_REPLY_LENGTH = 5000

/** Sample supplier messages share one source with the server's demo data; all names are fictional. */
export const SAMPLE_REPLIES = DEMO_REPLIES.map((sample) => ({
  kind: sample.kind,
  label: `sample.${sample.kind}` as MessageKey,
  text: sample.rawText
}))

export function NewReplyDialog({
  open,
  busy,
  serverError,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  busy: boolean
  serverError: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (rawText: string, parseAfter: boolean) => void
}) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const fieldId = useId()
  const errorId = useId()
  useEffect(() => {
    if (open) {
      setText('')
      setTouched(false)
    }
  }, [open])

  const length = text.trim().length
  const validation =
    length === 0
      ? t('newReply.empty')
      : length > MAX_REPLY_LENGTH
        ? t('newReply.tooLong', { max: MAX_REPLY_LENGTH })
        : null
  const message = touched ? (validation ?? serverError) : serverError
  const submit = (parseAfter: boolean) => {
    setTouched(true)
    if (!validation) onSubmit(text, parseAfter)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit(true)
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('newReply.title')}</DialogTitle>
            <DialogDescription>{t('newReply.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={fieldId}>{t('newReply.label')}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="xs">
                    {t('newReply.sample')}
                    <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SAMPLE_REPLIES.map((sample) => (
                    <DropdownMenuItem
                      key={sample.kind}
                      onSelect={() => {
                        setText(sample.text)
                        setTouched(false)
                      }}
                    >
                      {t(sample.label)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Textarea
              id={fieldId}
              value={text}
              rows={7}
              placeholder={t('newReply.placeholder')}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? errorId : undefined}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => setTouched(true)}
              className="resize-y text-sm leading-relaxed"
            />
            <div className="flex items-start justify-between gap-3">
              <p id={errorId} role={message ? 'alert' : undefined} className="text-xs text-destructive">
                {message}
              </p>
              <p
                className={`shrink-0 text-xs tabular-nums ${length > MAX_REPLY_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {t('newReply.counter', { count: length, max: MAX_REPLY_LENGTH })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              {t('newReply.cancel')}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => submit(false)}>
              {t('newReply.save')}
            </Button>
            <Button type="submit" disabled={busy}>
              <WandSparkles aria-hidden />
              {t('newReply.saveAndParse')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function EditProposalDialog({
  proposal,
  busy,
  onOpenChange,
  onSubmit
}: {
  proposal: ProposalDto | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: { finalDate: string; finalQuantity?: number }) => void
}) {
  const [date, setDate] = useState('')
  const [quantity, setQuantity] = useState('')
  const [touched, setTouched] = useState(false)
  const dateId = useId()
  const quantityId = useId()
  useEffect(() => {
    if (!proposal) return
    setDate(proposal.finalDate ?? proposal.proposedDate ?? proposal.currentDate)
    const initialQuantity = proposal.finalQuantity ?? proposal.proposedQuantity
    setQuantity(initialQuantity === null ? '' : String(initialQuantity))
    setTouched(false)
  }, [proposal])

  const dateError = isCalendarDate(date) ? null : t('edit.invalidDate')
  const quantityValue = quantity.trim() === '' ? undefined : Number(quantity)
  const quantityError =
    quantityValue === undefined || (Number.isInteger(quantityValue) && quantityValue > 0)
      ? null
      : t('edit.invalidQuantity')
  const po = proposal ? t('proposal.order', { po: proposal.poNumber, line: proposal.lineNo }) : ''

  return (
    <Dialog open={proposal !== null} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setTouched(true)
            if (!dateError && !quantityError) onSubmit({ finalDate: date, finalQuantity: quantityValue })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
            <DialogDescription>{t('edit.description', { po })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={dateId}>{t('edit.date')}</Label>
              <Input
                id={dateId}
                type="date"
                value={date}
                aria-invalid={touched && dateError ? true : undefined}
                onChange={(event) => setDate(event.target.value)}
              />
              {touched && dateError ? (
                <p role="alert" className="text-xs text-destructive">
                  {dateError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={quantityId}>{t('edit.quantity', { unit: proposal?.unit ?? '' })}</Label>
              <Input
                id={quantityId}
                inputMode="numeric"
                value={quantity}
                aria-invalid={touched && quantityError ? true : undefined}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {touched && quantityError ? (
                <p role="alert" className="text-xs text-destructive">
                  {quantityError}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              {t('edit.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('edit.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
