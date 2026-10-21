import * as React from 'react'
import {
  buttonVariants, cn, Command, CommandEmpty, CommandInput, CommandItem, CommandList,
  Popover, PopoverContent, PopoverTrigger, ChevronDown
} from '@xpert-ai/plugin-shadcn-ui'

export function DashboardPicker({ items, value, disabled, label, searchLabel, emptyLabel, onChange }: {
  items: { artifactId: string; title?: string | null }[]
  value: string
  disabled: boolean
  label: string
  searchLabel: string
  emptyLabel: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()
  const selected = items.find(item => item.artifactId === value)
  const title = selected?.title ?? selected?.artifactId ?? label
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger role="combobox" aria-label={label} aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-haspopup="listbox" disabled={disabled}
        className={cn(buttonVariants({ variant: 'outline' }), 'dashboard-picker justify-between font-normal')} title={title}>
      <span className="truncate">{title}</span><ChevronDown className="shrink-0 opacity-50"/>
    </PopoverTrigger>
    <PopoverContent align="start" className="dashboard-picker-menu p-0">
      <Command>
        <CommandInput aria-label={searchLabel} placeholder={searchLabel}/>
        <CommandList id={listId} aria-label={label}>
          <CommandEmpty>{emptyLabel}</CommandEmpty>
          {items.map(item => <CommandItem key={item.artifactId} value={item.artifactId}
            keywords={[item.title ?? item.artifactId]} data-checked={item.artifactId === value}
            onSelect={() => { setOpen(false); if (item.artifactId !== value) onChange(item.artifactId) }}>
            <span className="min-w-0 truncate" title={item.title ?? item.artifactId}>{item.title ?? item.artifactId}</span>
          </CommandItem>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
