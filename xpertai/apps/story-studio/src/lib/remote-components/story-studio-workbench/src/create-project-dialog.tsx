import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  WandSparkles
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'
import type { ProductionFormat } from './project-data'

const h: typeof React.createElement = React.createElement

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

const FORMAT_KEYS: Record<ProductionFormat, MessageKey> = {
  vertical_short: 'format.vertical_short',
  horizontal_short: 'format.horizontal_short',
  episodic_series: 'format.episodic_series',
  feature: 'format.feature',
  custom: 'format.custom'
}

export type CreateProjectDraft = {
  title: string
  description: string
  premise: string
  productionFormat: ProductionFormat
  aspectRatio: string
  duration: string
  tags: string
}

export const EMPTY_PROJECT_DRAFT: CreateProjectDraft = {
  title: '',
  description: '',
  premise: '',
  productionFormat: 'vertical_short',
  aspectRatio: '9:16',
  duration: '60',
  tags: ''
}

export function CreateProjectDialog(props: {
  open: boolean
  busy: boolean
  draft: CreateProjectDraft
  templateName?: string | null
  onOpenChange: (open: boolean) => void
  onDraftChange: (draft: CreateProjectDraft) => void
  onCreate: () => void
  t: Translator
}) {
  const {
    open,
    busy,
    draft,
    templateName,
    onOpenChange,
    onDraftChange,
    onCreate,
    t
  } = props
  const update = <K extends keyof CreateProjectDraft>(
    key: K,
    value: CreateProjectDraft[K]
  ) => onDraftChange({ ...draft, [key]: value })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ss-create-dialog">
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>
        {templateName ? (
          <div className="ss-create-template-notice">
            <WandSparkles aria-hidden="true" />
            <span>
              <strong>{t('dialog.templateApplied', { template: templateName })}</strong>
              <small>{t('dialog.templateAppliedHelp')}</small>
            </span>
          </div>
        ) : null}
        <div className="ss-form">
          <label>
            <span>{t('fields.title')}</span>
            <Input
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
              maxLength={160}
            />
          </label>
          <label>
            <span>{t('fields.description')}</span>
            <Input
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
              maxLength={2000}
            />
          </label>
          <label>
            <span>{t('fields.premise')}</span>
            <Textarea
              value={draft.premise}
              onChange={(event) => update('premise', event.target.value)}
              maxLength={8000}
            />
          </label>
          <div className="ss-form-row">
            <label>
              <span>{t('fields.format')}</span>
              <Select
                value={draft.productionFormat}
                onValueChange={(value) =>
                  update('productionFormat', value as ProductionFormat)
                }
              >
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMAT_KEYS).map(([value, key]) => (
                    <SelectItem key={value} value={value}>{t(key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>{t('fields.aspectRatio')}</span>
              <Select
                value={draft.aspectRatio}
                onValueChange={(value) => update('aspectRatio', value)}
              >
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['9:16', '16:9', '1:1', '4:3', '3:4'].map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>{ratio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="ss-form-row">
            <label>
              <span>{t('fields.duration')}</span>
              <Input
                type="number"
                min={5}
                max={28800}
                value={draft.duration}
                onChange={(event) => update('duration', event.target.value)}
              />
            </label>
            <label>
              <span>{t('fields.tags')}</span>
              <Input
                value={draft.tags}
                onChange={(event) => update('tags', event.target.value)}
              />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button size="sm" disabled={busy || !draft.title.trim()} onClick={onCreate}>
            {t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
