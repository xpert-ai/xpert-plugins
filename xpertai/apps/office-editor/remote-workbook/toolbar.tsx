import React, { useState } from 'react'
import {
  AlertTriangle, Badge, Button, Check, CircleDot, Download, MoreHorizontal, RefreshCw,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  HoverCard, HoverCardContent, HoverCardTrigger, Tabs, TabsList, TabsTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import { t } from '../remote-file/i18n'
import type { WorkbookRibbon } from '../src/lib/remote-components/office-editor-workbench/src/workbook-ribbon'

type WorkbookToolbarProps = {
  title: string
  ribbon: WorkbookRibbon | null
  revision?: string
  canWrite?: boolean
  dirty: boolean
  busy: boolean
  error: string
  remoteChanged: boolean
  catalogPending?: boolean
  onSave: () => void
  onDownload: () => void
  onReload: () => void
}

/** Keep the canvas stable: details float above it; recovery actions stay in the menu. */
export function WorkbookToolbar(props: WorkbookToolbarProps) {
  const { title, ribbon, revision, canWrite, dirty, busy, error, remoteChanged, catalogPending, onSave, onDownload, onReload } = props
  const [detailsOpen, setDetailsOpen] = useState(false)
  const warning = Boolean(error || remoteChanged)
  const status = t(error ? 'workbook.needsAttention' : remoteChanged ? 'workbook.newVersion' : busy ? 'workbook.saving'
    : !revision ? 'workbook.loading' : !canWrite ? 'workbook.readOnly' : dirty ? 'workbook.unsaved' : 'workbook.saved')
  const StatusIcon = warning ? AlertTriangle : dirty || busy || !revision ? CircleDot : Check
  return <header className="workbook-toolbar">
    <span className="workbook-title" title={title}>{title}</span>
    {ribbon && <Tabs className="workbook-ribbon-tabs" value={ribbon.activeId} onValueChange={ribbon.select}>
      <TabsList variant="line" aria-label={ribbon.label}>
        {/* These tabs select Univer toolbar groups, not Radix TabPanels. */}
        {ribbon.tabs.map(tab => <TabsTrigger key={tab.id} value={tab.id} aria-controls={undefined}>{tab.label}</TabsTrigger>)}
      </TabsList>
    </Tabs>}
    <div className="workbook-actions">
      <HoverCard open={detailsOpen} onOpenChange={setDetailsOpen}>
        <HoverCardTrigger asChild>
          {/* A real button also exposes the details to keyboard and touch users. */}
          <Button variant={warning ? 'destructive' : 'ghost'}
            aria-label={t('workbook.statusDetails', { status })} aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen(open => !open)}>
            <StatusIcon aria-hidden="true" /><span className="workbook-status-label" aria-live="polite">{status}</span>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent align="end" className="workbook-details">
          <strong className="workbook-detail-title">{title}</strong>
          <div className="workbook-detail-badges">
            <Badge variant="secondary">{t('workbook.versioned')}</Badge>
            {revision && <Badge variant="outline">{t('workbook.revision', { revision })}</Badge>}
          </div>
          <p>{error || (remoteChanged ? t('workbook.remoteChanged') : status)}</p>
          {catalogPending && <p>{t('workbook.indexPending')}</p>}
          <p>{t('workbook.collaborationHint')}</p>
        </HoverCardContent>
      </HoverCard>
      {canWrite && <Button disabled={!dirty || busy} onClick={onSave}>{t(busy ? 'workbook.saving' : 'workbook.save')}</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t('workbook.moreActions')}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!revision || busy} onSelect={onDownload}><Download aria-hidden="true" />{t('workbook.downloadLocal')}</DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={onReload}><RefreshCw aria-hidden="true" />{t('workbook.reload')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
}
