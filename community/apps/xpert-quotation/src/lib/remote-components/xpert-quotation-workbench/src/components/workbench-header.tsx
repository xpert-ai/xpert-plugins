import * as React from 'react'
import {
  Archive,
  CircleCheckBig,
  CircleDotDashed,
  Database,
  Download,
  FileSpreadsheet,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Upload
} from 'lucide-react'
import {
  Badge,
  Button,
  TabsList,
  TabsTrigger,
  cn
} from '@xpert-ai/plugin-shadcn-ui'
import type { Quotation, WorkbenchData } from '../view-data'
import type { Translate, WorkbenchTab } from '../presentation'
import { ComboboxSelect } from './combobox-select'
import { IconButton, StatusBadge } from './ui-helpers'

type WorkbenchHeaderProps = {
  activeTab: WorkbenchTab
  t: Translate
  quotations: WorkbenchData['quotations']
  quotation?: Quotation
  quotationId: string
  busy: boolean
  dirty: boolean
  knowledgeLoading: boolean
  reviewCount: number
  approvedCount: number
  canApply: boolean
  canUndo: boolean
  onSelectQuotation: (id: string) => void
  onDelete: () => void
  onUpload: (file?: File) => void
  onRecognize: () => void
  onSave: () => void
  onExport: () => void
  onApply: () => void
  onUndo: () => void
  onRefresh: () => void
}

