<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@xpert-ai/plugin-shadcn-vue'
import { PencilIcon } from '../icons.js'
import type { ArtifactShare } from '../types.js'

type ShareAccessMode = 'public_link' | 'organization_all' | 'workspace_all'
type ShareTargetMode = 'version' | 'latest'

const props = defineProps<{
  open: boolean
  busy: boolean
  hasWorkspace: boolean
  exportFormat: string
  exportFormats: string[]
  share?: ArtifactShare | null
  labels: {
    title: string
    description: string
    access: string
    publicAccess: string
    organizationAccess: string
    workspaceAccess: string
    target: string
    fixedVersion: string
    latestVersion: string
    publicConfirm: string
    publish: string
    update: string
    copy: string
    revoke: string
    cancel: string
    currentLink: string
    currentRevision: string
    currentStatus: string
    workspaceUnavailable: string
    exportFormat: string
    exportAction: string
  }
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  publish: [input: { accessMode: ShareAccessMode; targetMode: ShareTargetMode; userConfirmedPublicLink: boolean }]
  'update:exportFormat': [format: string]
  export: []
  copy: []
  revoke: []
}>()

const accessMode = ref<ShareAccessMode>('public_link')
const targetMode = ref<ShareTargetMode>('version')
const confirmedPublic = ref(false)
const shareUrl = computed(() => props.share?.publicUrl ?? props.share?.shareUrl ?? '')
const canPublish = computed(() => {
  if (props.busy) return false
  if (accessMode.value === 'public_link' && !confirmedPublic.value) return false
  if (accessMode.value === 'workspace_all' && !props.hasWorkspace) return false
  return true
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    accessMode.value = props.share?.accessMode ?? 'public_link'
    targetMode.value = props.share?.targetMode ?? 'version'
    confirmedPublic.value = false
  }
)

function normalizeAccess(value: string | number | bigint | object | null) {
  if (value === 'public_link' || value === 'organization_all' || value === 'workspace_all') accessMode.value = value
}

function normalizeTarget(value: string | number | bigint | object | null) {
  if (value === 'version' || value === 'latest') targetMode.value = value
}

function normalizeExportFormat(value: string | number | bigint | object | null) {
  if (typeof value === 'string') emit('update:exportFormat', value)
}
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent class="pencil-share-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ labels.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ labels.description }}</AlertDialogDescription>
      </AlertDialogHeader>

      <div class="pencil-share-form">
        <label>
          <span>{{ labels.access }}</span>
          <Select :model-value="accessMode" @update:model-value="normalizeAccess">
            <SelectTrigger class="pencil-share-select"><span>{{ accessMode === 'public_link' ? labels.publicAccess : accessMode === 'organization_all' ? labels.organizationAccess : labels.workspaceAccess }}</span></SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="public_link">{{ labels.publicAccess }}</SelectItem>
              <SelectItem value="organization_all">{{ labels.organizationAccess }}</SelectItem>
              <SelectItem value="workspace_all" :disabled="!hasWorkspace">{{ labels.workspaceAccess }}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <p v-if="accessMode === 'workspace_all' && !hasWorkspace" class="pencil-share-warning">{{ labels.workspaceUnavailable }}</p>
        <label>
          <span>{{ labels.target }}</span>
          <Select :model-value="targetMode" @update:model-value="normalizeTarget">
            <SelectTrigger class="pencil-share-select"><span>{{ targetMode === 'version' ? labels.fixedVersion : labels.latestVersion }}</span></SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="version">{{ labels.fixedVersion }}</SelectItem>
              <SelectItem value="latest">{{ labels.latestVersion }}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label v-if="accessMode === 'public_link'" class="pencil-share-confirm">
          <input v-model="confirmedPublic" type="checkbox" />
          <span>{{ labels.publicConfirm }}</span>
        </label>
        <div class="pencil-share-export">
          <label>
            <span>{{ labels.exportFormat }}</span>
            <Select :model-value="exportFormat" @update:model-value="normalizeExportFormat">
              <SelectTrigger class="pencil-share-select" :aria-label="labels.exportFormat">
                <span>{{ exportFormat }}</span>
              </SelectTrigger>
              <SelectContent class="pencil-shadcn-select-content" position="popper">
                <SelectItem v-for="format in exportFormats" :key="format" :value="format">
                  {{ format }}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button type="button" variant="outline" :disabled="busy" @click="emit('export')">
            <PencilIcon name="download" />
            <span>{{ labels.exportAction }}</span>
          </Button>
        </div>
        <div v-if="shareUrl" class="pencil-share-current">
          <span>{{ labels.currentLink }}</span>
          <code>{{ shareUrl }}</code>
          <p>{{ labels.currentRevision }}: {{ share?.revision ?? '—' }} · {{ labels.currentStatus }}: {{ share?.status ?? '—' }}</p>
          <div>
            <Button type="button" variant="outline" size="sm" :disabled="busy" @click="emit('copy')">{{ labels.copy }}</Button>
            <Button type="button" variant="destructive" size="sm" :disabled="busy" @click="emit('revoke')">{{ labels.revoke }}</Button>
          </div>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">{{ labels.cancel }}</AlertDialogCancel>
        <Button
          type="button"
          :disabled="!canPublish"
          @click="emit('publish', { accessMode, targetMode, userConfirmedPublicLink: accessMode === 'public_link' && confirmedPublic })"
        >
          {{ shareUrl ? labels.update : labels.publish }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
