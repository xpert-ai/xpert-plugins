import { h, type VNodeChild } from 'vue'
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-vue'
import { formatNumberLike } from './graph.js'
import type { ButtonVariant } from './types.js'

type UiChild = Exclude<VNodeChild, void | undefined | null>

export type SelectEntry = {
  value: string
  label: string
}

export function renderButton(
  options: { variant?: ButtonVariant; disabled?: boolean; class?: string; title?: string; onClick?: () => void },
  label: UiChild
) {
  const variant = options.variant ?? 'outline'
  const title = options.title ?? (typeof label === 'string' ? label : undefined)
  const button = h(
    Button,
    {
      class: ['ui-button ui-button-sm', `ui-button-${variant}`, options.class],
      variant,
      size: 'sm',
      disabled: options.disabled,
      'aria-label': title,
      type: 'button',
      onClick: options.onClick
    },
    { default: () => label }
  )
  if (!title) {
    return button
  }
  return h(Tooltip, null, {
    default: () => [
      h(TooltipTrigger, { asChild: true }, { default: () => button }),
      h(TooltipContent, { sideOffset: 6, class: 'pencil-tooltip-content' }, { default: () => title })
    ]
  })
}

export function renderInput(options: {
  value: string
  label?: string
  placeholder?: string
  class?: string
  onInput: (value: string) => void
  onEnter?: () => void
}) {
  return h(Input, {
    class: ['ui-input ui-input-sm', options.class],
    modelValue: options.value,
    'aria-label': options.label,
    placeholder: options.placeholder,
    'onUpdate:modelValue': (value: string | number) => options.onInput(String(value)),
    onKeydown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        options.onEnter?.()
      }
    }
  })
}

export function renderSelect(options: { value: string; label?: string; class?: string; onChange: (value: string) => void }, entries: SelectEntry[]) {
  return h(
    Select,
    {
      modelValue: options.value,
      'onUpdate:modelValue': (value: string | number | bigint | object | null) => options.onChange(String(value ?? ''))
    },
    {
      default: () => [
        h(
          SelectTrigger,
          { class: ['ui-select ui-select-sm', options.class], 'aria-label': options.label, size: 'sm' },
          { default: () => h(SelectValue, { placeholder: options.label }) }
        ),
        h(
          SelectContent,
          { class: 'pencil-shadcn-select-content', position: 'popper' },
          { default: () => entries.map((entry) => h(SelectItem, { value: entry.value }, { default: () => entry.label })) }
        )
      ]
    }
  )
}

export function renderBadge(label: string, tone = 'secondary') {
  const variant = tone === 'destructive' ? 'destructive' : tone === 'secondary' ? 'secondary' : 'outline'
  return h(Badge, { class: ['ui-badge', `ui-badge-${tone}`], variant }, { default: () => label })
}

export function renderSegmented<T extends string>(
  entries: Array<{ value: T; label: string }>,
  activeValue: T,
  onSelect: (value: T) => void,
  options?: { class?: string }
) {
  return h(Tabs, { modelValue: activeValue, 'onUpdate:modelValue': (value: string | number) => onSelect(String(value) as T) }, {
    default: () => h(
      TabsList,
      { class: ['ui-segmented', options?.class] },
      { default: () => entries.map((entry) => h(TabsTrigger, { value: entry.value, class: ['ui-segmented-item', activeValue === entry.value ? 'is-active' : ''] }, { default: () => entry.label })) }
    )
  })
}

export function renderTabButton<T extends string>(tab: T, activeTab: T, label: UiChild, onSelect: (tab: T) => void, title?: string) {
  return h(
    Button,
    {
      class: ['ui-tab', activeTab === tab ? 'is-active' : ''],
      variant: activeTab === tab ? 'secondary' : 'ghost',
      size: 'sm',
      title: title ?? (typeof label === 'string' ? label : undefined),
      type: 'button',
      onClick: () => onSelect(tab)
    },
    { default: () => label }
  )
}

export function renderPanel(title: UiChild, body: UiChild | null, options?: { class?: string; actions?: UiChild[]; titleClass?: string }) {
  return h('section', { class: ['pencil-panel', options?.class] }, [
    h('div', { class: 'pencil-panel-header' }, [
      h('h2', { class: options?.titleClass }, title),
      options?.actions?.length ? h('div', { class: 'pencil-panel-actions' }, options.actions) : null
    ]),
    h('div', { class: 'pencil-panel-body' }, body === null ? undefined : body)
  ])
}

export function renderDefinitionList(entries: Array<[string, string]>) {
  return h(
    'dl',
    { class: 'pencil-definition-list' },
    entries.flatMap(([key, value]) => [h('dt', key), h('dd', value)])
  )
}

export function renderNumberControl(label: string, value: unknown, onChange: (value: number) => void) {
  return h(Label, { class: 'pencil-control-field' }, {
    default: () => [
    h('span', label),
    h(Input, {
      class: 'ui-input ui-input-sm',
      type: 'number',
      modelValue: formatNumberLike(value),
      'aria-label': label,
      'onUpdate:modelValue': (input: string | number) => {
        const next = Number(input)
        if (Number.isFinite(next)) {
          onChange(next)
        }
      }
    })
    ]
  })
}

export function renderSelectControl(label: string, value: string, entries: SelectEntry[], onChange: (value: string) => void) {
  return h(Label, { class: 'pencil-control-field' }, {
    default: () => [
    h('span', label),
    renderSelect(
      {
        value,
        label,
        onChange
      },
      entries
    )
    ]
  })
}

export function renderTextAreaControl(label: string, value: string, onInput: (value: string) => void) {
  return h(Label, { class: 'pencil-control-field pencil-control-field-wide' }, {
    default: () => [
    h('span', label),
    h(Textarea, {
      class: 'ui-textarea ui-textarea-sm',
      modelValue: value,
      rows: 3,
      'aria-label': label,
      'onUpdate:modelValue': (input: string | number) => onInput(String(input))
    })
    ]
  })
}

export function renderColorControl(label: string, value: string, onInput: (value: string) => void) {
  return h(Label, { class: 'pencil-control-field' }, {
    default: () => [
    h('span', label),
    h('input', {
      class: 'ui-color-input',
      type: 'color',
      value,
      'aria-label': label,
      onInput: (event: Event) => {
        onInput((event.target as HTMLInputElement).value)
      }
    })
    ]
  })
}
