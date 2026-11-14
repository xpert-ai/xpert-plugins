/**
 * 请求列表：搜索框 + 状态筛选 + 表格 + 空状态引导语（产品设计 5.1 节）。
 * 搜索和筛选都交给服务端做（getViewData 的 search / parameters.status），界面只管把条件传过去。
 */
import * as React from 'react'
import {
  Input,
  Search,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@xpert-ai/plugin-shadcn-ui'
import type { Translate } from './i18n'
import type { RequestDto, RequestStatus } from './types'
import { StatusBadge } from './ui'

const STATUSES: RequestStatus[] = ['draft', 'analyzing', 'failed', 'pending_review', 'confirmed', 'rejected']
/** Select 不能用空字符串当选项值（空值表示显示占位符），所以“全部”用一个非空值，再映射成“不筛选” */
export const ALL_STATUSES = 'all'

export function ListFilters(props: {
  t: Translate
  search: string
  status: string
  onSearch: (value: string) => void
  onStatus: (value: string) => void
}) {
  const { t } = props
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('list.search')}
          placeholder={t('list.search')}
          className="pl-8"
          value={props.search}
          maxLength={40}
          onChange={(event) => props.onSearch(event.target.value)}
        />
      </div>
      <Select value={props.status} onValueChange={props.onStatus}>
        <SelectTrigger aria-label={t('list.statusFilter')} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES}>{t('list.statusAll')}</SelectItem>
          {STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(`status.${status}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function RequestTable(props: { items: RequestDto[]; selectedId: string | undefined; onSelect: (id: string) => void; t: Translate }) {
  const { items, selectedId, onSelect, t } = props
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('list.orderNo')}</TableHead>
          <TableHead>{t('list.customer')}</TableHead>
          <TableHead>{t('list.dates')}</TableHead>
          <TableHead>{t('list.status')}</TableHead>
          <TableHead className="text-right">{t('list.shortages')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            data-state={item.id === selectedId ? 'selected' : undefined}
            className="cursor-pointer"
            onClick={() => onSelect(item.id)}
          >
            <TableCell>
              {/* 用真正的按钮承载选中动作，键盘也能操作 */}
              <button
                type="button"
                className="font-medium underline-offset-4 hover:underline"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(item.id)
                }}
              >
                {item.orderNo}
              </button>
              <div className="text-xs text-muted-foreground">
                {item.productName} × {item.quantity}
              </div>
            </TableCell>
            <TableCell className="max-w-32 truncate">{item.customerName}</TableCell>
            <TableCell>
              <div>{item.targetDate}</div>
              <div className="text-xs text-muted-foreground">{item.originalDueDate}</div>
            </TableCell>
            <TableCell>
              <StatusBadge status={item.status} t={t} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{item.shortageCount ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
