import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../utils.js'

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) =>
  React.createElement(
    SliderPrimitive.Root,
    {
      ref,
      className: cn('xps-slider', className),
      ...props
    },
    React.createElement(SliderPrimitive.Track, { className: 'xps-slider-track' }, React.createElement(SliderPrimitive.Range, { className: 'xps-slider-range' })),
    React.createElement(SliderPrimitive.Thumb, { className: 'xps-slider-thumb' })
  )
)
Slider.displayName = SliderPrimitive.Root.displayName
