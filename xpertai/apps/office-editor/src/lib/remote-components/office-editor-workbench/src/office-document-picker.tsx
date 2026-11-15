import React, { createElement as h } from 'react'
import {
  Badge, Button, Check, Plus, FileText, Files, Table2, PopoverTitle, ScrollArea,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Tooltip, TooltipTrigger, TooltipContent
} from '@xpert-ai/plugin-shadcn-ui'
import type { OfficeKind } from './office-header'

type Props = {
  items: { id: string; title?: string; documentType?: OfficeKind }[];
  selectedId: string; filter: OfficeKind | 'all'; busy: boolean;
  types: { value: OfficeKind; label: string }[];
  labels: { title: string; allTypes: string; new: string; untitled: string; empty: string };
  onFilter(value: OfficeKind | 'all'): void; onCreate(kind: OfficeKind): void; onSelect(id: string): void;
}

export function OfficeDocumentPicker(p: Props) {
  return <div className="oe-document-panel">
    <div className="oe-card-heading">
      <div className="oe-document-heading"><PopoverTitle>{p.labels.title}</PopoverTitle><Badge variant="secondary">{p.items.length}</Badge></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={p.busy}><Plus />{p.labels.new}</Button></DropdownMenuTrigger>
        <DropdownMenuContent className="oe-floating-menu" align="end">{p.types.map(type => <DropdownMenuItem key={type.value} onSelect={() => p.onCreate(type.value)}>{type.label}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
    </div>
    <Select value={p.filter} onValueChange={value => p.onFilter(value as OfficeKind | 'all')}>
      <SelectTrigger className="oe-filter-trigger" aria-label={p.labels.allTypes}><SelectValue /></SelectTrigger>
      <SelectContent className="oe-floating-menu"><SelectItem value="all">{p.labels.allTypes}</SelectItem>{p.types.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
    </Select>
    <ScrollArea className="oe-document-scroll">
      {p.items.length ? <ul className="oe-document-options" aria-label={p.labels.title}>
        {p.items.map(item => {
          const Icon = item.documentType === 'document' ? FileText : item.documentType === 'spreadsheet' ? Table2 : Files
          return <li key={item.id}><Tooltip><TooltipTrigger asChild>
            <Button type="button" className="oe-document-option" variant={item.id === p.selectedId ? 'secondary' : 'ghost'}
              disabled={p.busy} aria-current={item.id === p.selectedId ? 'page' : undefined} onClick={() => p.onSelect(item.id)}>
              <Icon aria-hidden="true" /><span className="oe-document-name">{item.title || p.labels.untitled}</span>{item.id === p.selectedId ? <Check aria-hidden="true" /> : null}
            </Button>
          </TooltipTrigger><TooltipContent className="oe-document-tooltip">{item.title || p.labels.untitled}</TooltipContent></Tooltip></li>
        })}
      </ul> : <p className="oe-list-empty" role="status">{p.labels.empty}</p>}
    </ScrollArea>
  </div>
}
