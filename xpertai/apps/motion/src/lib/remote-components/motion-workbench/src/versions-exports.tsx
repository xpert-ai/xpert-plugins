import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@xpert-ai/plugin-shadcn-ui'
import type { ExportSummary, ProjectSummary, VersionSummary } from './motion-types'
import type { Translator } from './i18n'
import { Button, h } from './ui'

export function VersionsDialog(props: {
  open: boolean
  versions: VersionSummary[]
  currentId?: string | null
  saving: boolean
  t: Translator
  onOpenChange: (open: boolean) => void
  onCreateVersion: () => Promise<void>
  onRestore: (versionId: string) => Promise<void>
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="motion-history-dialog">
        <DialogHeader>
          <DialogTitle>{props.t('versionHistory')}</DialogTitle>
          <DialogDescription>{props.t('versionHistoryDescription')}</DialogDescription>
        </DialogHeader>
        <div className="history-dialog-actions">
          <Button onClick={() => void props.onCreateVersion()} disabled={props.saving}>
            {props.t('saveCurrentVersion')}
          </Button>
        </div>
        <div className="history-dialog-body">
          <VersionsTab versions={props.versions} currentId={props.currentId} t={props.t} onRestore={props.onRestore} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ExportsDialog(props: {
  open: boolean
  exports: ExportSummary[]
  selectedProject: ProjectSummary | null
  t: Translator
  onOpenChange: (open: boolean) => void
  onReviewed: () => void
  onDraft: () => void
  onArchive: () => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="motion-history-dialog">
        <DialogHeader>
          <DialogTitle>{props.t('exportHistory')}</DialogTitle>
          <DialogDescription>{props.t('exportHistoryDescription')}</DialogDescription>
        </DialogHeader>
        <div className="history-dialog-body">
          <ExportsTab
            exports={props.exports}
            selectedProject={props.selectedProject}
            t={props.t}
            onReviewed={props.onReviewed}
            onDraft={props.onDraft}
            onArchive={props.onArchive}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {props.t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VersionsTab(props: { versions: VersionSummary[]; currentId?: string | null; t: Translator; onRestore: (versionId: string) => Promise<void> }) {
  return (
    <section className="motion-list wide">
      {props.versions.map((version) => (
        <article key={version.id} className={`motion-record ${version.id === props.currentId ? 'active' : ''}`}>
          <div>
            <strong>{props.t('versionLabel', { number: version.versionNumber || 0 })}</strong>
            <span>{version.changeSummary || version.sourceType || props.t('motionVersion')}</span>
          </div>
          <Button variant="secondary" onClick={() => void props.onRestore(version.id)}>
            {props.t('restore')}
          </Button>
        </article>
      ))}
      {props.versions.length === 0 ? <div className="motion-empty">{props.t('noVersions')}</div> : null}
    </section>
  )
}

export function ExportsTab(props: {
  exports: ExportSummary[]
  selectedProject: ProjectSummary | null
  t: Translator
  onReviewed: () => void
  onDraft: () => void
  onArchive: () => void
}) {
  return (
    <section className="motion-list wide">
      <div className="motion-toolbar">
        <Button variant="secondary" onClick={props.onReviewed} disabled={!props.selectedProject}>
          {props.t('reviewed')}
        </Button>
        <Button variant="outline" onClick={props.onDraft} disabled={!props.selectedProject}>
          {props.t('draft')}
        </Button>
        <Button variant="outline" onClick={props.onArchive} disabled={!props.selectedProject}>
          {props.t('archive')}
        </Button>
      </div>
      {props.exports.map((item) => (
        <article key={item.id} className="motion-record">
          <div>
            <strong>{String(item.kind || props.t('artifact')).toUpperCase()}</strong>
            <span>{item.filePath || item.fileUrl || item.checksum || item.id}</span>
          </div>
          {item.fileUrl ? (
            <Button asChild variant="secondary">
              <a href={item.fileUrl} target="_blank" rel="noreferrer">
                {props.t('open')}
              </a>
            </Button>
          ) : null}
        </article>
      ))}
      {props.exports.length === 0 ? <div className="motion-empty">{props.t('noExports')}</div> : null}
    </section>
  )
}
