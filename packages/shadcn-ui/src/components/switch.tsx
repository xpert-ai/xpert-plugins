import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../utils.js'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) =>
  React.createElement(
    SwitchPrimitive.Root,
    {
      ref,
      className: cn('xps-switch', className),
      ...props
    },
    React.createElement(SwitchPrimitive.Thumb, {
      className: 'xps-switch-thumb'
    })
  )
)
Switch.displayName = SwitchPrimitive.Root.displayName
