import * as React from 'react'
import {
  buttonVariants, cn, Command, CommandEmpty, CommandInput, CommandItem, CommandList,
  Popover, PopoverContent, PopoverTrigger, ChevronDown, Button, Trash2
} from '@xpert-ai/plugin-shadcn-ui'

export function DashboardPicker({ items, value, disabled, label, searchLabel, emptyLabel, deleteLabel, onChange, onDelete }: {
  items: { artifactId: string; title?: string | null; canDelete?: boolean }[]
  value: string
  disabled: boolean
  label: string
  searchLabel: string
  emptyLabel: string
  deleteLabel: (title: string) => string
  onDelete: (id: string) => void
  onChange: (id: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const filtered = items.filter(item => `${item.title ?? ''} ${item.artifactId}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const listId = React.useId()
  const selected = items.find(item => item.artifactId === value)
  const title = selected?.title ?? selected?.artifactId ?? label
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setSearch('') }}>
    <PopoverTrigger role="combobox" aria-label={label} aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-haspopup="listbox" disabled={disabled}
        className={cn(buttonVariants({ variant: 'outline' }), 'dashboard-picker justify-between font-normal')} title={title}>
      <span className="truncate">{title}</span><ChevronDown className="shrink-0 opacity-50"/>
    </PopoverTrigger>
    <PopoverContent align="start" className="dashboard-picker-menu p-0">
      <Command shouldFilter={false}>
        <CommandInput value={search} onValueChange={setSearch} aria-label={searchLabel} placeholder={searchLabel}/>
        <CommandList id={listId} aria-label={label}>
          <CommandEmpty>{emptyLabel}</CommandEmpty>
          {filtered.map(item => <div key={item.artifactId} className="flex items-center gap-1">
            <CommandItem value={item.artifactId} className="min-w-0 flex-1" disabled={disabled}
              keywords={[item.title ?? item.artifactId]} data-checked={item.artifactId === value}
              onSelect={() => { setOpen(false); setSearch(''); if (item.artifactId !== value) onChange(item.artifactId) }}>
              <span className="min-w-0 truncate" title={item.title ?? item.artifactId}>{item.title ?? item.artifactId}</span>
            </CommandItem>
            {item.canDelete && <Button variant="ghost" size="icon" disabled={disabled}
              aria-label={deleteLabel(item.title ?? item.artifactId)} title={deleteLabel(item.title ?? item.artifactId)}
              onKeyDown={event => event.stopPropagation()}
              onClick={() => { setOpen(false); setSearch(''); onDelete(item.artifactId) }}><Trash2 aria-hidden="true"/></Button>}
          </div>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
