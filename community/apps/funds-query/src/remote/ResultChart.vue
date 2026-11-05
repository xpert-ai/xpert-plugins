<script setup lang="ts">
import { computed } from 'vue'
import type { QueryResult } from '../shared/contracts.js'
import { t, formatMoney } from './i18n.js'
const props = defineProps<{ result: QueryResult }>()
const groups = computed(() => props.result.groups ?? [])
const maximum = computed(() => Math.max(...groups.value.map((g) => Math.abs(Number(g.amount))), 1))
const line = computed(() =>
  groups.value
    .map(
      (g, i) =>
        `${30 + (i * 680) / Math.max(groups.value.length - 1, 1)},${145 - (Number(g.amount) / maximum.value) * 105}`
    )
    .join(' ')
)
</script>
<template>
  <section class="result-chart" :aria-label="result.kind === 'trend' ? t('trend') : t('ranking')">
    <h3>{{ result.kind === 'trend' ? t('trend') : t('ranking') }}</h3>
    <template v-if="result.kind === 'trend' && groups.length">
      <svg viewBox="0 0 750 290" role="img" :aria-label="t('trend')">
        <line x1="30" y1="145" x2="710" y2="145" class="axis" />
        <polyline :points="line" class="trend-line" />
        <g v-for="(g, i) in groups" :key="g.label">
          <circle
            :cx="30 + (i * 680) / Math.max(groups.length - 1, 1)"
            :cy="145 - (Number(g.amount) / maximum) * 105"
            r="4"
            class="trend-point"
          >
            <title>{{ g.label }} · {{ formatMoney(g.amount) }}</title>
          </circle>
          <text
            v-if="groups.length <= 10 || i === 0 || i === groups.length - 1"
            :x="30 + (i * 680) / Math.max(groups.length - 1, 1)"
            y="270"
            text-anchor="middle"
          >
            {{ g.label }}
          </text>
        </g>
      </svg>
    </template>
    <div v-else class="bars">
      <div v-for="g in groups" :key="g.accountId ?? g.label" class="bar-row">
        <div class="bar-label">
          {{ g.label }}<small v-if="g.accountId">{{ g.accountId }}</small>
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: `${Math.max((Math.abs(Number(g.amount)) / maximum) * 100, 0.5)}%` }"
          ></div>
        </div>
        <span class="amount">{{ formatMoney(g.amount) }}</span>
      </div>
    </div>
    <p v-if="result.groupsTruncated" class="muted">{{ t('limited') }}</p>
  </section>
</template>
