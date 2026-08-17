import * as React from 'react'
import { Archive, FileJson } from 'lucide-react'
import { TabsContent } from '@xpert-ai/plugin-shadcn-ui'
import type { Translate, OfficeSpreadsheetHandle } from '../presentation'
import type { WorkbenchData } from '../view-data'
import { EmptyState } from './ui-helpers'
import { OfficeSpreadsheetHost } from './office-spreadsheet-host'

export function QuotationPanel({ t, detail, snapshotId, locale, editorRef, onDirty, onContextChange }: {
  t: Translate
  detail: WorkbenchData['detail']
  snapshotId: string
  locale: unknown
  editorRef: React.RefObject<OfficeSpreadsheetHandle>
  onDirty: () => void
  onContextChange: () => void
}) {
  const quotation = detail?.quotation
  const snapshot = detail?.officeDocument?.currentSnapshot?.snapshot
  return <TabsContent value="quotation" className="col-start-2 row-start-2 m-3 min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm data-[state=active]:grid max-[1100px]:col-start-1 max-[1100px]:row-start-3 max-[1100px]:m-2">
    {!quotation ? <EmptyState icon={<FileJson aria-hidden className="size-7"/>} title={t('noQuotation')}/> : <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-card">
      {snapshot ? <OfficeSpreadsheetHost
        ref={editorRef}
        key={`${quotation.id}:${snapshotId}`}
        documentKey={`${quotation.id}:${snapshotId}`}
        snapshot={snapshot}
        locale={locale}
        onDirty={onDirty}
        onContextChange={onContextChange}
      /> : <EmptyState icon={<FileJson aria-hidden className="size-7"/>} title={t('editorUnavailable')}/>}
      <footer className="flex min-h-9 items-center gap-2 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
        <Archive aria-hidden className="size-3.5"/><span>{t('workbookOwner')}</span><strong className="min-w-0 truncate text-foreground">{detail?.officeFile?.fileName}</strong>
      </footer>
    </section>}
  </TabsContent>
}
