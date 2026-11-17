import React, { createElement as h } from 'react'
import {
  Button, Badge, Check, ChevronDown, MoreHorizontal, Folder, FileText, Table2, Files, History, Save, Upload, Download, RotateCcw, Trash2,
  Popover, PopoverContent, PopoverTrigger, Separator,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent
} from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from '../../../../../remote/locales/en.json'
import zh from '../../../../../remote/locales/zh-Hans.json'
import zhHant from '../../../../../remote/locales/zh-Hant.json'

export type OfficeHeaderPanel = 'documents' | 'details' | null
export type OfficeKind = 'document' | 'spreadsheet' | 'presentation'
export type OfficeFormat = 'xlsx' | 'docx' | 'pptx'
type Props = {
  title: string; locale?: string; kind?: OfficeKind; panel: OfficeHeaderPanel; onPanelChange(value: OfficeHeaderPanel): void;
  hasDocument: boolean; busy: boolean; dirty: boolean; connected: boolean; status: string; statusDetail: string;
  documents: React.ReactNode; details: React.ReactNode; canDownload: boolean;
  labels: { documents: string; save: string; sync: string; import: string; download: string; delete: string };
  formats: { value: OfficeFormat; label: string }[];
  onSave(): void; onSync(): void; onDownload(): void; onImport(format: OfficeFormat): void; onDelete(): void;
}

// The cards contain forms and actions. Popover supplies focus/dismissal semantics;
// hover reveals them, while click/keyboard pins them for editing.
function OfficeHoverCard({ open, onOpenChange, label, trigger, children, align = 'start', disabled = false }: {
  open: boolean; onOpenChange(open: boolean): void; label: string; trigger: React.ReactNode;
  children: React.ReactNode; align?: 'start' | 'end'; disabled?: boolean;
}) {
  const pinned = React.useRef(false)
  const restoreFocus = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const clear = () => { if (timer.current) clearTimeout(timer.current) }
  React.useEffect(() => { clear(); if (!open) pinned.current = false }, [open])
  React.useEffect(() => () => clear(), [])
  const enter = () => {
    clear()
    if (!disabled && !open) timer.current = setTimeout(() => { restoreFocus.current = false; onOpenChange(true) }, 180)
  }
  const leave = () => {
    clear()
    if (open && !pinned.current) timer.current = setTimeout(() => onOpenChange(false), 280)
  }
  return <Popover open={open} onOpenChange={value => { clear(); if (value) restoreFocus.current = true; pinned.current = value; onOpenChange(value) }}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} size={align === 'start' ? 'sm' : 'icon-sm'} variant="ghost" disabled={disabled}
        className={align === 'start' ? 'oe-document-picker' : undefined} aria-label={label} title={label}
        onPointerEnter={event => { if (event.pointerType === 'mouse') enter() }} onPointerLeave={leave}
        onClick={event => { event.preventDefault(); clear(); const next = !open || !pinned.current; restoreFocus.current = true; pinned.current = next; onOpenChange(next) }}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); clear(); restoreFocus.current = true; pinned.current = true; onOpenChange(true) } }}>
        {trigger}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="oe-header-card" align={align} sideOffset={8} collisionPadding={12}
      aria-label={label} onPointerEnter={clear} onPointerLeave={leave}
      onFocusCapture={() => { clear(); restoreFocus.current = true; pinned.current = true }}
      onInteractOutside={() => { restoreFocus.current = false }}
      onOpenAutoFocus={event => { if (!pinned.current) event.preventDefault() }}
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) triggerRef.current?.focus() }}>
      {children}
    </PopoverContent>
  </Popover>
}

export function OfficeHeader(p: Props) {
  const [i18n] = React.useState(() => createRemoteI18n({ en, 'zh-Hans': zh, 'zh-Hant': zhHant }, p.locale ?? 'en'))
  useRemoteLocale(i18n)
  React.useEffect(() => i18n.setLocale(p.locale), [p.locale, i18n])
  const Icon = p.kind === 'document' ? FileText : p.kind === 'spreadsheet' ? Table2 : p.kind === 'presentation' ? Files : Folder
  const action = (fn: () => void) => () => { p.onPanelChange(null); fn() }
  return <RemoteI18nProvider i18n={i18n}>
    <header className="oe-toolbar">
      <div className="oe-toolbar-title">
        <OfficeHoverCard open={p.panel === 'documents'} onOpenChange={open => p.onPanelChange(open ? 'documents' : null)}
          label={p.labels.documents} trigger={<><Icon /><span className="oe-picker-title">{p.title}</span><ChevronDown /></>}>
          {p.documents}
        </OfficeHoverCard>
        {p.hasDocument ? <Badge className="oe-status" variant={p.dirty || !p.connected ? 'outline' : 'ghost'}
          data-status={p.dirty || !p.connected ? 'warning' : undefined} title={p.statusDetail} role="status" aria-live="polite">
          {p.connected && !p.dirty ? <Check aria-hidden="true" /> : null}{p.status}
        </Badge> : null}
      </div>
      <div className="oe-actions">
        <div className="oe-secondary-actions">
          <OfficeHoverCard open={p.panel === 'details'} onOpenChange={open => p.onPanelChange(open ? 'details' : null)}
            label={i18n.t('header.details')} align="end" disabled={!p.hasDocument} trigger={<History />}>
            {p.details}
          </OfficeHoverCard>
          <DropdownMenu onOpenChange={open => { if (open) p.onPanelChange(null) }}>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={i18n.t('header.more')} title={i18n.t('header.more')}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent className="oe-more-menu" align="end" collisionPadding={12}>
              <DropdownMenuSub><DropdownMenuSubTrigger disabled={p.busy}><Upload />{p.labels.import}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>{p.formats.map(format => <DropdownMenuItem key={format.value} onSelect={action(() => p.onImport(format.value))}>{format.label}</DropdownMenuItem>)}</DropdownMenuSubContent>
              </DropdownMenuSub>
              {p.canDownload ? <DropdownMenuItem disabled={p.busy} onSelect={action(p.onDownload)}><Download />{p.labels.download}</DropdownMenuItem> : null}
              <DropdownMenuItem disabled={!p.hasDocument || p.busy} onSelect={action(p.onSync)}><RotateCcw />{p.labels.sync}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!p.hasDocument || p.busy} onSelect={action(p.onDelete)}><Trash2 />{p.labels.delete}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Separator orientation="vertical" className="oe-action-divider" />
        <Button size="sm" disabled={!p.hasDocument || p.busy} onClick={action(p.onSave)} aria-label={p.labels.save} title={p.labels.save}>
          <Save /><span className="oe-save-label">{p.labels.save}</span>
        </Button>
      </div>
    </header>
  </RemoteI18nProvider>
}
