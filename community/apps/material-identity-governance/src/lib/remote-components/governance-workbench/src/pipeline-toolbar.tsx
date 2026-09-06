import * as React from 'react'
import {
  Badge,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@xpert-ai/plugin-shadcn-ui'
import { ArrowUpRight, Play, Plus, RefreshCw } from 'lucide-react'
import type { WorkbenchData } from '../../../contracts'
import { useI18n } from './i18n'
import { ContextDisclosure, Status } from './ui'

export function PipelineToolbar({
  data,
  busy,
  onSelect,
  onReload,
  onCreate,
  onWorkspace,
  onCoordinate,
}: {
  data: WorkbenchData | null
  busy: boolean
  onSelect: (id: string) => void
  onReload: () => void
  onCreate: () => void
  onWorkspace: () => void
  onCoordinate: () => void
}) {
  const { t, date } = useI18n()
  const current = data?.selectedCase
  const flow = data?.flow
  return (
    <header className="pipeline-toolbar">
      <h1 className="sr-only">{t('pipeline')}</h1>
      <div className="pipeline-context">
        <Select value={current?.id ?? ''} onValueChange={onSelect}>
          <SelectTrigger
            className="pipeline-case-select"
            aria-label={t('selectCase')}
          >
            <SelectValue placeholder={t('selectCase')} />
          </SelectTrigger>
          <SelectContent>
            {data?.table.items.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.caseKey} · {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {current && <Status value={current.status} />}
        {flow && (
          <span
            className="pipeline-progress"
            aria-label={`${t('progress')} ${flow.completed} / ${flow.total}`}
          >
            {flow.completed}
            <span> / {flow.total}</span>
          </span>
        )}
        <ContextDisclosure label={t('caseDetails')}>
          <strong>{current?.title ?? t('pipeline')}</strong>
          {current && (
            <dl className="case-detail-list">
              <dt>{t('caseKey')}</dt>
              <dd>{current.caseKey}</dd>
              <dt>{t('type')}</dt>
              <dd>{t(current.kind)}</dd>
              <dt>{t('materials')}</dt>
              <dd>{current.materials.length}</dd>
              <dt>{t('revision')}</dt>
              <dd>{current.revision}</dd>
              <dt>{t('templateVersion')}</dt>
              <dd>{current.templateVersion}</dd>
              <dt>{t('updated')}</dt>
              <dd>{date(current.updatedAt)}</dd>
            </dl>
          )}
          <Badge variant="outline">{t('mock')}</Badge>
          <p className="text-xs text-muted-foreground">{t('systemNotice')}</p>
        </ContextDisclosure>
      </div>
      <div className="pipeline-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={onReload}
          disabled={busy}
        >
          <RefreshCw size={16} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCreate}
          disabled={
            busy ||
            !data ||
            data.canCreate === false ||
            data.canManage === false
          }
        >
          <Plus size={15} />
          {t('create')}
        </Button>
        {current && (
          <>
            <Button variant="outline" size="sm" onClick={onWorkspace}>
              {t('fullWorkspace')}
              <ArrowUpRight size={14} />
            </Button>
            <Button
              size="sm"
              disabled={
                busy ||
                !flow?.executableNodeKeys.length ||
                current.status === 'review_required' ||
                !data?.canManage
              }
              onClick={onCoordinate}
            >
              <Play size={15} />
              {t('process')}
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
