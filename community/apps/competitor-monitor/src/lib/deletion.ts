// 关联删除：校验范围与选择，生成受影响数据预览，确认后在同一事务中按依赖顺序删除。
import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { In, type EntityManager } from 'typeorm'
import { Advice, CollectionRound, MonitorChange, MonitorItem, Snapshot } from './entities.js'
import type { Scope } from './service.js'

export type DeleteTarget = 'items' | 'rounds' | 'changes' | 'advice' | 'all'
export type DeleteRequest = { target: DeleteTarget; ids: string[]; confirmation?: string }
// 边界校验：类型必须受支持；普通删除必须选择记录，全量清空不接受额外 ID。
export function parseDeleteRequest(value: Record<string, unknown>): DeleteRequest {
  if (!['items', 'rounds', 'changes', 'advice', 'all'].includes(String(value.target))) throw new BadRequestException('请选择有效的删除类型')
  const target = value.target as DeleteTarget
  if (!Array.isArray(value.ids) || value.ids.length > 200 || value.ids.some(id => typeof id !== 'string' || !id || id.length > 500)) throw new BadRequestException('删除记录参数无效')
  const ids = [...new Set(value.ids as string[])]
  if (target === 'all' ? ids.length !== 0 : ids.length === 0) throw new BadRequestException('请选择需要删除的记录')
  if (value.confirmation !== undefined && typeof value.confirmation !== 'string') throw new BadRequestException('删除确认无效')
  return { target, ids, confirmation: value.confirmation as string | undefined }
}

// Called under the service's exclusive scope guard. All five deletions commit or roll back together.
export async function deleteScopedRecords(manager: EntityManager, scope: Scope, request: DeleteRequest) {
  if (!scope.tenantId || !scope.organizationId) throw new BadRequestException('请先选择组织，不能清空租户级数据')
  const where = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  const rounds = await manager.find(CollectionRound, { where })
  if (rounds.some(round => round.status === 'running' || round.analysisStartedAt)) throw new BadRequestException('正在采集或分析，请等待任务完成后删除')
  const items = await manager.find(MonitorItem, { where })
  const changes = await manager.find(MonitorChange, { where })
  const advice = await manager.find(Advice, { where })
  const snapshots = await manager.find(Snapshot, { where })
  const selected = new Set(request.ids)
  const all = request.target === 'all'
  // 按商品 → 轮次 → 变化 → 建议推导关联影响，所有候选数据已限定到当前组织。
  const chosenItems = items.filter(row => all || request.target === 'items' && selected.has(row.id))
  const itemIds = new Set(chosenItems.map(row => row.itemId))
  const chosenRounds = rounds.filter(row => all || request.target === 'rounds' && selected.has(row.id))
  const roundIds = new Set(chosenRounds.map(row => row.id))
  const chosenChanges = changes.filter(row => all || itemIds.has(row.itemId) || roundIds.has(row.roundId) || request.target === 'changes' && selected.has(row.id))
  const changeIds = new Set(chosenChanges.map(row => row.id))
  const chosenAdvice = advice.filter(row => all || changeIds.has(row.changeId) || request.target === 'advice' && selected.has(row.id))
  const chosenSnapshots = snapshots.filter(row => all || itemIds.has(row.itemId) || roundIds.has(row.roundId))
  const groups = { items: chosenItems, rounds: chosenRounds, snapshots: chosenSnapshots, changes: chosenChanges, advice: chosenAdvice }
  if (request.target !== 'all' && groups[request.target].length !== selected.size) throw new BadRequestException('记录已删除或不属于当前组织，请刷新后重新选择')
  const counts = Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length]))
  // 摘要绑定范围、选择和当前受影响数据；确认期间记录发生变化时拒绝继续。
  const confirmation = createHash('sha256').update(JSON.stringify([scope, request.target, [...selected].sort(), Object.entries(groups).map(([key, rows]) => [key, [...rows].sort((a,b) => a.id.localeCompare(b.id))])])).digest('hex')
  if (request.confirmation === undefined) return { counts, confirmation, deleted: false }
  if (request.confirmation !== confirmation) throw new BadRequestException('数据已变化，请取消后重新确认删除范围')
  const remove = async (entity: typeof Advice | typeof MonitorChange | typeof Snapshot | typeof CollectionRound | typeof MonitorItem, ids: string[]) => {
    for (let offset = 0; offset < ids.length; offset += 200) await manager.delete(entity, { ...where, id: In(ids.slice(offset, offset + 200)) })
  }
  // 先删依赖项，再删上游记录；任一步失败由外层事务整体回滚。
  await remove(Advice, chosenAdvice.map(row => row.id))
  await remove(MonitorChange, chosenChanges.map(row => row.id))
  await remove(Snapshot, chosenSnapshots.map(row => row.id))
  await remove(CollectionRound, chosenRounds.map(row => row.id))
  await remove(MonitorItem, chosenItems.map(row => row.id))
  return { counts, deleted: true }
}
