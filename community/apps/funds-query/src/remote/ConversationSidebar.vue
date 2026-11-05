<script setup lang="ts">
import { Button, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-vue'
import type { Dataset, Conversation } from '../shared/contracts.js'
import { t, formatDateTime } from './i18n.js'
defineProps<{datasets: Dataset[]; currentId?: string; sessions: Conversation[]; total: number; busy: boolean; importing: boolean; loadingMore: boolean; selectedId?: string; hasMoreDatasets?: boolean; datasetsLoading?: boolean}>()
defineEmits<{dataset: [id: string]; session: [id: string]; create: []; import: []; more: []; moreDatasets: []}>()
</script>
<template>
  <div class="sidebar-body">
    <div class="brand"><span class="brand-mark" aria-hidden="true">↗</span><div><strong>{{ t('brand') }}</strong><small>{{ t('sidebarSubtitle') }}</small></div></div>
    <div class="dataset-picker"><span class="eyebrow">{{ t('currentDataset') }}</span><Select :model-value="currentId" :disabled="busy" @update:model-value="value => value && $emit('dataset', String(value))"><SelectTrigger :aria-label="t('selectDataset')"><SelectValue :placeholder="t('chooseDataset')" /></SelectTrigger><SelectContent><SelectItem v-for="item in datasets" :key="item.id" :value="item.id">{{ item.name }}</SelectItem></SelectContent></Select><Button variant="outline" :disabled="busy" @click="$emit('import')">{{ importing ? t('importing') : t('import') }}</Button><small class="muted">{{ t('importHelp') }}</small></div>
    <div class="session-list-header"><span class="eyebrow">{{ t('conversations') }}</span><Badge variant="secondary">{{ total }}</Badge></div>
    <Button v-if="hasMoreDatasets" variant="ghost" size="sm" :disabled="datasetsLoading" @click="$emit('moreDatasets')">{{ t('showMore') }}</Button>
    <Button :disabled="!currentId || busy" @click="$emit('create')"><span aria-hidden="true">＋</span> {{ t('newConversation') }}</Button>
    <nav class="session-list" :aria-label="t('conversations')"><Button v-for="item in sessions" :key="item.id" :variant="item.id === selectedId ? 'secondary' : 'ghost'" class="session-item" :title="t('conversationTurns', {count: item.turnCount}) + ' · ' + formatDateTime(item.updatedAt)" :disabled="busy" :aria-current="item.id === selectedId ? 'true' : undefined" @click="$emit('session', item.id)"><span class="session-item-content"><span class="session-title">{{ item.turnCount ? item.title : t('newConversationTitle') }}</span></span><span v-if="item.running" class="session-running" :aria-label="t('analyzing')"></span></Button><Button v-if="sessions.length < total" variant="ghost" :disabled="loadingMore" @click="$emit('more')">{{ t('moreConversations') }}</Button></nav>
    <p class="sidebar-note">{{ t('conversationIsolation') }}</p>
  </div>
</template>
