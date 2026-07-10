<script setup lang="ts">
import type { ButtonVariants } from '@xpert-ai/plugin-shadcn-vue'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@xpert-ai/plugin-shadcn-vue'
import { PencilIcon, type PencilIconName } from '../icons.js'

withDefaults(
  defineProps<{
    icon: PencilIconName
    label: string
    variant?: ButtonVariants['variant']
    disabled?: boolean
  }>(),
  {
    variant: 'outline',
    disabled: false
  }
)

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button
        class="pencil-command-button"
        :variant="variant"
        size="sm"
        type="button"
        :disabled="disabled"
        :aria-label="label"
        @click="emit('click')"
      >
        <PencilIcon :name="icon" />
        <span class="pencil-command-label">{{ label }}</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent :side-offset="6" class="pencil-tooltip-content">
      {{ label }}
    </TooltipContent>
  </Tooltip>
</template>
