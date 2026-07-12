<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import * as Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea
} from '@xpert-ai/plugin-shadcn-vue'
import { selectionToJSX } from '@open\u002dpencil/core/design-jsx'
import type { SceneGraph } from '@open\u002dpencil/core/scene-graph'
import { PENCIL_JSX_REFERENCE, toCoreJsxFormat, codeTargetIds, type PencilCodeFormat } from '../code.js'
import { PencilIcon } from '../icons.js'
import { translate, type LocaleKey } from '../i18n.js'

type CodeInspectorMode = 'jsx' | 'graph'

const props = defineProps<{
  graph: SceneGraph
  selectedNodeIds: string[]
  graphText: string
  locale: LocaleKey
  revision: number
  busy: boolean
  canUseDocument: boolean
  importPencilJsx: (source: string) => Promise<void>
  updateGraphText: (value: string) => void
}>()

const mode = ref<CodeInspectorMode>('jsx')
const format = ref<PencilCodeFormat>('pencil')
const copied = ref<'code' | 'reference' | null>(null)
const importOpen = ref(false)
const importSource = ref('')
const importError = ref('')
const importing = ref(false)

const text = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(props.locale, key, values)

const targetIds = computed(() => {
  props.revision
  return codeTargetIds(props.selectedNodeIds, (id) => Boolean(props.graph.getNode(id)))
})

const jsxSource = computed(() => {
  props.revision
  if (!targetIds.value.length) {
    return ''
  }
  return selectionToJSX(targetIds.value, props.graph, toCoreJsxFormat(format.value))
})

const sourceForDisplay = computed(() => (mode.value === 'graph' ? props.graphText : jsxSource.value))
const hasCode = computed(() => sourceForDisplay.value.trim().length > 0)
const canImport = computed(() => props.canUseDocument && mode.value === 'jsx' && format.value === 'pencil')

const highlightedCode = computed(() => {
  const grammar = Prism.languages.jsx ?? Prism.languages.markup
  return Prism.highlight(sourceForDisplay.value, grammar, 'jsx')
})

const lineNumbers = computed(() => {
  const lines = Math.max(1, sourceForDisplay.value.split('\n').length)
  return Array.from({ length: lines }, (_, index) => index + 1)
})

watch(
  () => props.locale,
  () => {
    copied.value = null
  }
)

watch(format, () => {
  copied.value = null
})

function updateMode(value: string | number) {
  mode.value = value === 'graph' ? 'graph' : 'jsx'
}

function updateFormat(value: string | number) {
  format.value = value === 'tailwind' ? 'tailwind' : 'pencil'
}

async function copyText(value: string, target: 'code' | 'reference') {
  if (!value.trim()) {
    return
  }
  await navigator.clipboard.writeText(value)
  copied.value = target
  window.setTimeout(() => {
    if (copied.value === target) copied.value = null
  }, 1400)
}

function openImportDialog() {
  importSource.value = jsxSource.value.trim()
  importError.value = ''
  importOpen.value = true
}

/** Inserts validated Pencil JSX through the parent editor so graph dirty state stays centralized. */
async function submitImport() {
  const source = importSource.value.trim()
  if (!source) {
    importError.value = text('codeImportEmpty')
    return
  }
  importing.value = true
  importError.value = ''
  try {
    await props.importPencilJsx(source)
    importOpen.value = false
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="pencil-code-inspector">
    <div class="pencil-code-tabs">
      <Tabs :model-value="mode" @update:model-value="updateMode">
        <TabsList class="pencil-code-mode-list">
          <TabsTrigger value="jsx" class="pencil-code-tab">{{ text('codeJsx') }}</TabsTrigger>
          <TabsTrigger value="graph" class="pencil-code-tab">{{ text('graphJson') }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs v-if="mode === 'jsx'" :model-value="format" @update:model-value="updateFormat">
        <TabsList class="pencil-code-mode-list">
          <TabsTrigger value="pencil" class="pencil-code-tab">{{ text('codePencil') }}</TabsTrigger>
          <TabsTrigger value="tailwind" class="pencil-code-tab">{{ text('codeTailwind') }}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <div class="pencil-code-actions">
      <Button
        variant="ghost"
        size="sm"
        class="pencil-code-action"
        :disabled="busy || !canImport"
        :title="format === 'tailwind' ? text('codeImportPencilOnly') : text('codeImport')"
        @click="openImportDialog"
      >
        <PencilIcon name="upload" />
        <span>{{ text('codeImport') }}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="pencil-code-action"
        :disabled="busy"
        :title="text('codeReference')"
        @click="copyText(PENCIL_JSX_REFERENCE, 'reference')"
      >
        <PencilIcon name="book" />
        <span>{{ copied === 'reference' ? text('copied') : text('codeReference') }}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="pencil-code-action"
        :disabled="busy || !hasCode"
        :title="text('copy')"
        @click="copyText(sourceForDisplay, 'code')"
      >
        <PencilIcon name="copy" />
        <span>{{ copied === 'code' ? text('copied') : text('copy') }}</span>
      </Button>
    </div>

    <Textarea
      v-if="mode === 'graph'"
      class="pencil-graph-editor"
      :model-value="graphText"
      spellcheck="false"
      :aria-label="text('graphJson')"
      @update:model-value="(value) => updateGraphText(String(value))"
    />

    <div v-else-if="hasCode" class="pencil-code-viewer" :aria-label="text('code')">
      <ScrollArea class="pencil-code-scroll">
        <pre class="pencil-code-pre"><span class="pencil-code-gutter" aria-hidden="true"><span v-for="line in lineNumbers" :key="line">{{ line }}</span></span><code class="language-jsx" v-html="highlightedCode" /></pre>
      </ScrollArea>
    </div>
    <div v-else class="pencil-code-empty">
      {{ text('codeEmptySelection') }}
    </div>

    <Dialog v-model:open="importOpen">
      <DialogContent class="pencil-code-import-dialog">
        <DialogHeader>
          <DialogTitle>{{ text('codeImportTitle') }}</DialogTitle>
          <DialogDescription>{{ text('codeImportDescription') }}</DialogDescription>
        </DialogHeader>
        <Textarea
          v-model="importSource"
          class="pencil-code-import-input"
          spellcheck="false"
          :placeholder="text('codeImportPlaceholder')"
          :aria-label="text('codeImportTitle')"
        />
        <p v-if="importError" class="pencil-code-import-error">{{ importError }}</p>
        <DialogFooter>
          <Button variant="outline" :disabled="importing" @click="importOpen = false">{{ text('cancel') }}</Button>
          <Button :disabled="importing || !importSource.trim()" @click="submitImport">
            {{ importing ? text('busy') : text('codeImportInsert') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
