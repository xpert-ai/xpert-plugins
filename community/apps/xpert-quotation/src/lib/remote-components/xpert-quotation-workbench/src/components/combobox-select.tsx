import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn
} from '@xpert-ai/plugin-shadcn-ui'

export type ComboboxSelectOption = {
  value: string
  label: string
  keywords?: string
}

export function ComboboxSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  ariaLabel,
  disabled,
  className,
  onValueChange
}: {
  value: string
  options: ComboboxSelectOption[]
  placeholder: string
  searchPlaceholder: string
  emptyText: string
  ariaLabel: string
  disabled?: boolean
  className?: string
  onValueChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        className={cn('min-w-0 cursor-pointer justify-between bg-background font-normal', className)}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50"/>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
      <Command>
        <CommandInput aria-label={searchPlaceholder} placeholder={searchPlaceholder}/>
        <CommandList>
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup>
            {options.map((option) => <CommandItem
              key={option.value}
              value={`${option.label} ${option.keywords ?? ''}`}
              className="cursor-pointer"
              onSelect={() => {
                onValueChange(option.value)
                setOpen(false)
              }}
            >
              <Check aria-hidden className={cn('size-4', value === option.value ? 'opacity-100' : 'opacity-0')}/>
              <span className="truncate">{option.label}</span>
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
