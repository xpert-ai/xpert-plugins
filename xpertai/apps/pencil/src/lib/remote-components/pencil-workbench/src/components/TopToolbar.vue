<script setup lang="ts">
import { ref } from 'vue'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-vue'
import CreateDocumentMenu from './CreateDocumentMenu.vue'
import ToolbarButton from './ToolbarButton.vue'

/** All visible command text is supplied by the Workbench locale adapter. */
type ToolbarLabels = {
  actions: string
  create: string
  blankDesign: string
  sample: string
  importFile: string
  refresh: string
  save: string
  saveVersion: string
  export: string
  review: string
  archive: string
  deleteDocument: string
  connecting: string
  offline: string
}

type ToolbarCollaborator = {
  presenceId: string
  displayName: string
  actorType: 'user' | 'agent' | 'system'
  color: string
  avatarUrl?: string | null
  status?: string | null
  operationLabel?: string | null
}

withDefaults(
  defineProps<{
    logoSrc: string
    brandSubtitle: string
    summaryText: string
    busy: boolean
    dirty: boolean
    canUseDocument: boolean
    exportFormat: string
    exportFormats: string[]
    statusLabel: string
    connectionState: 'connecting' | 'connected' | 'disconnected'
    collaborators: ToolbarCollaborator[]
    labels: ToolbarLabels
  }>(),
  {
    exportFormats: () => ['fig', 'png', 'jpg', 'webp', 'svg', 'pdf', 'jsx'],
    collaborators: () => []
  }
)

const emit = defineEmits<{
  createBlank: []
  createSample: []
  importFile: [file: File]
  refresh: []
  save: []
  saveVersion: []
  'update:exportFormat': [format: string]
  export: []
  review: []
  archive: []
  deleteDocument: []
}>()

const importInput = ref<HTMLInputElement | null>(null)

function handleImport(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('importFile', file)
  input.value = ''
}

function updateExportFormat(value: string | number | bigint | object | null) {
  if (typeof value === 'string') emit('update:exportFormat', value)
}
</script>

<template>
  <header class="pencil-header pencil-header-studio">
    <div class="pencil-brand">
      <div class="pencil-brand-mark">
        <img class="pencil-brand-logo" :src="logoSrc" alt="Pencil" draggable="false" />
      </div>
      <div class="pencil-brand-copy">
        <strong>Pencil</strong>
        <span>{{ brandSubtitle }}</span>
      </div>
    </div>

    <div class="pencil-current">
      <slot name="title" />
      <p>{{ summaryText }}</p>
    </div>

    <nav class="pencil-toolbar" :aria-label="labels.actions">
      <CreateDocumentMenu
        :busy="busy"
        :create-label="labels.create"
        :blank-label="labels.blankDesign"
        :sample-label="labels.sample"
        @create-blank="emit('createBlank')"
        @create-sample="emit('createSample')"
      />
      <input ref="importInput" class="pencil-file-input" type="file" accept=".fig,.pen" @change="handleImport" />
      <ToolbarButton icon="upload" :label="labels.importFile" :disabled="busy" @click="importInput?.click()" />
      <span class="pencil-toolbar-divider" />
      <ToolbarButton icon="refresh" :label="labels.refresh" :disabled="busy" @click="emit('refresh')" />
      <ToolbarButton icon="save" :label="labels.save" :disabled="busy || !canUseDocument" @click="emit('save')" />
      <ToolbarButton icon="history" :label="labels.saveVersion" :disabled="busy || !canUseDocument" @click="emit('saveVersion')" />
      <span class="pencil-toolbar-divider" />
      <Select :model-value="exportFormat" @update:model-value="updateExportFormat">
        <SelectTrigger class="pencil-format-select" :aria-label="labels.export">
          <span>{{ exportFormat }}</span>
        </SelectTrigger>
        <SelectContent class="pencil-shadcn-select-content" position="popper">
          <SelectItem v-for="format in exportFormats" :key="format" :value="format">
            {{ format }}
          </SelectItem>
        </SelectContent>
      </Select>
      <ToolbarButton icon="download" :label="labels.export" :disabled="busy || !canUseDocument" @click="emit('export')" />
      <span class="pencil-toolbar-divider" />
      <ToolbarButton icon="check" :label="labels.review" :disabled="busy || !canUseDocument" @click="emit('review')" />
      <ToolbarButton icon="archive" :label="labels.archive" :disabled="busy || !canUseDocument" @click="emit('archive')" />
      <ToolbarButton
        icon="trash"
        :label="labels.deleteDocument"
        variant="destructive"
        :disabled="busy || !canUseDocument"
        @click="emit('deleteDocument')"
      />
    </nav>

    <div class="pencil-state">
      <TooltipProvider v-if="collaborators.length">
        <AvatarGroup class="pencil-collaborators">
          <Tooltip v-for="collaborator in collaborators.slice(0, 4)" :key="collaborator.presenceId">
            <TooltipTrigger as-child>
              <Avatar size="sm" :style="{ '--pencil-collaborator-color': collaborator.color }">
                <AvatarImage v-if="collaborator.avatarUrl" :src="collaborator.avatarUrl" :alt="collaborator.displayName" />
                <AvatarFallback>{{ collaborator.actorType === 'agent' ? 'AI' : collaborator.displayName.slice(0, 1).toUpperCase() }}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              {{ collaborator.displayName }}<template v-if="collaborator.operationLabel"> · {{ collaborator.operationLabel }}</template>
            </TooltipContent>
          </Tooltip>
          <AvatarGroupCount v-if="collaborators.length > 4">+{{ collaborators.length - 4 }}</AvatarGroupCount>
        </AvatarGroup>
      </TooltipProvider>
      <Badge :class="['ui-badge', dirty ? 'ui-badge-warning' : 'ui-badge-secondary']" :variant="dirty ? 'outline' : 'secondary'">
        {{ connectionState === 'disconnected' ? labels.offline : connectionState === 'connecting' ? labels.connecting : statusLabel }}
      </Badge>
    </div>
  </header>
</template>
