import { Badge, Button, Input } from '@xpert-ai/plugin-shadcn-ui'
import { i18n } from './i18n'
import { parseSkillInput } from './skill-input'
import { React } from './vendor'

export function SkillTagsInput({ id, value, onChange, disabled = false, limit = 50 }: {
  id: string; value: string; onChange: (value: string) => void; disabled?: boolean; limit?: number
}) {
  const [draft, setDraft] = React.useState('')
  const [feedback, setFeedback] = React.useState<'duplicate' | 'limit' | null>(null)
  const skills = parseSkillInput(value)
  const add = (text: string) => {
    const incoming = parseSkillInput(text)
    if (!incoming.length) return
    const merged = parseSkillInput([...skills, ...incoming].join(','))
    if (merged.length > limit) { setFeedback('limit'); return }
    setFeedback(merged.length === skills.length ? 'duplicate' : null)
    onChange(merged.join(', '))
    setDraft('')
  }
  return <div className="grid gap-2">
    {skills.length ? <div className="flex flex-wrap items-center gap-1" aria-label={i18n.t('skillTagsLabel')}>
      {skills.map((skill) => <Badge key={skill.toLowerCase()} variant="secondary">
        {skill}<Button type="button" size="icon-xs" variant="ghost" disabled={disabled}
          aria-label={i18n.t('removeSkill', { skill })} onClick={() => onChange(skills.filter((item) => item !== skill).join(', '))}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
        </Button>
      </Badge>)}
    </div> : null}
    <div className="flex items-center gap-2">
      <Input id={id} value={draft} disabled={disabled} maxLength={500}
        placeholder={i18n.t('skillInputPlaceholder')} aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const next = event.target.value
          if (/[,，、\r\n]/u.test(next)) add(next)
          else setDraft(next)
        }}
        onBlur={() => { if (draft.trim()) add(draft) }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text')
          if (/[,，、\r\n]/u.test(pasted)) { event.preventDefault(); add(`${draft},${pasted}`) }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft) }
        }} />
      <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={() => add(draft)}>{i18n.t('skillAdd')}</Button>
    </div>
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">{i18n.t('skillInputHint', { limit })}</p>
    {feedback ? <p role="status" className="text-xs text-muted-foreground">{i18n.t(feedback === 'duplicate' ? 'skillDuplicate' : 'skillLimit', { limit })}</p> : null}
  </div>
}
