import React, { createElement as h } from 'react'
import {
  Button, ChevronDown, MoreHorizontal, Files, Folder, History, Image, Save, Send, Trash2, Upload,
  MessageSquare, Maximize2, RefreshCw, Separator,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  Popover, PopoverContent, PopoverTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from '../../../../../remote/locales/en.json'
import zh from '../../../../../remote/locales/zh-Hans.json'
import zhHant from '../../../../../remote/locales/zh-Hant.json'

export type HeaderPanel = 'documents' | 'details' | null
type Preset = { id: string; label: string; w: number; h: number }
type Labels = { documents: string; details: string; save: string; share: string;
  aiHolder: string; annotation: string; aspect: string; import: string; delete: string }
type Props = {
  title: string; locale?: string; panel: HeaderPanel; onPanelChange(value: HeaderPanel): void;
  busy: boolean; hasDocument: boolean; saveDisabled: boolean; shareDisabled: boolean;
  conversionDisabled: boolean; canUpgrade: boolean; labels: Labels;
  documents: React.ReactNode; details: React.ReactNode; presence: React.ReactNode; status: React.ReactNode;
  presets: Preset[]; onPreset(preset: Preset): void;
  onSave(): void; onShare(): void; onConvert(): void; onUpgrade(): void;
  onImage(): void; onAnnotate(): void; onImport(): void; onDelete(): void;
}

// The cards contain forms and actions. Popover supplies focus/dismissal semantics;
// hover reveals them, while click/keyboard pins them for editing.
function HeaderHoverCard({ open, onOpenChange, label, trigger, children, align = 'start', disabled = false }: {
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
        className={align === 'start' ? 'cw-canvas-picker' : undefined} aria-label={label} title={label}
        onPointerEnter={event => { if (event.pointerType === 'mouse') enter() }} onPointerLeave={leave}
        onClick={event => { event.preventDefault(); clear(); const next = !open || !pinned.current; restoreFocus.current = true; pinned.current = next; onOpenChange(next) }}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); clear(); restoreFocus.current = true; pinned.current = true; onOpenChange(true) } }}>
        {trigger}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="cw-header-card" align={align} sideOffset={8} collisionPadding={12}
      aria-label={label} onPointerEnter={clear} onPointerLeave={leave}
      onFocusCapture={() => { clear(); restoreFocus.current = true; pinned.current = true }}
      onInteractOutside={() => { restoreFocus.current = false }}
      onOpenAutoFocus={event => { if (!pinned.current) event.preventDefault() }}
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) triggerRef.current?.focus() }}>
      {children}
    </PopoverContent>
  </Popover>
}

export function CanvasHeader(p: Props) {
  const [i18n] = React.useState(() => createRemoteI18n({ en, 'zh-Hans': zh, 'zh-Hant': zhHant }, p.locale ?? 'en'))
  useRemoteLocale(i18n)
  React.useEffect(() => i18n.setLocale(p.locale), [p.locale, i18n])
  const action = (fn: () => void) => () => { p.onPanelChange(null); fn() }
  return <RemoteI18nProvider i18n={i18n}>
    <header className="cw-toolbar">
      <div className="cw-toolbar-title">
        <HeaderHoverCard open={p.panel === 'documents'} onOpenChange={open => p.onPanelChange(open ? 'documents' : null)}
          label={p.labels.documents} trigger={<><Folder /><span className="cw-picker-title">{p.title}</span><ChevronDown /></>}>
          {p.documents}
        </HeaderHoverCard>
        {p.status}
      </div>
      <div className="cw-toolbar-actions">
        {p.presence}
        <div className="cw-secondary-actions">
          <HeaderHoverCard open={p.panel === 'details'} onOpenChange={open => p.onPanelChange(open ? 'details' : null)}
            disabled={!p.hasDocument} label={p.labels.details} align="end" trigger={<History />}>
            <div className="cw-card-heading"><strong>{p.labels.details}</strong></div>
            {p.details}
          </HeaderHoverCard>
          <DropdownMenu onOpenChange={open => { if (open) p.onPanelChange(null) }}>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={i18n.t('header.more')} title={i18n.t('header.more')}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent className="cw-header-menu" align="end" collisionPadding={12}>
              <DropdownMenuItem disabled={p.saveDisabled} onSelect={action(p.onSave)}><Save />{p.labels.save}</DropdownMenuItem>
              <DropdownMenuItem disabled={p.conversionDisabled} onSelect={action(p.onConvert)}><Files />{i18n.t('conversion.action')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!p.hasDocument || p.busy} onSelect={action(p.onImage)}><Image />{p.labels.aiHolder}</DropdownMenuItem>
              <DropdownMenuItem disabled={!p.hasDocument || p.busy} onSelect={action(p.onAnnotate)}><MessageSquare />{p.labels.annotation}</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={!p.hasDocument || p.busy}><Maximize2 />{p.labels.aspect}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>{p.presets.map(preset => <DropdownMenuItem key={preset.id} onSelect={() => p.onPreset(preset)}>{preset.label}</DropdownMenuItem>)}</DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem disabled={p.busy} onSelect={action(p.onImport)}><Upload />{p.labels.import}</DropdownMenuItem>
              {p.canUpgrade ? <DropdownMenuItem disabled={p.conversionDisabled} onSelect={action(p.onUpgrade)}><RefreshCw />{i18n.t('collaboration.upgrade')}</DropdownMenuItem> : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!p.hasDocument || p.busy} onSelect={action(p.onDelete)}><Trash2 />{p.labels.delete}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Separator orientation="vertical" className="cw-action-divider" />
        <Button size="sm" disabled={p.shareDisabled} onClick={action(p.onShare)} aria-label={p.labels.share} title={p.labels.share}>
          <Send /><span className="cw-share-label">{p.labels.share}</span>
        </Button>
      </div>
    </header>
  </RemoteI18nProvider>
}
