import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/plugin-shadcn-ui'

export function Choice({ id, label, value, onChange, options, disabled = false }: {
  id?: string; label: string; value: string; onChange: (value: string) => void
  options: Array<{ value: string; label: string }>; disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  )
}
