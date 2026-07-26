import * as React from 'react'
import {
  Button,
  Plus,
  Trash2
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'
import type {
  Asset,
  Character,
  ProductionView,
  Scene,
  Shot
} from './production-data'

const h: typeof React.createElement = React.createElement

export type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export type ProductionEditorProps = {
  production: ProductionView
  update: (mutate: (draft: ProductionView) => void) => void
  t: Translator
}

export function Field(props: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <label className={`ss-editor-field ${props.wide ? 'is-wide' : ''}`}>
      <span>{props.label}</span>
      {props.children}
    </label>
  )
}

export function EditorSection(props: {
  title: string
  onAdd: () => void
  children: React.ReactNode
  t: Translator
}) {
  return (
    <section className="ss-editor-section">
      <header>
        <strong>{props.title}</strong>
        <Button variant="outline" size="sm" onClick={props.onAdd}>
          <Plus aria-hidden="true" />{props.t('editor.add')}
        </Button>
      </header>
      <div>{props.children}</div>
    </section>
  )
}

export function EditorCard(props: {
  title: string
  onRemove: () => void
  children: React.ReactNode
  t: Translator
}) {
  return (
    <article className="ss-editor-card">
      <header>
        <strong>{props.title}</strong>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={props.t('editor.remove')}
          title={props.t('editor.remove')}
          onClick={props.onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </header>
      <div>{props.children}</div>
    </article>
  )
}

export function newIdentifier(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function numberValue(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function newCharacter(t: Translator): Character {
  return {
    id: newIdentifier('character'),
    name: t('editor.newCharacter'),
    role: null,
    visualDescription: null,
    voiceReference: null
  }
}

export function newAsset(t: Translator): Asset {
  return {
    id: newIdentifier('asset'),
    kind: 'prop',
    name: t('editor.newAsset'),
    description: t('editor.newAssetDescription'),
    prompt: t('editor.newAssetPrompt'),
    candidates: []
  }
}

export function newScene(order: number, t: Translator): Scene {
  return {
    id: newIdentifier('scene'),
    order,
    title: t('editor.newScene'),
    summary: t('editor.newSceneSummary'),
    location: null,
    timeOfDay: null,
    shots: [newShot(t)]
  }
}

export function newShot(t: Translator): Shot {
  return {
    id: newIdentifier('shot'),
    title: t('editor.newShot'),
    composition: t('editor.newComposition'),
    action: t('editor.newAction'),
    camera: t('editor.newCamera'),
    dialogue: null,
    dialogueSpeakerId: null,
    dialogueType: null,
    soundEffects: [],
    durationSeconds: 5,
    candidates: []
  }
}
