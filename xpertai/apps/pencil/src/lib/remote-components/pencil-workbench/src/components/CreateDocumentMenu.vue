<script setup lang="ts">
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-vue'
import { PencilIcon } from '../icons.js'

withDefaults(
  defineProps<{
    busy?: boolean
    createLabel: string
    blankLabel: string
    sampleLabel: string
  }>(),
  { busy: false }
)

const emit = defineEmits<{
  createBlank: []
  createSample: []
}>()
</script>

<template>
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger as-child>
        <DropdownMenuTrigger as-child>
          <Button
            class="pencil-command-button pencil-create-menu-trigger"
            variant="default"
            size="sm"
            type="button"
            :disabled="busy"
            :aria-label="createLabel"
          >
            <PencilIcon name="plus" />
            <PencilIcon name="chevronDown" class-name="pencil-create-menu-chevron" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent :side-offset="6" class="pencil-tooltip-content">
        {{ createLabel }}
      </TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="start" :side-offset="6" class="pencil-create-menu">
      <DropdownMenuItem @select="emit('createBlank')">
        <PencilIcon name="file" />
        <span>{{ blankLabel }}</span>
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('createSample')">
        <PencilIcon name="assets" />
        <span>{{ sampleLabel }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
