<script setup lang="ts">
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Button
} from '@xpert-ai/plugin-shadcn-vue'
import type { Page, Transfer } from '../shared/contracts.js'
import { t, formatMoney } from './i18n.js'
defineProps<{ data: Page<Transfer>; loading?: boolean }>()
defineEmits<{ page: [page: number] }>()
</script>
<template>
  <div class="transaction-table">
    <Table>
      <TableHeader
        ><TableRow
          ><TableHead>{{ t('time') }}</TableHead
          ><TableHead>{{ t('payer') }}</TableHead
          ><TableHead>{{ t('payee') }}</TableHead
          ><TableHead class="number">{{ t('amount') }}</TableHead
          ><TableHead>{{ t('summary') }}</TableHead
          ><TableHead class="number">{{ t('sourceRow') }}</TableHead></TableRow
        ></TableHeader
      >
      <TableBody>
        <TableRow v-for="row in data.items" :key="row.transactionId">
          <TableCell
            ><span class="nowrap">{{ row.time }}</span
            ><small>{{ row.transactionId }}</small></TableCell
          >
          <TableCell
            >{{ row.payerName }}<small>{{ row.payerAccount }}</small></TableCell
          >
          <TableCell
            >{{ row.payeeName }}<small>{{ row.payeeAccount }}</small></TableCell
          >
          <TableCell class="number amount">{{ formatMoney(row.amount) }}</TableCell
          ><TableCell>{{ row.summary || '—' }}</TableCell
          ><TableCell class="number">{{ row.sourceRow }}</TableCell>
        </TableRow>
        <TableRow v-if="!data.items.length"
          ><TableCell :colspan="6" class="empty-table">{{ t('emptyRows') }}</TableCell></TableRow
        >
      </TableBody>
    </Table>
    <div class="pagination">
      <span>{{ t('page', { page: data.page, total: data.total }) }}</span>
      <div>
        <Button
          variant="outline"
          size="sm"
          :disabled="loading || data.page <= 1"
          @click="$emit('page', data.page - 1)"
          >{{ t('previous') }}</Button
        ><Button
          variant="outline"
          size="sm"
          :disabled="loading || data.page * data.pageSize >= data.total"
          @click="$emit('page', data.page + 1)"
          >{{ t('next') }}</Button
        >
      </div>
    </div>
  </div>
</template>
