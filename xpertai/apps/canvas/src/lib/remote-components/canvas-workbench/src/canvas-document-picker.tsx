import React, { createElement as h } from 'react'
import {
  Badge, Button, Check, Plus, Search, PopoverTitle,
  InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, ScrollArea,
  Tooltip, TooltipContent, TooltipTrigger
} from '@xpert-ai/plugin-shadcn-ui'

type Props = {
  documents: { id: string; title?: string }[]; currentId?: string; busy: boolean; search: string;
  labels: { title: string; newCanvas: string; search: string; empty: string; untitled: string };
  onSearchChange(value: string): void; onSearch(): void; onCreate(): void; onSelect(id: string): void;
}

export function CanvasDocumentPicker(p: Props) {
  return <div className="cw-document-panel">
    <div className="cw-card-heading">
      <div className="cw-document-heading"><PopoverTitle>{p.labels.title}</PopoverTitle><Badge variant="secondary">{p.documents.length}</Badge></div>
      <Button type="button" size="sm" variant="ghost" disabled={p.busy} onClick={p.onCreate}><Plus />{p.labels.newCanvas}</Button>
    </div>
    <form className="cw-document-search" onSubmit={event => { event.preventDefault(); if (!p.busy) p.onSearch() }}>
      <InputGroup>
        <InputGroupInput value={p.search} placeholder={p.labels.search} aria-label={p.labels.search}
          onChange={event => p.onSearchChange(event.currentTarget.value)} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit" size="icon-xs" disabled={p.busy} aria-label={p.labels.search}><Search /></InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
    <ScrollArea className="cw-document-scroll">
      {p.documents.length ? <ul className="cw-document-options" aria-label={p.labels.title}>
        {p.documents.map(document => <li key={document.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" className="cw-document-option" variant={document.id === p.currentId ? 'secondary' : 'ghost'}
                disabled={p.busy} aria-current={document.id === p.currentId ? 'page' : undefined} onClick={() => p.onSelect(document.id)}>
                <span className="cw-document-name">{document.title ?? p.labels.untitled}</span>
                {document.id === p.currentId ? <Check aria-hidden="true" /> : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="cw-document-name-tooltip">{document.title ?? p.labels.untitled}</TooltipContent>
          </Tooltip>
        </li>)}
      </ul> : <p className="cw-document-empty" role="status">{p.labels.empty}</p>}
    </ScrollArea>
  </div>
}
