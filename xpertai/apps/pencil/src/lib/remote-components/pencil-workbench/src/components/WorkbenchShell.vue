<script setup lang="ts">
import { TooltipProvider } from '@xpert-ai/plugin-shadcn-vue'

defineProps<{
  leftCollapsed: boolean
  inspectorCollapsed: boolean
}>()
</script>

<template>
  <TooltipProvider :delay-duration="350">
    <div class="pencil-shell">
      <slot name="header" />
      <main
        :class="[
          'pencil-layout',
          leftCollapsed ? 'is-left-collapsed' : '',
          inspectorCollapsed ? 'is-inspector-collapsed' : ''
        ]"
      >
        <slot name="left" />
        <slot name="stage" />
        <slot name="inspector" />
      </main>
    </div>
    <slot name="dialogs" />
  </TooltipProvider>
</template>
