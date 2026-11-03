import React from 'react'
import { Checkbox, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import type { PolicySettings } from '../../../src/automation-contract'
import { eventI18n } from './event-i18n'

export function EventSettings({ settings, onChange, locale }: { settings: PolicySettings; onChange: (patch: Partial<PolicySettings>) => void; locale?: string }) {
  const t = eventI18n.t
  return <RemoteI18nProvider i18n={eventI18n}><div className="space-y-4">
    <label className="block space-y-2 text-sm"><span>{t('executionMode')}</span>
      <Select value={settings.executionMode} onValueChange={value => onChange(value === 'assistant'
        ? { executionMode: 'assistant', pipeline: null, visibility: 'private', delivery: 'draft' }
        : { executionMode: 'pipeline', onWorkflowFailure: false, onWorkflowTimeout: false })}>
        <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="assistant">{t('assistant')}</SelectItem><SelectItem value="pipeline">{t('pipeline')}</SelectItem>
        </SelectContent>
      </Select>
    </label>
    {settings.executionMode === 'assistant' && <>
      <p className="text-sm text-muted-foreground">{t('assistantHelp')}</p>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={settings.onWorkflowFailure} onCheckedChange={value => onChange({ onWorkflowFailure: value === true })}/>{t('workflowFailure')}</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={settings.onWorkflowTimeout} onCheckedChange={value => onChange({ onWorkflowTimeout: value === true })}/>{t('workflowTimeout')}</label>
      <label className="block space-y-2 text-sm"><span>{t('workflows')}</span><Textarea value={settings.workflows.join('\n')} onChange={e => onChange({ workflows: e.target.value.split('\n') })}/></label>
      <p className="text-xs text-muted-foreground">{t('actionsHelp')}</p>
    </>}
  </div></RemoteI18nProvider>
}
