import * as React from 'react'
import {
  Button as ShadcnButton,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  Textarea,
} from '@xpert-ai/plugin-shadcn-ui'

export { Textarea, Table }

type StudioButtonProps = React.ComponentProps<typeof ShadcnButton>

/** Secondary actions are outlined by default; primary actions opt in explicitly. */
export function Button({ variant = 'outline', size = 'sm', ...props }: StudioButtonProps) {
  return <ShadcnButton variant={variant} size={size} {...props} />
}

type InputChange = (event: { target: { value: string; checked: boolean } }) => void

/** Input facade that keeps the existing remote-view event contract while using shadcn primitives. */
export function ControlInput({ onChange, ...props }: React.ComponentProps<'input'> & { onChange?: InputChange }) {
  if (props.type === 'checkbox') {
    const checkboxProps = {
      className: props.className,
      disabled: props.disabled,
      id: props.id,
      name: props.name,
      required: props.required,
      tabIndex: props.tabIndex,
      'aria-label': props['aria-label'],
      'aria-describedby': props['aria-describedby'],
    }
    return (
      <Checkbox
        {...checkboxProps}
        checked={Boolean(props.checked)}
        onCheckedChange={(checked) => onChange?.({ target: { value: '', checked: checked === true } })}
      />
    )
  }
  return <Input {...props} onChange={onChange as React.ChangeEventHandler<HTMLInputElement> | undefined} />
}

type SelectFieldProps = Omit<React.ComponentProps<'select'>, 'onChange' | 'children'> & {
  onChange?: InputChange
  children?: React.ReactNode
}

export function SelectOption(_props: { value?: string | number; children?: React.ReactNode }) {
  return null
}

/** Select facade converting option data to the shadcn/Radix Select surface. */
export function SelectField({ value, defaultValue, onChange, children, ...props }: SelectFieldProps) {
  const options = React.Children.toArray(children).filter(
    (child): child is React.ReactElement<{ value?: string | number; children?: React.ReactNode }> =>
      React.isValidElement(child) && child.type === SelectOption
  )
  // The trigger label renders explicitly: Radix SelectValue leaves the trigger
  // blank until the dropdown content has mounted at least once.
  const normalized = (v: string | number | undefined) => (v === '' || v === undefined ? '__empty' : String(v))
  const isEmpty = value === '' || value === undefined
  const emptyOption = options.find((option) => normalized(option.props.value) === '__empty')
  const selectedOption = options.find((option) => normalized(option.props.value) === normalized(value))
  const displayText = (isEmpty ? emptyOption?.props.children : selectedOption?.props.children) ?? ''
  return (
    <Select
      value={normalized(value)}
      defaultValue={defaultValue === undefined ? undefined : normalized(defaultValue)}
      disabled={props.disabled}
      onValueChange={(next) => onChange?.({ target: { value: next === '__empty' ? '' : next, checked: false } })}
    >
      <SelectTrigger className={props.className} aria-label={props['aria-label']}>
        <span
          style={{
            display: 'inline-block',
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
            fontSize: 12,
            color: isEmpty ? 'var(--muted-foreground, #71717a)' : 'inherit',
            background: 'rgba(255,0,0,.25)',
            minHeight: 14,
          }}
        >
          {displayText}
        </span>
        <SelectValue placeholder={typeof displayText === 'string' ? displayText : undefined} style={{ display: 'none' }} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option, index) => {
          const optionValue = normalized(option.props.value)
          return (
            <SelectItem key={`${optionValue}-${index}`} value={optionValue}>
              {option.props.children}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

export function DialogSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="studio-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
