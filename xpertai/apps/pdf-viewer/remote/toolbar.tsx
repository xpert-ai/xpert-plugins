import { useId } from 'react'
import {
  Button, ChevronLeft, ChevronRight, Download, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, FileText, Input, Label, PanelLeftOpen, PanelLeftClose, Popover, PopoverContent,
  PopoverTrigger, Maximize2, Search, ZoomIn, ZoomOut
} from '@xpert-ai/plugin-shadcn-ui'
import { t } from './i18n'

type Props = {
  title: string
  total?: number
  page: number
  scale: number
  fit: boolean
  sidebar: boolean
  search: string
  searching: boolean
  notFound: boolean
  onPage: (page: number) => void
  onSidebar: () => void
  onZoom: (direction: 'in' | 'out') => void
  onFit: () => void
  onDownload: () => void
  onSearch: (value: string) => void
  onFind: () => void
}

export function PdfToolbar(props: Props) {
  const searchId = useId()
  return <header className="pdf-toolbar">
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('document.menu')} title={props.title || t('document.menu')}>
        <FileText aria-hidden="true" />
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(24rem,calc(100vw-1.5rem))]">
        <DropdownMenuLabel className="break-words">{props.title || t('document.loading')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!props.title} onSelect={props.onDownload}><Download aria-hidden="true" />{t('document.download')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button variant="ghost" size="icon" disabled={!props.total} aria-pressed={props.sidebar} aria-label={t('document.thumbnails')} title={t('document.thumbnails')} onClick={props.onSidebar}>
      {props.sidebar ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
    </Button>
    <span className="pdf-toolbar-title" title={props.title}>{props.title || t('document.loading')}</span>
    {props.total && <>
      <nav className="flex shrink-0 items-center gap-0.5" aria-label={t('document.pageNumber')}>
        <Button variant="ghost" size="icon" disabled={props.page <= 1} aria-label={t('document.previous')} title={t('document.previous')} onClick={() => props.onPage(props.page - 1)}><ChevronLeft aria-hidden="true" /></Button>
        <Input className="w-14 shrink-0" type="number" min={1} max={props.total} aria-label={t('document.pageNumber')} value={props.page} onChange={event => {
          const number = Number(event.target.value)
          if (Number.isInteger(number) && number > 0 && number <= props.total!) props.onPage(number)
        }} />
        <span className="shrink-0 whitespace-nowrap text-sm tabular-nums" aria-label={t('document.page', { page: props.page, total: props.total })}>/ {props.total}</span>
        <Button variant="ghost" size="icon" disabled={props.page >= props.total} aria-label={t('document.next')} title={t('document.next')} onClick={() => props.onPage(props.page + 1)}><ChevronRight aria-hidden="true" /></Button>
      </nav>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button className="pdf-zoom-shortcut" variant="ghost" size="icon" aria-label={t('document.zoomOut')} title={t('document.zoomOut')} onClick={() => props.onZoom('out')}><ZoomOut aria-hidden="true" /></Button>
        <Button className="pdf-zoom-shortcut" variant="ghost" size="icon" aria-label={t('document.zoomIn')} title={t('document.zoomIn')} onClick={() => props.onZoom('in')}><ZoomIn aria-hidden="true" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('document.zoom')} title={`${t(props.fit ? 'document.fit' : 'document.zoom')} · ${Math.round(props.scale * 100)}%`}>
            <Maximize2 aria-hidden="true" />
          </Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{Math.round(props.scale * 100)}%</DropdownMenuLabel>
            <DropdownMenuItem onSelect={props.onFit}><Maximize2 aria-hidden="true" />{t('document.fit')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onZoom('out')}><ZoomOut aria-hidden="true" />{t('document.zoomOut')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onZoom('in')}><ZoomIn aria-hidden="true" />{t('document.zoomIn')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Popover>
        <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={t('document.search')} title={t('document.search')}><Search aria-hidden="true" /></Button></PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)]">
          <section role="search" aria-label={t('document.search')} className="grid gap-3">
            <Label htmlFor={searchId}>{t('document.search')}</Label>
            <Input id={searchId} placeholder={t('document.search')} maxLength={200} value={props.search} onChange={event => props.onSearch(event.target.value)} onKeyDown={event => {
              // Remote Views do not grant native form submission in the iframe sandbox.
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (!props.searching) props.onFind() }
            }} />
            <Button variant="outline" type="button" onClick={props.onFind} disabled={props.searching || !props.search.trim()}>{t(props.searching ? 'document.searching' : 'document.find')}</Button>
            {props.notFound && <p role="status" className="text-sm text-muted-foreground">{t('document.notFound')}</p>}
          </section>
        </PopoverContent>
      </Popover>
    </>}
    <Button className="pdf-download-shortcut" variant="ghost" size="icon" disabled={!props.title} aria-label={t('document.download')} title={t('document.download')} onClick={props.onDownload}><Download aria-hidden="true" /></Button>
  </header>
}
