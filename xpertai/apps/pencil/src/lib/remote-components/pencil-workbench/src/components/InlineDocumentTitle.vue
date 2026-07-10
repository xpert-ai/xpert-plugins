<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  title: string
  draft: string
  editing: boolean
  disabled: boolean
  titleLabel: string
  editLabel: string
}>()

const emit = defineEmits<{
  edit: []
  cancel: []
  save: []
  'update:draft': [value: string]
}>()

const input = ref<HTMLInputElement | null>(null)

function focus() {
  input.value?.focus()
  input.value?.select()
}

defineExpose({ focus })

watch(
  () => props.editing,
  async (editing) => {
    if (!editing) return
    await nextTick()
    focus()
  },
  { flush: 'post' }
)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('save')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}
</script>

<template>
  <input
    v-if="editing"
    ref="input"
    class="pencil-inline-title-input"
    :value="draft"
    :disabled="disabled"
    :aria-label="titleLabel"
    @input="emit('update:draft', ($event.target as HTMLInputElement).value)"
    @blur="emit('save')"
    @keydown="handleKeydown"
  />
  <button
    v-else
    class="pencil-inline-title-button"
    type="button"
    :title="editLabel"
    :disabled="disabled"
    @click="emit('edit')"
  >
    {{ title }}
  </button>
</template>