export function WorkbenchHeader(props: WorkbenchHeaderProps) {
  const sourceInput = React.useRef<HTMLInputElement | null>(null)
  const inQuotationFlow = props.activeTab !== 'knowledge'
  return <>
    <aside className="sticky top-0 z-30 row-span-2 flex min-h-0 flex-col border-r border-border bg-card max-[1100px]:row-span-1 max-[1100px]:row-start-1 max-[1100px]:items-stretch max-[1100px]:border-r-0 max-[1100px]:border-b">
      <div className="flex min-h-16 items-center gap-3 border-b border-border px-4 max-[1100px]:min-h-14">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <FileSpreadsheet aria-hidden className="size-5"/>
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-semibold">{props.t('studioTitle')}</strong>
          <span className="block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{props.t('studioSubtitle')}</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2 max-[1100px]:overflow-x-auto max-[1100px]:overflow-y-hidden max-[1100px]:p-1.5">
        <TabsList variant="line" aria-label={props.t('workbenchViews')} className="h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0 max-[1100px]:!w-max max-[1100px]:!flex-row">
          <StudioTab value="quotation" icon={<FileSpreadsheet aria-hidden/>} label={props.t('quotationTab')}/>
          <StudioTab value="review" icon={<CircleDotDashed aria-hidden/>} label={props.t('reviewTab')} count={props.reviewCount}/>
          <StudioTab value="approved" icon={<CircleCheckBig aria-hidden/>} label={props.t('approvedTab')} count={props.approvedCount}/>
          <StudioTab value="knowledge" icon={<Database aria-hidden/>} label={props.t('knowledgeTab')}/>
        </TabsList>
      </nav>

      <div className="border-t border-border p-3 max-[1100px]:hidden">
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
          <span className={cn('size-2 rounded-full', props.dirty ? 'bg-warning' : 'bg-success')}/>
          <span className={cn('truncate text-[11px]', props.dirty ? 'text-warning' : 'text-muted-foreground')}>
            {props.dirty ? props.t('unsaved') : props.t('synced')}
          </span>
        </div>
      </div>
    </aside>

    <header className="col-start-2 row-start-1 flex min-w-0 items-center gap-3 border-b border-border bg-card px-3 py-2 max-[1100px]:col-start-1 max-[1100px]:row-start-2 max-[1100px]:flex-wrap">
      {inQuotationFlow && <div className="flex min-w-0 flex-1 items-center gap-2 max-[1100px]:w-full max-[1100px]:basis-full">
        <ComboboxSelect
          ariaLabel={props.t('source')}
          className="w-full max-w-80"
          value={props.quotationId}
          options={props.quotations.map((item) => ({ value: item.id, label: item.title }))}
          placeholder={props.t('noQuotation')}
          searchPlaceholder={props.t('quotationSearchPlaceholder')}
          emptyText={props.t('noQuotationMatches')}
          disabled={props.busy || props.dirty || props.quotations.length === 0}
          onValueChange={props.onSelectQuotation}
        />
        <IconButton
          label={props.t('deleteQuotation')}
          disabled={props.busy || props.dirty || !props.quotation}
          onClick={props.onDelete}
        >
          <Trash2 aria-hidden className="size-4"/>
        </IconButton>
        <Badge variant="outline" className="hidden gap-1 xl:inline-flex"><Archive aria-hidden className="size-3"/>{props.t('locked')}</Badge>
        {props.quotation && <>
          <span className="hidden shrink-0 text-xs text-muted-foreground 2xl:inline">{props.t('version')} V{props.quotation.officeVersionNumber}</span>
          <StatusBadge status={props.quotation.status} t={props.t}/>
        </>}
        {props.quotation?.totalAmount && <strong className="ml-auto shrink-0 text-sm text-primary">
          {props.t('total')} ¥{props.quotation.totalAmount}
        </strong>}
      </div>}

      <div className={cn('flex min-w-0 items-center justify-end gap-1', !inQuotationFlow && 'ml-auto')}>
      {props.activeTab === 'quotation' && <>
        <input
          ref={sourceInput}
          hidden
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            props.onUpload(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }}
        />
        <Button variant="outline" className="cursor-pointer" title={props.t('sourceFormats')} disabled={props.busy} onClick={() => sourceInput.current?.click()}>
          <Upload aria-hidden className="size-4"/><span className="max-[1280px]:hidden">{props.t('importSource')}</span>
        </Button>
        <Button className="cursor-pointer" disabled={props.busy || props.dirty || !props.quotationId} onClick={props.onRecognize}>
          <Play aria-hidden className="size-4"/><span className="max-[1280px]:hidden">{props.t('recognize')}</span>
        </Button>
        <Button variant="outline" className="cursor-pointer" disabled={props.busy || !props.dirty} onClick={props.onSave}>
          <Save aria-hidden className="size-4"/><span className="max-[1280px]:hidden">{props.t('saveEdits')}</span>
        </Button>
        <Button variant="outline" className="cursor-pointer" disabled={props.busy || props.dirty || !props.quotationId} onClick={props.onExport}>
          <Download aria-hidden className="size-4"/><span className="max-[1280px]:hidden">{props.t('export')}</span>
        </Button>
      </>}
      {(props.activeTab === 'review' || props.activeTab === 'approved') && <Button variant="outline" className="cursor-pointer" disabled={props.busy || !props.canApply} onClick={props.onApply}>
        <Archive aria-hidden className="size-4"/><span className="max-[1280px]:hidden">{props.t('apply')}</span>
      </Button>}
      {inQuotationFlow && <IconButton label={props.t('undo')} disabled={props.busy || props.dirty || !props.canUndo} onClick={props.onUndo}>
        <Undo2 aria-hidden className="size-4"/>
      </IconButton>}
      <IconButton label={props.t('refresh')} disabled={props.activeTab === 'knowledge' ? props.knowledgeLoading : props.busy || props.dirty} onClick={props.onRefresh}>
        <RotateCcw aria-hidden className="size-4"/>
      </IconButton>
      </div>
    </header>
  </>
}

function StudioTab({ value, icon, label, count }: {
  value: WorkbenchTab
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return <TabsTrigger
    value={value}
    className="h-9 flex-none cursor-pointer justify-start gap-2.5 rounded-md px-3 text-xs data-[state=active]:bg-accent data-[state=active]:font-semibold max-[1100px]:!w-auto"
  >
    {icon}<span>{label}</span>{count != null && <Badge variant="outline" className="ml-auto px-1.5 text-[10px] max-[1100px]:ml-1">{count}</Badge>}
  </TabsTrigger>
}
