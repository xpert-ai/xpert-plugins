import { useEffect, useRef, useState } from 'react'
import { Button, Textarea, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction, Dialog, DialogContent, DialogTitle } from '@xpert-ai/plugin-shadcn-ui'
import { ChevronDown, ChevronUp, PanelLeftClose, MoreHorizontal, Copy, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { useDocument, type Source } from './use-document'
import { Toolbar } from './toolbar'
import { Properties } from './properties'
import { PptxCanvas } from './canvas/PptxCanvas'
import type { PptxDeck, PptxShape } from '../src/core/pptx-types'
import { createSlideCopy, createTextBoxShape, createPresetShape, createTableShape, paragraphsForShapeText, moveShapeLayer } from '../src/core/pptx-editor-model.utils'
import { t, useLocale } from './i18n'
import { useCollaboration } from './collaboration'

export function Editor({ source }: { source: Source }) {
  useLocale()
  const doc = useDocument(source)
  const [index, setIndex] = useState(0), [selected, select] = useState<string | null>(null)
  const [navigation, setNavigation] = useState(true), [grid, setGrid] = useState(false)
  const [notes, setNotes] = useState(false), [properties, setProperties] = useState(false)
  const [zoom, setZoom] = useState('fit'), [size, setSize] = useState({ width: 900, height: 650 })
  const [present, setPresent] = useState<number | null>(null), [confirmReload, setConfirmReload] = useState(false)
  const stage = useRef<HTMLDivElement>(null), imageInput = useRef<HTMLInputElement>(null)
  const deck = doc.deck, slide = deck?.slides[Math.min(index, deck.slides.length - 1)]
  const canEdit = Boolean(doc.info?.canWrite && !doc.busy)
  const shape = slide?.shapes.find(s => s.id === selected && s.editable && !s.deleted)
  const collaboration = useCollaboration(source, doc.info?.collaboration === true, slide?.path, selected)
  const stale = doc.info?.sequence !== undefined && collaboration.revision > doc.info.sequence
  useEffect(() => {
    // Clean readers follow committed changes; drafts require explicit reload or conflict resolution.
    if (stale && !doc.dirty && !doc.busy && !doc.error) void doc.load()
  }, [stale, doc.dirty, doc.busy, doc.error, doc.load])
  useEffect(() => {
    const target = stage.current
    if (!target) return
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    observer.observe(target); return () => observer.disconnect()
  }, [Boolean(deck), grid, notes])
  useEffect(() => {
    if (deck) setIndex(i => Math.max(0, Math.min(i, deck.slides.length - 1)))
  }, [deck?.slides.length])
  function changePage(next: number) { setIndex(next); select(null); doc.endEdit() }
  function changeShape(patch: Partial<PptxShape>) {
    if (!slide || !shape) return
    doc.edit(next => {
      const target = next.slides.find(s => s.path === slide.path)?.shapes.find(s => s.id === shape.id)
      if (!target) return
      Object.assign(target, patch)
      if (patch.text !== undefined) target.paragraphs = paragraphsForShapeText(target, patch.text)
    }, `properties:${slide.path}:${shape.id}`)
  }
  function changeSlide(action: 'duplicate' | 'delete' | 'up' | 'down', position: number) {
    if (!deck || !canEdit) return
    doc.edit(next => {
      if (action === 'duplicate') next.slides.splice(position + 1, 0, createSlideCopy(next, next.slides[position], false))
      if (action === 'delete' && next.slides.length > 1) next.slides.splice(position, 1)
      if (action === 'up' && position > 0) [next.slides[position - 1], next.slides[position]] = [next.slides[position], next.slides[position - 1]]
      if (action === 'down' && position < next.slides.length - 1) [next.slides[position + 1], next.slides[position]] = [next.slides[position], next.slides[position + 1]]
    })
    changePage(action === 'duplicate' || action === 'down' ? position + 1 : action === 'up' ? position - 1 : Math.min(position, deck.slides.length - 2))
  }
  function add(kind: 'slide' | 'text' | 'image' | 'shape' | 'table') {
    if (!deck || !slide || !canEdit) return
    if (kind === 'image') { imageInput.current?.click(); return }
    if (kind === 'slide') {
      doc.edit(next => next.slides.splice(index + 1, 0, createSlideCopy(next, next.slides[index], true)))
      changePage(index + 1); return
    }
    const created = kind === 'text' ? createTextBoxShape(deck) : kind === 'shape' ? createPresetShape(deck, 'rect') : createTableShape(deck, 3, 3)
    created.id = crypto.randomUUID(); created.sourceId = undefined
    if (kind === 'text') { created.text = t('ppt.newText'); created.paragraphs = paragraphsForShapeText(created, created.text) }
    doc.edit(next => next.slides[index].shapes.push(created)); select(created.id)
  }
  async function insertImage(file?: File) {
    if (!file || !deck || !slide || !canEdit) return
    const path = slide.path
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error('image'))
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('image'))
      reader.readAsDataURL(file)
    })
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url })
    const created = createPresetShape(deck, 'rect')
    created.id = crypto.randomUUID(); created.sourceId = undefined; created.kind = 'image'; created.name = file.name
    created.imageSrc = url; created.text = ''; created.paragraphs = []; created.fill = null; created.stroke = null
    created.width = Math.min(deck.width * .6, deck.height * .6 * image.naturalWidth / image.naturalHeight)
    created.height = created.width * image.naturalHeight / image.naturalWidth
    created.x = (deck.width - created.width) / 2; created.y = (deck.height - created.height) / 2
    doc.edit(next => next.slides.find(s => s.path === path)?.shapes.push(created)); select(created.id)
  }
  if (!deck || !slide) return <main className="flex h-full items-center justify-center p-6" role="status">{t(doc.error ? 'ppt.failed' : 'ppt.loading')}
    {doc.error && <Button onClick={() => void doc.load()}>{t('ppt.reload')}</Button>}</main>
  const canvasWidth = zoom === 'fit' ? Math.max(80, Math.min(size.width - 64, (size.height - 64) * deck.width / deck.height)) : deck.width / 9525 * Number(zoom) / 100
  return <main className="ppt-editor flex h-full min-h-0 min-w-0 flex-col overflow-hidden text-foreground" onKeyDown={event => {
    if (event.defaultPrevented) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void doc.save().catch(() => undefined) }
    if (event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable="true"]')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); doc.travel(event.shiftKey ? 'redo' : 'undo'); select(null) }
    if (canEdit && selected && ['Delete','Backspace'].includes(event.key)) { event.preventDefault(); changeShape({deleted:true}); select(null) }
  }}>
    <Toolbar editable={Boolean(doc.info?.canWrite)} busy={doc.busy} dirty={doc.dirty} canUndo={doc.canUndo} canRedo={doc.canRedo} zoom={zoom} onZoom={setZoom}
      onAdd={add} onUndo={() => {doc.travel('undo');select(null)}} onRedo={() => {doc.travel('redo');select(null)}}
      onSave={() => void doc.save().catch(() => undefined)} onDownload={() => void doc.download().catch(doc.fail)}
      onReload={() => doc.dirty ? setConfirmReload(true) : void doc.load()}
      onNavigation={() => setNavigation(v => !v)} onGrid={() => setGrid(v => !v)} onProperties={() => setProperties(v => !v)} onPresent={start => setPresent(start ? 0 : index)}/>
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-3 pb-3">
      {navigation && !grid && <aside className="ppt-navigation flex shrink-0 flex-col bg-background" aria-label={t('ppt.navigation')}>
        <div className="flex items-center justify-between p-3 text-sm text-muted-foreground"><span>{t('ppt.slides',{count:deck.slides.length})}</span>
          <Button variant="ghost" size="icon" aria-label={t('ppt.navigation')} onClick={() => setNavigation(false)}><PanelLeftClose/></Button></div>
        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{deck.slides.map((item,i) => <li key={item.path} className="group relative">
          <Button variant={i===index ? 'secondary':'ghost'} className="ppt-thumbnail flex w-full items-start gap-2" aria-label={t('ppt.slide',{number:i+1})} aria-pressed={i===index} onClick={() => changePage(i)}>
            <span className="shrink-0 text-xs">{i+1}</span><span className={`min-w-0 flex-1 overflow-hidden rounded-md border ${i===index ? 'ring-2 ring-primary':'border-border'}`}><PptxCanvas deck={deck} slide={item}/></span>
          </Button>
          {canEdit && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="absolute bottom-1 right-1 opacity-0 focus:opacity-100 group-hover:opacity-100" aria-label={t('ppt.slideActions')}><MoreHorizontal/></Button></DropdownMenuTrigger>
            <DropdownMenuContent><DropdownMenuItem onSelect={() => changeSlide('duplicate',i)}><Copy/>{t('ppt.duplicate')}</DropdownMenuItem>
              <DropdownMenuItem disabled={!i} onSelect={() => changeSlide('up',i)}><ArrowUp/>{t('ppt.moveUp')}</DropdownMenuItem>
              <DropdownMenuItem disabled={i===deck.slides.length-1} onSelect={() => changeSlide('down',i)}><ArrowDown/>{t('ppt.moveDown')}</DropdownMenuItem>
              <DropdownMenuItem disabled={deck.slides.length===1} onSelect={() => changeSlide('delete',i)}><Trash2/>{t('ppt.deleteSlide')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        </li>)}</ol>
      </aside>}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {doc.error && <div role="alert" className="shrink-0 border-b bg-background px-4 py-2 text-sm text-destructive">{t(doc.error==='conflict' ? 'ppt.conflict':'ppt.failed')}</div>}
        {stale && doc.dirty && !doc.error && <div role="status" className="shrink-0 border-b bg-background px-4 py-2 text-sm">{t('ppt.newRevision')}</div>}
        {grid ? <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-6 overflow-auto p-6 lg:grid-cols-3">{deck.slides.map((item,i) =>
          <Button key={item.path} variant="ghost" className="ppt-thumbnail flex flex-col gap-2" onClick={() => {changePage(i);setGrid(false)}} aria-label={t('ppt.slide',{number:i+1})}><PptxCanvas deck={deck} slide={item}/><span>{i+1}</span></Button>)}</div>
          : <div ref={stage} className="relative min-h-0 flex-1 overflow-auto"><div className="flex min-h-full min-w-full items-center justify-center p-8"><div className="shrink-0" style={{width:canvasWidth}}>
            <PptxCanvas deck={deck} slide={slide} selected={selected} onSelect={canEdit ? select : undefined}
              onTransform={canEdit ? (id,bounds) => doc.edit(next => { const target=next.slides[index].shapes.find(s=>s.id===id); if(target) Object.assign(target,bounds) }) : undefined}
              onText={canEdit ? (id,text) => doc.edit(next => { const target=next.slides[index].shapes.find(s=>s.id===id); if(target) {target.text=text;target.paragraphs=paragraphsForShapeText(target,text)} }, `text:${slide.path}:${id}`) : undefined}
              onTextEnd={doc.endEdit}/>
          </div></div></div>}
        <section className="shrink-0 rounded-xl" aria-label={t('ppt.notes')}>
          <div className="flex items-center justify-between px-3 py-1"><span className="min-w-0 truncate text-xs text-muted-foreground" role="status">{doc.info?.title} · {t(!doc.info?.canWrite ? 'ppt.readOnly' : doc.busy ? 'ppt.saving' : doc.dirty ? 'ppt.unsaved' : 'ppt.saved')}</span>
            {doc.info?.collaboration && <span className="px-2 text-xs text-muted-foreground" title={collaboration.peers.map(peer=>peer.displayName).join(', ')}>{t(collaboration.connected ? 'ppt.collaborators' : 'ppt.reconnecting',{count:collaboration.peers.length+1})}</span>}
            <Button variant="ghost" onClick={() => setNotes(v=>!v)} aria-expanded={notes}>{notes ? <ChevronDown/>:<ChevronUp/>}{t('ppt.notes')}</Button></div>
          {notes && <div className="px-4 pb-4"><Textarea aria-label={t('ppt.notes')} placeholder={t('ppt.notesPlaceholder')} readOnly={!canEdit} value={slide.notes ?? ''}
            onChange={e => doc.edit(next => {next.slides[index].notes=e.target.value}, `notes:${slide.path}`)} onBlur={doc.endEdit}/></div>}
        </section>
      </section>
      {properties && canEdit && <Properties shape={shape} onChange={changeShape} onClose={() => setProperties(false)}
        onLayer={direction => doc.edit(next => { const shapes = next.slides[index].shapes; const target = shapes.find(item => item.id === shape?.id); if(target) moveShapeLayer(shapes,target,direction) })}
        onDelete={() => {changeShape({deleted:true});select(null)}}/>}
    </div>
    <input ref={imageInput} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => {void insertImage(e.target.files?.[0]).catch(doc.fail);e.target.value=''}}/>
    {present !== null && <Presentation deck={deck} initialIndex={present} onClose={() => setPresent(null)}/>}
    <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('ppt.reloadTitle')}</AlertDialogTitle><AlertDialogDescription>{t('ppt.reloadDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('ppt.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void doc.load()}>{t('ppt.reload')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
}

function Presentation({deck,initialIndex,onClose}:{deck:PptxDeck;initialIndex:number;onClose():void}) {
  const visible=deck.slides.filter(s=>!s.hidden)
  const [index,setIndex]=useState(Math.max(0,visible.indexOf(deck.slides[initialIndex])))
  const move=(delta:number)=>setIndex(i=>Math.max(0,Math.min(visible.length-1,i+delta)))
  return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className="ppt-present flex flex-col" aria-describedby={undefined} onKeyDown={e=>{
    e.stopPropagation()
    if(['ArrowRight','ArrowDown',' '].includes(e.key)){e.preventDefault();move(1)}
    if(['ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();move(-1)}
    if(e.key==='Home')setIndex(0)
    if(e.key==='End')setIndex(Math.max(0,visible.length-1))
  }}><DialogTitle className="sr-only">{t('ppt.present')}</DialogTitle>
    <div className="flex min-h-0 flex-1 items-center justify-center">{visible[index] && <div style={{width:`min(100%, calc(72vh * ${deck.width/deck.height}))`}}><PptxCanvas deck={deck} slide={visible[index]}/></div>}</div>
    <div className="flex items-center justify-center gap-4"><Button variant="outline" disabled={!index} onClick={()=>move(-1)}>{t('ppt.previous')}</Button><span>{index+1} / {visible.length}</span><Button variant="outline" disabled={index>=visible.length-1} onClick={()=>move(1)}>{t('ppt.next')}</Button></div>
  </DialogContent></Dialog>
}
