import * as React from 'react'
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, MoreHorizontal, FileJson, Send, Plus, Trash2, History, RefreshCw, Download } from '@xpert-ai/plugin-shadcn-ui'
import type { messages } from './i18n'

export function ToolbarMenu({ t, disabled, canEdit, canShare, canDelete, version, versions, onVersion, onRestore, onEdit, onImport, onExport, onShare, onDelete, refreshSeconds, onRefreshSeconds, cacheSeconds, onCacheSeconds, hasDashboard, updatedAt }: {
  t: ReturnType<typeof messages>
  disabled: boolean
  canEdit: boolean
  canShare: boolean
  canDelete: boolean
  version?: string
  versions: { versionId?: string | null; versionNumber?: number }[]
  onVersion?: (id: string) => void
  onRestore?: () => void
  onEdit?: () => void
  onImport?: () => void
  onExport?: () => void
  onShare?: () => void
  onDelete?: () => void
  refreshSeconds: string
  onRefreshSeconds: (value: string) => void
  cacheSeconds?: string
  onCacheSeconds?: (value: string) => void
  hasDashboard: boolean
  updatedAt: string
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={disabled} aria-label={t.more} title={t.more}><MoreHorizontal/></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60">
      {canEdit && hasDashboard && <DropdownMenuItem onSelect={onEdit}><FileJson/>{t.edit}</DropdownMenuItem>}
      {canEdit && onRestore && <DropdownMenuItem onSelect={onRestore}><History/>{t.restoreDraft}</DropdownMenuItem>}
      {canEdit && hasDashboard && <DropdownMenuItem onSelect={onExport}><Download/>{t.exportDashboard}</DropdownMenuItem>}
      {canShare && <DropdownMenuItem onSelect={onShare}><Send/>{t.share}</DropdownMenuItem>}
      {canEdit && <DropdownMenuItem onSelect={onImport}><Plus/>{t.importDashboard}</DropdownMenuItem>}
      {onVersion && <DropdownMenuSub><DropdownMenuSubTrigger><History/>{t.history}</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="max-h-64 w-48 overflow-y-auto">
        <DropdownMenuRadioGroup value={version} onValueChange={onVersion}>
          <DropdownMenuRadioItem value="draft">{t.draft}</DropdownMenuRadioItem>
          {versions.filter(item => item.versionId).map(item => <DropdownMenuRadioItem key={item.versionId} value={item.versionId!}>{t.version} {item.versionNumber}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>}
      <DropdownMenuSub><DropdownMenuSubTrigger disabled={!hasDashboard}><RefreshCw/>{t.autoRefresh}</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup value={refreshSeconds} onValueChange={onRefreshSeconds}>
          <DropdownMenuRadioItem value="off">{t.off}</DropdownMenuRadioItem><DropdownMenuRadioItem value="30">{t.seconds30}</DropdownMenuRadioItem><DropdownMenuRadioItem value="60">{t.minute1}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>
      {onCacheSeconds && <DropdownMenuSub><DropdownMenuSubTrigger disabled={!hasDashboard}><History/>{t.resultReuse}</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="w-64">
        <DropdownMenuLabel className="whitespace-normal font-normal">{t.resultReuseHelp}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={cacheSeconds ?? 'off'} onValueChange={onCacheSeconds}>
          <DropdownMenuRadioItem value="off">{t.off}</DropdownMenuRadioItem><DropdownMenuRadioItem value="30">{t.seconds30}</DropdownMenuRadioItem><DropdownMenuRadioItem value="60">{t.minute1}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>}
      {updatedAt && <><DropdownMenuSeparator/><DropdownMenuLabel>{t.refreshed}<time className="block font-normal" dateTime={updatedAt}>{new Date(updatedAt).toLocaleString(document.documentElement.lang)}</time></DropdownMenuLabel></>}
      {canDelete && <><DropdownMenuSeparator/><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2/>{t.deleteDashboard}</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>
}
