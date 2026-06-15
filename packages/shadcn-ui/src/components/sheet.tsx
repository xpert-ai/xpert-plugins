import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../utils.js'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetPortal = DialogPrimitive.Portal
export const SheetClose = DialogPrimitive.Close

export type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showClose?: boolean
}

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) =>
  React.createElement(DialogPrimitive.Overlay, {
    ref,
    className: cn('xps-dialog-overlay', className),
    ...props
  })
)
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ className, children, side = 'right', showClose = true, ...props }, ref) =>
    React.createElement(
      SheetPortal,
      null,
      React.createElement(SheetOverlay, null),
      React.createElement(
        DialogPrimitive.Content,
        {
          ref,
          className: cn('xps-sheet-content', `xps-sheet-content--${side}`, className),
          ...props
        },
        children,
        showClose
          ? React.createElement(
              DialogPrimitive.Close,
              {
                className: 'xps-dialog-close'
              },
              React.createElement(X, {
                className: 'xps-icon',
                'aria-hidden': 'true'
              }),
              React.createElement('span', { className: 'xps-sr-only' }, 'Close')
            )
          : null
      )
    )
)
SheetContent.displayName = DialogPrimitive.Content.displayName

export const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-dialog-header', className),
      ...props
    })
)
SheetHeader.displayName = 'SheetHeader'

export const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-dialog-footer', className),
      ...props
    })
)
SheetFooter.displayName = 'SheetFooter'

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) =>
  React.createElement(DialogPrimitive.Title, {
    ref,
    className: cn('xps-dialog-title', className),
    ...props
  })
)
SheetTitle.displayName = DialogPrimitive.Title.displayName

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) =>
  React.createElement(DialogPrimitive.Description, {
    ref,
    className: cn('xps-dialog-description', className),
    ...props
  })
)
SheetDescription.displayName = DialogPrimitive.Description.displayName
