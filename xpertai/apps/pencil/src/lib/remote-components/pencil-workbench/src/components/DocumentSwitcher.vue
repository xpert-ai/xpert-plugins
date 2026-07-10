<script setup lang="ts">
import { computed } from 'vue'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@xpert-ai/plugin-shadcn-vue'

export type DocumentSwitcherOption = {
  id: string
  title: string
  meta: string
}

const props = withDefaults(
  defineProps<{
    options: DocumentSwitcherOption[]
    selectedId: string
    busy?: boolean
    label: string
    emptyLabel: string
    className?: string
    variant?: 'default' | 'header'
  }>(),
  {
    busy: false,
    className: '',
    variant: 'default'
  }
)

const emit = defineEmits<{ select: [id: string] }>()
const selectedTitle = computed(() => props.options.find((option) => option.id === props.selectedId)?.title ?? props.emptyLabel)
const triggerClass = computed(() => [
  props.className,
  'pencil-document-select-trigger',
  props.variant === 'header' ? 'is-header' : ''
])

function selectDocument(value: string | number | bigint | object | null) {
  if (typeof value === 'string' && value && value !== props.selectedId) {
    emit('select', value)
  }
}
</script>

<template>
  <Select :model-value="selectedId" :disabled="busy || !options.length" @update:model-value="selectDocument">
    <SelectTrigger
      :class="triggerClass"
      :title="label"
      :aria-label="label"
    >
      <span class="pencil-document-select-value">{{ selectedTitle }}</span>
    </SelectTrigger>
    <SelectContent v-if="options.length" class="pencil-document-select-content" position="popper">
      <SelectItem
        v-for="option in options"
        :key="option.id"
        class="pencil-document-select-item"
        :value="option.id"
        :text-value="option.title"
      >
        <span class="pencil-document-select-option">
          <strong>{{ option.title }}</strong>
          <small>{{ option.meta }}</small>
        </span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
