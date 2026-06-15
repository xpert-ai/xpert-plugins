import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '../utils.js'

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) =>
  React.createElement(
    CheckboxPrimitive.Root,
    {
      ref,
      className: cn('xps-checkbox', className),
      ...props
    },
    React.createElement(
      CheckboxPrimitive.Indicator,
      {
        className: 'xps-checkbox-indicator'
      },
      React.createElement(Check, { className: 'xps-icon' })
    )
  )
)
Checkbox.displayName = CheckboxPrimitive.Root.displayName
