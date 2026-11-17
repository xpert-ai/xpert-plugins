import React, { useState } from 'react'
import {
  AlertTriangle, Badge, Button, Check, CircleDot, Download, History, MoreHorizontal, RefreshCw,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  HoverCard, HoverCardContent, HoverCardTrigger, Tabs, TabsList, TabsTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import { t } from '../remote-file/i18n'
import type { WorkbookRibbon } from '../src/lib/remote-components/office-editor-workbench/src/workbook-ribbon'

type WorkbookToolbarProps = {
  queued: boolean
  localSaved: boolean
  localDraftCount: number
  onLocalDrafts(): void
  title: string
  ribbon: WorkbookRibbon | null
  revision?: string
  canWrite?: boolean
  dirty: boolean
  busy: boolean
  error: string
  remoteChanged: boolean
  catalogPending?: boolean
  connection: 'connecting' | 'connected' | 'disconnected'
  collaborators: string[]
  onSave: () => void
  onDownload: () => void
  onReload: () => void
  onHistory: () => void
  onReference: () => void
  changedCells: number
  onFiles: () => void
  onStructure: () => void
}

/** Keep the canvas stable: details float above it; recovery actions stay in the menu. */
export function WorkbookToolbar(props: WorkbookToolbarProps) {
  const { title, ribbon, revision, canWrite, dirty, busy, error, remoteChanged, catalogPending, onSave, onDownload, onReload } = props
  const [detailsOpen, setDetailsOpen] = useState(false)
  const warning = Boolean(error || remoteChanged)
  const status = t(error ? 'workbook.needsAttention' : remoteChanged ? 'workbook.newVersion' : busy ? 'workbook.saving'
    : props.queued ? 'workbook.queued' : !revision ? 'workbook.loading' : !canWrite ? 'workbook.readOnly' : dirty ? 'workbook.unsaved' : 'workbook.saved')
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
          {dirty && <p>{t(props.localSaved ? 'workbook.localDraftSaved' : 'workbook.localDraftSaving')}</p>}
          <p>{t(`workbook.connection.${props.connection}`)}</p>
          {props.collaborators.length > 0 && <p>{t('workbook.collaborators', { names: [...new Set(props.collaborators)].join(', ') })}</p>}
          {props.changedCells > 0 && <p>{t('workbook.highlightedChanges', { count: props.changedCells })}</p>}
        </HoverCardContent>
      </HoverCard>
      {canWrite && <Button disabled={!dirty || busy} onClick={onSave}>{t(busy ? 'workbook.saving' : 'workbook.save')}</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t('workbook.moreActions')}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!revision || busy} onSelect={props.onLocalDrafts}>{t('workbook.localDrafts')} ({props.localDraftCount})</DropdownMenuItem>
          <DropdownMenuItem disabled={!revision || busy} onSelect={props.onFiles}>{t('workbook.files')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!revision || busy || dirty || !canWrite} onSelect={props.onStructure}>{t('workbook.structure')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!revision || busy} onSelect={props.onReference}>{t('workbook.referenceSelection')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!revision || busy} onSelect={props.onHistory}><History aria-hidden="true" />{t('workbook.history')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!revision || busy} onSelect={onDownload}><Download aria-hidden="true" />{t('workbook.downloadLocal')}</DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={onReload}><RefreshCw aria-hidden="true" />{t('workbook.reload')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
}
