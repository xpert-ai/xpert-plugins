<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{text: string}>()
const blocks = computed(() => props.text.split(/\n\s*\n/).filter(Boolean))
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map(value =>
    value.startsWith('**') ? {kind: 'strong', text: value.slice(2, -2)} :
      value.startsWith('`') ? {kind: 'code', text: value.slice(1, -1)} : {kind: 'text', text: value})
}
</script>
<template>
  <div class="message-prose">
    <p v-for="(block, index) in blocks" :key="index"><template v-for="(part, i) in inline(block)" :key="i"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template></p>
  </div>
</template>
