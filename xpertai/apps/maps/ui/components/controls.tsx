import { forwardRef, type ComponentProps } from 'react'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
/** React 18 ref boundary for the shared Button, whose public implementation uses Slot. */
export const ActionButton = forwardRef<HTMLButtonElement, Omit<ComponentProps<typeof Button>, 'asChild'>>(function ActionButton({ children, ...props }, ref) {
  return <Button {...props} asChild><button ref={ref} type={props.type ?? 'button'}>{children}</button></Button>
})
