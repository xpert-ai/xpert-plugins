import { t, useLocale, i18n, useMessage } from './i18n'
import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Input, Label, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, FileText, Upload, Search, Info } from '@xpert-ai/plugin-shadcn-ui'
import { action, upload } from './bridge'
import { FolderSelect } from './create-dialog'
import { type Item, errorText } from './model'
const artifactsSchema = z.object({ items: z.array(z.object({
  id: z.string(), title: z.string().nullable().optional(), versions: z.array(z.object({ id: z.string(), version: z.number().optional(), fileName: z.string().nullable().optional() }))
})), total: z.number() })
export function MaterialsDialog({ root, items, parentId, editors, onClose, onDone, run, busy }: {
  root: Item; items: Item[]; parentId: string; editors: Array<{ key: string; title: string }>;
  onClose: () => void; onDone: () => Promise<void>; run: (work: () => Promise<void>) => Promise<void>; busy: boolean
}) {
  useLocale()
  const fileInput = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState('local'), [parent, setParent] = useState(parentId)
  const [files, setFiles] = useState<File[]>([]), [editor, setEditor] = useState('')
  const [artifacts, setArtifacts] = useState<z.infer<typeof artifactsSchema>['items']>([])
  const [mode, setMode] = useState<'reference' | 'copy'>('reference')
  const [copyAcknowledged, setCopyAcknowledged] = useState(false)
  const [chosen, setChosen] = useState<Record<string, string>>({}), [search, setSearch] = useState('')
  const [error, setError] = useMessage(''), [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (tab !== 'artifacts') return
    let alive = true
    setLoading(true); setError('')
    void action('artifact.list', { page }).then((raw) => {
      const result = artifactsSchema.parse(raw)
      if (alive) { setArtifacts(result.items); setTotal(result.total) }
    }).catch((error) => alive && setError(errorText(error))).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [tab, page])
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="space-dialog materials-dialog">
    <DialogHeader><DialogTitle>{t('materials.title')}</DialogTitle><DialogDescription>{t('materials.description')}</DialogDescription></DialogHeader>
    <Tabs value={tab} onValueChange={setTab}><TabsList aria-label={t('materials.source')}><TabsTrigger value="local">{t('materials.local')}</TabsTrigger><TabsTrigger value="artifacts">{t('materials.assistantArtifacts')}</TabsTrigger></TabsList>
    <TabsContent value="local"><div className="upload-area"><Upload /><strong>{t('materials.chooseFiles')}</strong><span>{t('materials.fileLimit')}</span><Button variant="outline" type="button" onClick={() => fileInput.current?.click()}>{t('materials.chooseFiles')}</Button><Input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></div>
      {files.map((file) => <p key={file.name}>{file.name} <span className="muted">{t('materials.fileSize', { size: i18n.number(Math.ceil(file.size / 1024)) })}</span></p>)}
      {editors.length > 0 && <div className="form-field"><Label htmlFor="import-editor">{t('materials.editor')}</Label><Select value={editor || 'original'} onValueChange={(value) => setEditor(value === 'original' ? '' : value)}><SelectTrigger id="import-editor" className="w-full"><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectItem value="original">{t('materials.keepOriginal')}</SelectItem>{editors.map((entry) => <SelectItem key={entry.key} value={entry.key}>{t('materials.importWith', { editor: entry.title })}</SelectItem>)}</SelectContent></Select></div>}
    </TabsContent><TabsContent value="artifacts"><div className="search-field"><Search /><Input aria-label={t('materials.search')} placeholder={t('materials.search')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {error && <p role="alert">{error}</p>}{loading && <p role="status">{t('materials.loading')}</p>}<div className="artifact-list">{artifacts.filter((item) => (item.title ?? '').toLowerCase().includes(search.toLowerCase())).map((item) => <div className={`artifact-option ${chosen[item.id] ? 'checked' : ''}`} key={item.id}>
        <Checkbox aria-label={t('materials.chooseArtifact', { title: item.title ?? t('materials.untitled') })} disabled={!item.versions.length} checked={!!chosen[item.id]} onCheckedChange={(checked) => setChosen((current) => {
          const next = { ...current }; if (checked === true) next[item.id] = item.versions[0].id; else delete next[item.id]; return next
        })} /><FileText /><span><strong>{item.title ?? t('materials.untitled')}</strong><small>{item.versions[0]?.fileName ?? t('materials.noFileVersion')}</small></span>
        <Select disabled={!item.versions.length} value={chosen[item.id] ?? item.versions[0]?.id ?? ''} onValueChange={(value) => setChosen((current) => ({ ...current, [item.id]: value }))}>
          <SelectTrigger aria-label={t('materials.artifactVersion', { title: item.title ?? t('materials.untitled') })}><SelectValue placeholder={t('materials.noVersion')} /></SelectTrigger><SelectContent position="popper">{item.versions.map((version, i) => <SelectItem key={version.id} value={version.id}>{t('common.version', { version: version.version ?? item.versions.length - i })}</SelectItem>)}</SelectContent></Select>
      </div>)}{!loading && !error && !artifacts.length && <p className="empty-message">{t('materials.empty')}</p>}</div>
      {total > 40 && <div className="row"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('common.previousPage')}</Button><span>{t('common.pageNumber', { page })}</span><Button variant="outline" disabled={page * 40 >= total} onClick={() => setPage(page + 1)}>{t('common.nextPage')}</Button></div>}
      <Label htmlFor="artifact-collect-mode">{t('artifact.collectMode')}</Label>
      <Select value={mode} onValueChange={v => { setMode(z.enum(['reference', 'copy']).parse(v)); setCopyAcknowledged(false) }}><SelectTrigger id="artifact-collect-mode"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="reference">{t('artifact.addReference')}</SelectItem><SelectItem value="copy">{t('artifact.copyProject')}</SelectItem>
      </SelectContent></Select>
      <p className="muted inline-note"><Info />{t(mode === 'reference' ? 'artifact.referenceNotice' : 'artifact.copyNotice')}</p>
      {mode === 'copy' && <Label className="flex items-start gap-2"><Checkbox checked={copyAcknowledged} onCheckedChange={value => setCopyAcknowledged(value === true)} />{t('artifact.copyAcknowledge')}</Label>}</TabsContent></Tabs>
    <FolderSelect items={items} value={parent} onChange={setParent} />
    <DialogFooter><span className="muted mr-auto">{t('materials.selected', { count: tab === 'local' ? files.length : Object.keys(chosen).length })}</span><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy || (tab === 'artifacts' && mode === 'copy' && !copyAcknowledged) || !(tab === 'local' ? files.length : Object.keys(chosen).length)} onClick={() => void run(async () => {
      if (tab === 'local') for (const file of files) await upload({ spaceId: root.id, parentId: parent || null, ...(editor ? { editorKey: editor } : {}) }, file, editor ? 'editor.import' : 'file.upload')
      else for (const [artifactId, versionId] of Object.entries(chosen)) await action('artifact.collect', { spaceId: root.id, parentId: parent || null, artifactId, versionId, mode, acknowledgeCopy: copyAcknowledged })
      await onDone(); onClose()
    })}>{t('materials.add')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
