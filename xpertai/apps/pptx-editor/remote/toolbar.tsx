import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import { PanelsTopLeft, PanelLeft, Grid2X2, Plus, Type, ImagePlus, Shapes, Table2, Undo2, Redo2, SlidersHorizontal,
  Play, Download, Save, ChevronDown, RefreshCw } from 'lucide-react'
import { t, type MessageKey } from './i18n'

type ToolbarProps = {
  editable: boolean; busy: boolean; dirty: boolean; canUndo: boolean; canRedo: boolean; zoom: string;
  onZoom(value: string): void; onAdd(kind: 'slide' | 'text' | 'image' | 'shape' | 'table'): void;
  onUndo(): void; onRedo(): void; onSave(): void; onDownload(): void; onReload(): void;
  onNavigation(): void; onGrid(): void; onProperties(): void; onPresent(fromStart: boolean): void
}
export function Toolbar(p: ToolbarProps) {
  const tools = [
    { key: 'slide', label: 'ppt.addSlide', Icon: Plus }, { key: 'text', label: 'ppt.text', Icon: Type },
    { key: 'image', label: 'ppt.image', Icon: ImagePlus }, { key: 'shape', label: 'ppt.shape', Icon: Shapes },
    { key: 'table', label: 'ppt.table', Icon: Table2 }
  ] satisfies { key: Parameters<ToolbarProps['onAdd']>[0]; label: MessageKey; Icon: typeof Plus }[]
  return <header className="ppt-toolbar flex shrink-0 flex-wrap items-center gap-2 p-3" aria-label={t('ppt.fileMenu')}>
    <div className="ppt-toolgroup flex items-center gap-1">
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label={t('ppt.fileMenu')}><PanelsTopLeft/><ChevronDown/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start"><DropdownMenuItem onSelect={p.onNavigation}><PanelLeft/>{t('ppt.navigation')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={p.onGrid}><Grid2X2/>{t('ppt.grid')}</DropdownMenuItem><DropdownMenuSeparator/>
        <DropdownMenuItem onSelect={p.onReload} disabled={p.busy}><RefreshCw/>{t('ppt.reload')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={p.onDownload} disabled={p.busy}><Download/>{t('ppt.download')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    {p.editable && <div className="flex items-center gap-1 border-r pr-2">{tools.map(({key,label,Icon}) =>
      <Button key={key} variant="ghost" size="icon" title={t(label)} aria-label={t(label)} disabled={p.busy} onClick={() => p.onAdd(key)}><Icon/></Button>)}</div>}
    {p.editable && <><Button variant="ghost" size="icon" aria-label={t('ppt.undo')} title={t('ppt.undo')} disabled={!p.canUndo || p.busy} onClick={p.onUndo}><Undo2/></Button>
      <Button variant="ghost" size="icon" aria-label={t('ppt.redo')} title={t('ppt.redo')} disabled={!p.canRedo || p.busy} onClick={p.onRedo}><Redo2/></Button></>}
    </div><span className="min-w-0 flex-1"/>
    <div className="ppt-toolgroup flex items-center gap-1">
    {p.editable && <Button variant="ghost" size="icon" title={t('ppt.properties')} aria-label={t('ppt.properties')} onClick={p.onProperties}><SlidersHorizontal/></Button>}
    <Select value={p.zoom} onValueChange={p.onZoom}><SelectTrigger className="w-auto" aria-label={t('ppt.zoom')}><SelectValue/></SelectTrigger>
      <SelectContent><SelectItem value="fit">{t('ppt.fit')}</SelectItem>{['50','75','100','125','150'].map(n => <SelectItem key={n} value={n}>{n}%</SelectItem>)}</SelectContent></Select>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Play/>{t('ppt.present')}<ChevronDown/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => p.onPresent(false)}>{t('ppt.presentCurrent')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => p.onPresent(true)}>{t('ppt.presentStart')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Button variant="ghost" size="icon" title={t('ppt.download')} aria-label={t('ppt.download')} disabled={p.busy} onClick={p.onDownload}><Download/></Button>
    {p.editable && <Button variant={p.dirty ? 'default' : 'outline'} disabled={!p.dirty || p.busy} onClick={p.onSave}><Save/>{t(p.busy ? 'ppt.saving' : 'ppt.save')}</Button>}
    </div>
  </header>
}
