import * as React from 'react'
import { Button as ShadcnButton, type ButtonProps } from '@xpert-ai/plugin-shadcn-ui/components/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/plugin-shadcn-ui/components/select'
import { Slider } from '@xpert-ai/plugin-shadcn-ui/components/slider'

export const h: typeof React.createElement = React.createElement

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ size = 'sm', ...props }, ref) => <ShadcnButton ref={ref} size={size} {...props} />)
Button.displayName = 'MotionButton'

export function MotionSelect(props: {
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onValueChange: (value: string) => void
  className?: string
}) {
  return (
    <Select value={props.value} onValueChange={props.onValueChange}>
      <SelectTrigger className={props.className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MotionSlider(props: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  className?: string
}) {
  const value = clampNumber(props.value, props.min, props.max)
  return (
    <Slider
      className={props.className}
      min={props.min}
      max={props.max}
      step={props.step}
      value={[value]}
      onValueChange={(values) => {
        const next = values[0]
        if (typeof next === 'number') {
          props.onChange(next)
        }
      }}
    />
  )
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

