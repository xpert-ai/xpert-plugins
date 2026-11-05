import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import type { ChangeEvent } from 'react'
import { React } from '../vendor'
import type { Catalog } from '../i18n'

type NewTaskDialogProps = {
  t: Catalog
  open: boolean
  value: string
  error: string
  creating: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
  onCreate: () => void
}

export function NewTaskDialog({ t, open, value, error, creating, onOpenChange, onChange, onCreate }: NewTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.createTitle}</DialogTitle>
          <DialogDescription>{t.createDescription}</DialogDescription>
        </DialogHeader>
        <div className="la-dialog-body">
          <p className="la-note">{t.batchHint}</p>
          <Textarea
            className="la-dialog-textarea"
            value={value}
            placeholder={t.pastePlaceholder}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
          />
          {error ? (
            <p className="la-notice la-notice--error" style={{ margin: 0 }}>
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            {t.cancel}
          </Button>
          <Button onClick={onCreate} disabled={creating}>
            {creating ? t.creating : t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
