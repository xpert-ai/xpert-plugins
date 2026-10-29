import React, { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Checkbox } from '@xpert-ai/plugin-shadcn-ui'
import { action, openArtifactUrl, copyArtifactUrl } from './bridge'
import { t, useLocale, useMessage } from './i18n'
import { artifactTypeSchema, artifactTypeName, errorText } from './model'

const linkSchema = z.object({ publicUrl: z.string().url(), status: z.string(), accessMode: z.string(),
  artifactVersionId: z.string().nullable().optional(), expiresAt: z.string().nullable().optional() })
export const referenceSchema = z.object({ id: z.string(), title: z.string(), revision: z.number(), url: z.string().url(),
  type: artifactTypeSchema.optional(),
  versionId: z.string(), canManage: z.boolean(), versions: z.array(z.object({ id: z.string(), number: z.number(), title: z.string() })),
  sharing: z.object({ accessModes: z.array(z.enum(['organization_all', 'public_link'])), maxDays: z.number(), link: linkSchema.nullable() }).nullable() })
export async function openArtifactReference(referenceId: string) {
  const reference = referenceSchema.parse(await action('artifact.reference.open', { referenceId }))
  return openArtifactUrl(reference.url, reference.title)
}

export function ArtifactReferenceDialog({ referenceId, onClose, onChanged }: {
  referenceId: string; onClose: () => void; onChanged: () => Promise<void>
}) {
  useLocale()
  const [item, setItem] = useState<z.infer<typeof referenceSchema> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useMessage(''), [copied, setCopied] = useState(false)
  const [version, setVersion] = useState(''), [audience, setAudience] = useState<'organization_all' | 'public_link'>('organization_all')
  const [days, setDays] = useState('7'), [ack, setAck] = useState(false), [confirmRevoke, setConfirmRevoke] = useState(false)
  async function refresh() {
    const value = referenceSchema.parse(await action('artifact.reference.open', { referenceId }))
    setItem(value); setVersion(value.versionId)
    if (value.sharing && Number(days) > value.sharing.maxDays) setDays(String([30, 7, 1].find(d => d <= value.sharing!.maxDays) ?? 1))
    if (value.sharing && !value.sharing.accessModes.includes(audience)) setAudience(value.sharing.accessModes[0] ?? 'organization_all')
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setCopied(false)
    try { await work() } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  useEffect(() => { void run(refresh) }, [referenceId])
  const link = item?.sharing?.link
  const activeLink = link?.status === 'active' && (!link.expiresAt || Date.parse(link.expiresAt) > Date.now()) ? link : null
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{t('artifact.manage')}</DialogTitle><DialogDescription>{t('artifact.referenceNotice')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}
    {!item ? <p role="status">{t('materials.loading')}</p> : <div className="space-y-4">
      <div><Button variant="link" onClick={() => void run(() => openArtifactUrl(item.url, item.title).then(() => undefined))}>{item.title}</Button>
        <p className="text-sm text-muted-foreground">{t('artifact.typeDescription', { type: artifactTypeName(item.type) })}</p></div>
      <Label htmlFor="artifact-version">{t('artifact.version')}</Label>
      <Select value={version} onValueChange={setVersion} disabled={busy || !item.canManage}><SelectTrigger id="artifact-version"><SelectValue /></SelectTrigger><SelectContent>
        {item.versions.map(v => <SelectItem key={v.id} value={v.id}>{t('common.version', { version: v.number })} · {v.title}</SelectItem>)}
      </SelectContent></Select>
      {version !== item.versionId && <Button disabled={busy} onClick={() => void run(async () => {
        await action('artifact.reference.version', { referenceId, versionId: version, expectedRevision: item.revision }); await refresh(); await onChanged()
      })}>{t('artifact.useVersion')}</Button>}
      {item.sharing && <>
        {activeLink ? <>
          <Label htmlFor="artifact-link">{t('artifact.existingLink')}</Label><Input id="artifact-link" value={activeLink.publicUrl} readOnly />
          <p>{t(activeLink.accessMode === 'public_link' ? 'artifact.public' : 'artifact.organization')}</p>
          {activeLink.artifactVersionId !== item.versionId && <p>{t('artifact.linkVersionNotice')}</p>}
          <Button disabled={busy} onClick={() => void run(async () => { await copyArtifactUrl(activeLink.publicUrl); setCopied(true) })}>{t(copied ? 'artifact.copied' : 'artifact.copyLink')}</Button>
          <Button variant="destructive" disabled={busy} onClick={() => setConfirmRevoke(true)}>{t('artifact.revoke')}</Button>
          {confirmRevoke && <div className="space-y-2"><p>{t('artifact.revokeNotice')}</p><Button variant="destructive" disabled={busy} onClick={() => void run(async () => {
            await action('artifact.reference.revoke', { referenceId }); setConfirmRevoke(false); await refresh()
          })}>{t('artifact.confirmRevoke')}</Button><Button variant="outline" onClick={() => setConfirmRevoke(false)}>{t('common.cancel')}</Button></div>}
        </> : <>
          <Label htmlFor="artifact-audience">{t('artifact.audience')}</Label><Select value={audience} onValueChange={v => setAudience(z.enum(['organization_all', 'public_link']).parse(v))}>
            <SelectTrigger id="artifact-audience"><SelectValue /></SelectTrigger><SelectContent>{item.sharing.accessModes.map(mode => <SelectItem value={mode} key={mode}>{t(mode === 'public_link' ? 'artifact.public' : 'artifact.organization')}</SelectItem>)}</SelectContent>
          </Select>
          <Label htmlFor="artifact-days">{t('artifact.expiry')}</Label><Select value={days} onValueChange={setDays}><SelectTrigger id="artifact-days"><SelectValue /></SelectTrigger><SelectContent>
            {[1, 7, 30].filter(d => d <= item.sharing!.maxDays).map(d => <SelectItem key={d} value={String(d)}>{t('artifact.days', { count: d })}</SelectItem>)}
          </SelectContent></Select>
          {audience === 'public_link' && <Label className="flex items-start gap-2"><Checkbox checked={ack} onCheckedChange={value => setAck(value === true)} />{t('artifact.publicNotice')}</Label>}
          <Button disabled={busy || !item.sharing.accessModes.length || Number(days) > item.sharing.maxDays || (audience === 'public_link' && !ack)} onClick={() => void run(async () => {
            await action('artifact.reference.share', { referenceId, accessMode: audience, days: Number(days), acknowledgePublic: ack }); await refresh()
          })}>{t('artifact.createLink')}</Button>
        </>}
      </>}
    </div>}
    <DialogFooter><Button variant="outline" onClick={onClose}>{t('common.close')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
