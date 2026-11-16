import { Button, Input, Textarea, Label } from '@xpert-ai/plugin-shadcn-ui'
import { Bold, Italic, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react'
import type { PptxShape } from '../src/core/pptx-types'
import { t } from './i18n'

export function Properties({ shape, onChange, onClose, onLayer, onDelete }: {
  shape?: PptxShape; onChange(patch: Partial<PptxShape>): void; onClose(): void;
  onLayer(direction: 'forward' | 'backward'): void; onDelete(): void
}) {
  return <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l bg-background" aria-label={t('ppt.properties')}>
    <div className="flex items-center justify-between border-b p-3"><span>{t('ppt.properties')}</span><Button variant="ghost" size="icon" aria-label={t('ppt.close')} onClick={onClose}><X/></Button></div>
    {!shape ? <p className="p-4 text-sm text-muted-foreground">{t('ppt.selection')}</p> : <div className="space-y-4 p-4">
      {shape.kind === 'shape' && <><Label htmlFor="object-text">{t('ppt.textContent')}</Label><Textarea id="object-text" value={shape.text} onChange={e => onChange({text:e.target.value})}/>
        <Label htmlFor="object-font">{t('ppt.fontFamily')}</Label><Input id="object-font" value={shape.fontFamily ?? ''} onChange={e => onChange({fontFamily:e.target.value,formatDirty:true})}/>
        <Label htmlFor="object-size">{t('ppt.fontSize')}</Label><Input id="object-size" type="number" min={1} max={400} value={shape.fontSizePt} onChange={e => { if (e.target.value) onChange({fontSizePt:Math.max(1,Math.min(400,Number(e.target.value))),formatDirty:true}) }}/>
        <div className="flex gap-2"><Button variant={shape.bold ? 'secondary':'outline'} size="icon" aria-label={t('ppt.bold')} aria-pressed={shape.bold} onClick={() => onChange({bold:!shape.bold,formatDirty:true})}><Bold/></Button>
          <Button variant={shape.italic ? 'secondary':'outline'} size="icon" aria-label={t('ppt.italic')} aria-pressed={shape.italic} onClick={() => onChange({italic:!shape.italic,formatDirty:true})}><Italic/></Button></div>
        <Label htmlFor="object-color">{t('ppt.textColor')}</Label><Input id="object-color" type="color" value={shape.textColor} onChange={e => onChange({textColor:e.target.value,formatDirty:true})}/></>}
      {shape.kind === 'table' && shape.table && shape.table.rows.map((row,i) => row.map((cell,j) => !cell.merged && <Input key={`${i}:${j}`} aria-label={t('ppt.tableCell',{row:i+1,column:j+1})} value={cell.text} onChange={e => { const table=structuredClone(shape.table!); table.rows[i][j].text=e.target.value; onChange({table,tableDirty:true}) }}/>))}
      <Label htmlFor="object-rotation">{t('ppt.rotation')}</Label><Input id="object-rotation" type="number" value={shape.rotation} onChange={e => onChange({rotation:Number(e.target.value) || 0})}/>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" title={t('ppt.bringForward')} aria-label={t('ppt.bringForward')} onClick={() => onLayer('forward')}><ArrowUp/></Button>
        <Button variant="outline" size="icon" title={t('ppt.sendBackward')} aria-label={t('ppt.sendBackward')} onClick={() => onLayer('backward')}><ArrowDown/></Button>
        <Button variant="destructive" size="icon" title={t('ppt.deleteObject')} aria-label={t('ppt.deleteObject')} onClick={onDelete}><Trash2/></Button></div>
    </div>}
  </aside>
}
