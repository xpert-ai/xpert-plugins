import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/plugin-shadcn-ui'

const h: typeof React.createElement = React.createElement
const EMPTY_VALUE = '__director_empty_value__'

export type DirectorSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export function DirectorSelect(props: {
  ariaLabel: string
  value: string
  options: DirectorSelectOption[]
  onValueChange: (value: string) => void
  className?: string
  contentClassName?: string
  disabled?: boolean
  placeholder?: string
  onFocus?: React.FocusEventHandler<HTMLButtonElement>
}) {
  const value = props.value || EMPTY_VALUE
  return (
    <Select
      value={value}
      disabled={props.disabled}
      onValueChange={(next) =>
        props.onValueChange(next === EMPTY_VALUE ? '' : next)
      }
    >
      <SelectTrigger
        aria-label={props.ariaLabel}
        onFocus={props.onFocus}
        className={`w-full border-studio-line bg-studio-paper text-studio-ink focus-visible:border-studio-brass focus-visible:ring-studio-brass/25 ${props.className ?? ''}`}
      >
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className={`border-studio-line bg-studio-paper text-studio-ink ${props.contentClassName ?? ''}`}
      >
        {props.options.map((option) => (
          <SelectItem
            key={option.value || EMPTY_VALUE}
            value={option.value || EMPTY_VALUE}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
