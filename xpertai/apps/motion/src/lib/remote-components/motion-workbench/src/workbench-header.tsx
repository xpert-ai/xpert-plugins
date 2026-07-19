import * as React from 'react'
import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import { Tabs, TabsList, TabsTrigger } from '@xpert-ai/plugin-shadcn-ui'
import { DEVICE_OPTIONS, TABS, type HeaderContext } from './motion-types'
import { labelForStatus, labelForTab, localizeOptions, type Translator } from './i18n'
import { Button, MotionSelect, h } from './ui'

type EditorToolbarProps = {
  header: HeaderContext
  t: Translator
  viewMode: 'preview' | 'code'
  device: 'desktop' | 'tablet' | 'mobile'
  zoom: number
  canUndo: boolean
  saving: boolean
  exportKinds: string[]
  exportLabel?: string
  onViewModeChange: (mode: 'preview' | 'code') => void
  onDeviceChange: (device: 'desktop' | 'tablet' | 'mobile') => void
  onZoomChange: (zoom: number) => void
  onReplay: () => void
  onUndo: () => void
  onSave: () => void
  onExport: (kind: string) => void
}

export function WorkbenchHeader(props: { header: HeaderContext; t: Translator }) {
  return (
    <section className="motion-unified-header motion-page-header" aria-label={props.t('workbenchHeaderLabel')}>
      <HeaderIdentity title={props.header.title} label={props.t('motion')} />
      <Button variant="outline" className="project-dialog-button" onClick={props.header.onOpenProjects}>
        {props.t('manageProjects')}
      </Button>
      <HeaderViewSelect header={props.header} t={props.t} />
      <HeaderStatus dirty={props.header.dirty} statusLabel={props.header.statusLabel} t={props.t} />
      <Button variant="outline" onClick={props.header.onOpenVersions}>
        {props.t('versionHistory')}
      </Button>
      <Button variant="outline" onClick={props.header.onOpenExports}>
        {props.t('exportHistory')}
      </Button>
    </section>
  )
}

export function EditorToolbar(props: EditorToolbarProps) {
  return (
    <div className="motion-unified-header editor-toolbar">
      <HeaderIdentity title={props.header.title} label={props.t('motion')} />
      <Button variant="outline" className="project-dialog-button" onClick={props.header.onOpenProjects}>
        {props.t('manageProjects')}
      </Button>
      <HeaderViewSelect header={props.header} t={props.t} />
      <HeaderStatus dirty={props.header.dirty} statusLabel={props.header.statusLabel} t={props.t} />
      <span className="toolbar-divider" />
      <Tabs className="toolbar-tabs" value={props.viewMode} onValueChange={(value) => props.onViewModeChange(value as 'preview' | 'code')}>
        <TabsList className="segmented compact">
          <TabsTrigger value="preview">{props.t('preview')}</TabsTrigger>
          <TabsTrigger value="code">{props.t('code')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <MotionSelect
        className="device-select"
        value={props.device}
        options={localizeOptions(DEVICE_OPTIONS, props.t)}
        onValueChange={(value) => props.onDeviceChange(value as 'desktop' | 'tablet' | 'mobile')}
      />
      <Button variant="outline" className="replay-button" onClick={props.onReplay} title={props.t('replayAllHint')}>
        {props.t('replayMotion')}
      </Button>
      <span className="toolbar-spacer" />
      <Button variant="outline" className="icon-button" onClick={props.onUndo} disabled={!props.canUndo} title={props.t('undo')}>
        ↶
      </Button>
      <div className="zoom-control">
        <Button variant="ghost" onClick={() => props.onZoomChange(Math.max(0.5, props.zoom - 0.1))}>
          −
        </Button>
        <span>{Math.round(props.zoom * 100)}%</span>
        <Button variant="ghost" onClick={() => props.onZoomChange(Math.min(1.4, props.zoom + 0.1))}>
          +
        </Button>
      </div>
      <Button onClick={props.onSave} disabled={props.saving}>
        {props.t('save')}
      </Button>
      <Button variant="secondary" onClick={props.header.onOpenVersions} disabled={props.saving}>
        {props.t('versionHistory')}
      </Button>
      <div className="download-menu">
        <Button disabled={props.saving} onClick={() => props.onExport(props.exportKinds[0] || 'html')}>
          {props.exportLabel ?? props.t('download')}
        </Button>
        {props.exportKinds.length > 1 ? (
          <div className="download-popover">
            {props.exportKinds.map((kind) => (
              <Button key={kind} variant="ghost" onClick={() => props.onExport(kind)}>
                {kind}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <Button variant="outline" onClick={props.header.onOpenExports}>
        {props.t('exportHistory')}
      </Button>
    </div>
  )
}

function HeaderIdentity(props: { title: string; label: string }) {
  return (
    <div className="motion-header-title">
      <span className="motion-kicker">{props.label}</span>
      <strong>{props.title}</strong>
    </div>
  )
}

function HeaderStatus(props: { dirty: boolean; statusLabel: string; t: Translator }) {
  return props.dirty ? <Badge variant="outline" data-status="warning">{props.t('unsaved')}</Badge> : <Badge variant="secondary">{labelForStatus(props.statusLabel, props.t)}</Badge>
}

function HeaderViewSelect(props: { header: HeaderContext; t: Translator }) {
  return (
    <MotionSelect
      className="motion-header-view-select"
      value={props.header.activeTab}
      options={TABS.map((tab) => ({ value: tab, label: labelForTab(tab, props.t) }))}
      onValueChange={(value) => props.header.onTabChange(value as HeaderContext['activeTab'])}
    />
  )
}
