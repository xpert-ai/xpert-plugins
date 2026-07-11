import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '../utils.js'

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) =>
  React.createElement(AvatarPrimitive.Root, { ref, className: cn('xps-avatar', className), ...props })
)
Avatar.displayName = AvatarPrimitive.Root.displayName

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) =>
  React.createElement(AvatarPrimitive.Image, { ref, className: cn('xps-avatar-image', className), ...props })
)
AvatarImage.displayName = AvatarPrimitive.Image.displayName

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) =>
  React.createElement(AvatarPrimitive.Fallback, { ref, className: cn('xps-avatar-fallback', className), ...props })
)
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName
