import * as React from 'react'
import { cn } from '../utils.js'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  React.createElement('input', {
    ref,
    type,
    className: cn('xps-input', className),
    ...props
  })
))
Input.displayName = 'Input'
