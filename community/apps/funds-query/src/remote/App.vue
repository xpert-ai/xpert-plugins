<script setup lang="ts">
import { ref } from 'vue'
import {
  Button, Textarea, Tabs, TabsList, TabsTrigger, TabsContent,
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@xpert-ai/plugin-shadcn-vue'
import { useWorkbench } from './use-workbench.js'
import { t, formatMoney } from './i18n.js'
import ChatAnswer from './ChatAnswer.vue'
import MessageText from './MessageText.vue'
import Transactions from './Transactions.vue'
import ConversationSidebar from './ConversationSidebar.vue'
const {
  runtime, context, current, datasets, session, sessions, sessionsTotal, turns, question, tab, loading, mutation,
  preview, previewLoading, olderLoading, sessionsLoading, datasetsLoading, error, notice, issues, input, timeline,
  nearBottom, evidenceOpen, evidenceResult, evidenceLoading, dispatch, canSend, otherReplying, hasOlder,
  suggestions, isRunning, stageText, clearError, refresh, selectDataset, upload, newSession, selectSession,
  ask, loadOlder, loadMoreSessions, loadMoreDatasets, loadPreview, loadEvidence, onScroll, scrollBottom
} = useWorkbench()
const sidebarOpen = ref(false)
async function chooseSession(id: string) { await selectSession(id); sidebarOpen.value = false }
async function chooseDataset(id: string) { await selectDataset(id); sidebarOpen.value = false }
async function createSession() { await newSession(); sidebarOpen.value = false }
function importFile() { sidebarOpen.value = false; input.value?.click() }
function onEnter(event: KeyboardEvent) {
  if (!event.shiftKey && !event.isComposing && event.key === 'Enter') {
    event.preventDefault()
    if (canSend.value) void ask()
  }
}
</script>

<template>
  <div class="app-shell">
    <input ref="input" class="file-input" type="file" accept=".xlsx" tabindex="-1" :aria-label="t('fileInput')" @change="upload" />
    <aside class="sidebar" :aria-label="t('conversationsSidebar')"><ConversationSidebar :datasets="datasets" :current-id="current?.id" :sessions="sessions" :total="sessionsTotal" :busy="!!mutation" :importing="mutation === 'import'" :loading-more="sessionsLoading" :has-more-datasets="!!context && context.datasets.items.length < context.datasets.total" :datasets-loading="datasetsLoading" :selected-id="session?.id" @dataset="chooseDataset" @session="chooseSession" @create="createSession" @import="importFile" @more="loadMoreSessions" @more-datasets="loadMoreDatasets" /></aside>
    <Sheet v-model:open="sidebarOpen"><SheetContent side="left" class="mobile-sidebar"><SheetHeader><SheetTitle>{{ t('conversationsSidebar') }}</SheetTitle></SheetHeader><ConversationSidebar :datasets="datasets" :current-id="current?.id" :sessions="sessions" :total="sessionsTotal" :busy="!!mutation" :importing="mutation === 'import'" :loading-more="sessionsLoading" :has-more-datasets="!!context && context.datasets.items.length < context.datasets.total" :datasets-loading="datasetsLoading" :selected-id="session?.id" @dataset="chooseDataset" @session="chooseSession" @create="createSession" @import="importFile" @more="loadMoreSessions" @more-datasets="loadMoreDatasets" /></SheetContent></Sheet>

    <main class="main">
      <header class="page-header"><Button class="mobile-navigation" variant="outline" size="sm" @click="sidebarOpen = true">☰ {{ t('conversations') }}</Button><div class="header-title"><span class="eyebrow">{{ current?.name ?? t('brand') }}</span><h1>{{ session?.turnCount ? session.title : t('newConversationTitle') }}</h1></div><Button variant="ghost" size="sm" :disabled="loading || !!mutation" @click="refresh()">{{ t('refresh') }}</Button></header>
      <section v-if="error" class="error-banner" role="alert"><div><strong>{{ t('errorTitle') }}</strong><p>{{ error }}</p><ul v-if="issues.length"><li v-for="issue in issues" :key="`${issue.row}-${issue.message}`">{{ t('validationRow', issue) }}</li></ul></div><Button variant="ghost" size="sm" @click="clearError">{{ t('close') }}</Button></section>
      <p v-if="runtime?.status === 'ready'" class="muted" role="status">{{ t('runtimeReady', {version: runtime.pythonVersion ?? ''}) }}</p>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <section v-if="current" class="dataset-metrics" :aria-label="t('datasetOverview')">
        <div><span>{{ t('datasetRows') }}</span><strong>{{ current.rowCount }} <small>{{ t('rows') }}</small></strong></div>
        <div><span>{{ t('totalAmount') }}</span><strong class="amount">¥ {{ formatMoney(current.amount) }}</strong></div>
        <div><span>{{ t('coverage') }}</span><strong class="coverage">{{ current.firstAt.slice(0,10) }} — {{ current.lastAt.slice(0,10) }}</strong></div>
      </section>
      <div v-if="loading && !context" class="initial-loading" role="status"><span class="activity-ring" aria-hidden="true"></span>{{ t('loading') }}</div>
      <section v-else-if="!context" class="welcome"><h2>{{ t('loadFailed') }}</h2><p>{{ t('loadFailedHint') }}</p></section>
      <section v-else-if="!current" class="welcome"><span class="welcome-mark" aria-hidden="true">↗</span><h2>{{ t('intro') }}</h2><p>{{ t('chatIntro') }}</p><Button :disabled="!!mutation" @click="input?.click()">{{ t('import') }}</Button></section>
      <template v-else>
        <Tabs v-model="tab" class="workspace-tabs" orientation="horizontal">
          <TabsList><TabsTrigger value="chat">{{ t('conversationTab') }}</TabsTrigger><TabsTrigger value="rows">{{ t('preview') }}</TabsTrigger></TabsList>
          <TabsContent value="chat" class="chat-content">
            <div ref="timeline" class="chat-timeline" role="log" :aria-label="t('conversationMessages')" aria-live="polite" @scroll="onScroll">
              <div v-if="hasOlder" class="older-messages"><Button variant="ghost" :disabled="olderLoading" @click="loadOlder">{{ olderLoading ? t('loading') : t('olderMessages') }}</Button></div>
              <section v-if="!turns.length" class="welcome conversation-welcome"><span class="welcome-mark" aria-hidden="true">↗</span><h2>{{ t('chatWelcome') }}</h2><p>{{ t('chatWelcomeHint') }}</p><div class="suggestions"><Button v-for="key in suggestions" :key="key" variant="outline" :disabled="!!mutation || !!dispatch" @click="ask(t(key))">{{ t(key) }}</Button></div></section>
              <article v-for="turn in turns" :key="turn.queryId" class="chat-turn" :data-query-id="turn.queryId">
                <div class="user-message"><span class="sr-only">{{ t('you') }}</span><p>{{ turn.question }}</p></div>
                <div class="assistant-message"><div class="assistant-byline"><span class="assistant-mark" aria-hidden="true">↗</span><strong>{{ t('assistantName') }}</strong></div>
                  <div v-if="isRunning(turn)" class="assistant-progress" role="status"><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{{ stageText(turn) }}</span></div>
                  <p v-else-if="turn.status === 'waiting_timeout' || turn.status === 'failed' || turn.replyStatus === 'unconfirmed' || turn.replyStatus === 'rejected'" class="turn-notice">{{ stageText(turn) }}</p>
                  <MessageText v-if="turn.reply" :text="turn.reply" />
                  <ChatAnswer :result="turn.result" :disabled="!!dispatch || !!mutation" @evidence="loadEvidence" @account="id => ask(t('clarifyPrompt', {account: id}))" />
                  <Button v-if="turn.status === 'failed' && turn.replyStatus === 'rejected'" variant="ghost" size="sm" :disabled="!!dispatch || !!mutation" @click="ask(turn.question)">{{ t('retry') }}</Button>
                </div>
              </article>
            </div>
            <div v-if="!nearBottom && turns.length" class="scroll-bottom"><Button variant="outline" size="sm" @click="scrollBottom">{{ t('scrollToLatest') }} ↓</Button></div>
          </TabsContent>
          <TabsContent value="rows" class="rows-content"><Transactions v-if="preview" :data="preview" :loading="previewLoading" @page="loadPreview" /><p v-else role="status">{{ t('loading') }}</p></TabsContent>
        </Tabs>
        <footer class="composer-area">
          <p v-if="dispatch?.sessionId === session?.id && dispatch?.phase === 'restoring'" class="composer-hint" role="status">{{ t('restoringConversation') }}</p>
          <p v-if="otherReplying" class="composer-hint" role="status">{{ t('otherConversationReplying') }}</p>
          <form class="composer" @submit.prevent="canSend && ask()">
            <label for="funds-question" class="sr-only">{{ t('questionLabel') }}</label>
            <Textarea id="funds-question" v-model="question" :placeholder="t('chatPlaceholder')" :maxlength="1000" :disabled="!!mutation || !session" @keydown="onEnter" />
            <div class="composer-actions"><span class="muted">{{ t('composerHint') }}</span><Button type="button" :disabled="!canSend" :aria-label="t('sendMessage')" @click="ask()"><span v-if="dispatch?.sessionId === session?.id" class="activity-ring" aria-hidden="true"></span><span v-else aria-hidden="true">↑</span>{{ dispatch?.sessionId === session?.id ? t('processing') : t('sendMessage') }}</Button></div>
          </form>
          <p class="composer-footnote">{{ t('notIncome') }} · {{ t('contextHint') }}</p>
        </footer>
      </template>
    </main>
    <Dialog v-model:open="evidenceOpen"><DialogContent class="evidence-dialog"><DialogHeader><DialogTitle>{{ t('evidence') }}</DialogTitle><DialogDescription>{{ t('sourceFile') }}：{{ evidenceResult?.dataset?.name }} · {{ t('sourceRow') }}</DialogDescription></DialogHeader><Transactions v-if="evidenceResult?.evidence" :data="evidenceResult.evidence" :loading="evidenceLoading" @page="page => evidenceResult && loadEvidence(evidenceResult, page)" /><DialogFooter><Button variant="outline" @click="evidenceOpen = false">{{ t('close') }}</Button></DialogFooter></DialogContent></Dialog>
  </div>
</template>
