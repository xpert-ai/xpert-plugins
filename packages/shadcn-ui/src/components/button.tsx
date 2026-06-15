import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '../utils.js'

export const buttonVariants = cva('xps-button', {
  variants: {
    variant: {
      default: 'xps-button--default',
      secondary: 'xps-button--secondary',
      outline: 'xps-button--outline',
      ghost: 'xps-button--ghost',
      destructive: 'xps-button--destructive',
      destructiveOutline: 'xps-button--destructive-outline'
    },
    size: {
      default: '',
      sm: 'xps-button--sm',
      lg: 'xps-button--lg',
      icon: 'xps-button--icon'
    }
  },
  defaultVariants: {
    variant: 'default',
    size: 'default'
  }
})

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = (asChild ? Slot : 'button') as React.ElementType
    const elementProps: Record<string, unknown> = {
      className: cn(buttonVariants({ variant, size }), className),
      ref,
      ...props
    }
    if (!asChild) {
      elementProps.type = type ?? 'button'
    }
    return React.createElement(Comp, elementProps)
  }
)
Button.displayName = 'Button'
