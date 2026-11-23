import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DocxEditor } from '@docx-editor.dev/react'
import {
  Button, Check, ChevronDown, CircleDot, Collapsible, CollapsibleContent, CollapsibleTrigger,
  Download, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, FileText, LockKeyhole, Menu, Save
} from '@xpert-ai/plugin-shadcn-ui'
import { t } from './i18n'

type Props = {
  mount: HTMLElement
  title: string
  status: string
  canWrite: boolean
  dirty: boolean
  busy: boolean
  collaboration?: string
  rulers: boolean
  onRulersChange: (visible: boolean) => void
  onSave: () => void
  onDownload: () => void
}

/** Keep the engine context and selection while placing its chrome above the scroll viewport. */
export function EditorToolbar(props: Props) {
  const [expanded, setExpanded] = useState(false)
  const StatusIcon = !props.canWrite ? LockKeyhole : props.dirty || props.busy ? CircleDot : Check
  return createPortal(<Collapsible open={expanded} onOpenChange={setExpanded} className="word-chrome docx-editor">
    <div className="word-toolbar-row">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label={t('document.menu')} title={props.title}>
            <FileText aria-hidden="true" /><ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="word-file-menu" align="start">
          <DropdownMenuLabel className="break-words">{props.title}</DropdownMenuLabel>
          {props.collaboration && <DropdownMenuLabel>{props.collaboration}</DropdownMenuLabel>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={props.onDownload}>
            <Download aria-hidden="true" />{t(props.dirty ? 'document.downloadDraft' : 'document.download')}
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem checked={props.rulers} onCheckedChange={props.onRulersChange}>
            {t('document.rulers')}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DocxEditor.Toolbar className="word-formatting" />
      <div className="word-toolbar-actions">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" aria-label={t(expanded ? 'document.collapseTools' : 'document.expandTools')}
            title={t(expanded ? 'document.collapseTools' : 'document.expandTools')}>
            <Menu aria-hidden="true" /><span className="word-action-label">{t('document.moreTools')}</span>
          </Button>
        </CollapsibleTrigger>
        <span role="status" className="word-save-status" title={props.status}>
          <StatusIcon aria-hidden="true" className="size-4" /><span className="word-status-label">{props.status}</span>
        </span>
        {props.canWrite && <Button variant="outline" disabled={!props.dirty || props.busy} onClick={props.onSave}
          aria-label={t('document.save')} title={t('document.save')}>
          <Save aria-hidden="true" /><span className="word-action-label">{t('document.save')}</span>
        </Button>}
      </div>
    </div>
    <CollapsibleContent>
      <DocxEditor.Menu className="word-advanced-menu" reportIssue={false} onSave={props.onSave}>
        <DocxEditor.Menu.File preset={false}><DocxEditor.Menu.PageSetup /></DocxEditor.Menu.File>
      </DocxEditor.Menu>
    </CollapsibleContent>
    {props.rulers && <div className="word-ruler-row"><DocxEditor.HorizontalRuler /></div>}
  </Collapsible>, props.mount)
}
