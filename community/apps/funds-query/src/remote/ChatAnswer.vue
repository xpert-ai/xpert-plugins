<script setup lang="ts">
import { Button, Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@xpert-ai/plugin-shadcn-vue'
import type { QueryResult } from '../shared/contracts.js'
import { t, formatMoney } from './i18n.js'
import ResultChart from './ResultChart.vue'
defineProps<{result: QueryResult; disabled?: boolean}>()
defineEmits<{evidence: [result: QueryResult]; account: [accountId: string]}>()
</script>
<template>
  <section v-if="result.status === 'completed'" class="answer-card" :aria-label="t('analysis')">
    <div class="answer-metrics">
      <div><span class="muted">{{ t(result.direction === 'out' ? 'payment' : result.direction === 'net' ? 'net' : 'receipt') }}</span><strong class="answer-amount">¥ {{ formatMoney(result.amount ?? '') }}</strong></div>
      <div><span class="muted">{{ t('transactions') }}</span><strong>{{ result.count }} <small>{{ t('rows') }}</small></strong></div>
    </div>
    <ResultChart v-if="result.kind === 'counterparties' || result.kind === 'trend'" :result="result" />
    <Accordion type="single" collapsible>
      <AccordionItem :value="`scope-${result.queryId}`">
        <AccordionTrigger>{{ t('scopeAndEvidence') }}</AccordionTrigger>
        <AccordionContent>
          <dl class="analysis-context">
            <div><dt>{{ t('accounts') }}</dt><dd>{{ result.accounts?.map(a => `${a.name} · ${a.accountId}`).join('、') || t('allAccounts') }}</dd></div>
            <div><dt>{{ t('period') }}</dt><dd>{{ result.window?.startInclusive && result.window?.endExclusive ? t('dateRange', {start: result.window.startInclusive.slice(0,10), end: result.window.endExclusive.slice(0,10)}) : t('allDates') }}</dd></div>
            <div v-if="result.plan?.minAmount || result.plan?.maxAmount"><dt>{{ t('amountCondition') }}</dt><dd><span v-if="result.plan.minAmount">{{ result.plan.minExclusive ? '>' : '≥' }} ¥ {{ formatMoney(result.plan.minAmount) }}</span><span v-if="result.plan.maxAmount"> {{ result.plan.maxExclusive ? '<' : '≤' }} ¥ {{ formatMoney(result.plan.maxAmount) }}</span></dd></div>
            <div v-if="result.plan?.counterpartyName || result.plan?.counterpartyAccountId"><dt>{{ t('counterparty') }}</dt><dd>{{ result.plan.counterpartyName ?? result.plan.counterpartyAccountId }}</dd></div>
          </dl>
          <p class="policy-note">{{ result.policy }}</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
    <div class="answer-actions"><Button variant="outline" size="sm" @click="$emit('evidence', result)">{{ t('viewEvidence') }}</Button><span class="muted">{{ t('sourceRowsAvailable') }}</span></div>
  </section>
  <section v-else-if="result.status === 'needs_clarification'" class="clarification">
    <p>{{ result.message }}</p>
    <div v-for="account in result.candidates" :key="account.accountId" class="account-choice">
      <div><strong>{{ account.name }}</strong><small>{{ account.accountId }}</small></div>
      <Button variant="outline" :disabled="disabled" @click="$emit('account', account.accountId)">{{ t('useAccount') }}</Button>
    </div>
  </section>
</template>
