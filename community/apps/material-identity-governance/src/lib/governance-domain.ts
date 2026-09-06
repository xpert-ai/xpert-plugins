import { sourceSnapshotHash } from './source-snapshot.js'
import { extractMockDrawing } from './mock-drawings.js'
import type { GovernanceCase, RoleKey } from './contracts.js'
import {
  compareMaterial,
  normalizeAttribute,
  goldenIdentity,
} from './identity-rules.js'
import { projectFlow } from './flow-projector.js'
export function applyDomainStep(
  current: GovernanceCase,
  nodeKey: string,
  roleKey: RoleKey,
  now = new Date().toISOString(),
): GovernanceCase {
  const node = projectFlow(current).nodes.find((n) => n.key === nodeKey)
  if (
    !node ||
    !node.executable ||
    node.laneKey !== roleKey ||
    node.executionMode !== 'assistant_task'
  )
    throw new Error('node_not_executable')
  const next = structuredClone(current)
  let summary = ''
  switch (nodeKey) {
    case 'collect-evidence':
      if (sourceSnapshotHash(current) !== current.sourceSnapshotHash)
        throw new Error('source_snapshot_changed')
      summary = `已封存 ${next.materials.length} 条源物料记录及 ${next.evidence.length} 条证据；记录 PLM、ERP、WMS 来源和修订。`
      break
    case 'extract-drawing':
      for (const document of next.drawings) {
        const source = next.materials.find((m) => m.id === document.sourceId)
        const extracted = extractMockDrawing(document)
        if (
          !source ||
          extracted.length !== source.attributes.length ||
          extracted.some(
            (a) =>
              !source.attributes.some(
                (b) =>
                  a.key === b.key && a.value === b.value && a.unit === b.unit,
              ),
          )
        )
          throw new Error('drawing_attribute_mismatch')
      }
      if (next.materials.some((m) => !m.drawing || !m.attributes.length))
        throw new Error('drawing_evidence_incomplete')
      summary =
        '已从 Mock PLM 发布图纸的结构化标注提取材质、尺寸、公差相关属性，保留图号、版本、页码和字段来源。'
      break
    case 'normalize-material':
      next.materials = next.materials.map((m) => ({
        ...m,
        attributes: m.attributes.map(normalizeAttribute),
      }))
      summary = '已按类别规则归一计量单位与材质别名，保留原始证据。'
      break
    case 'match-identity': {
      const source = next.materials[0]
      if (!source) throw new Error('source_material_required')
      next.candidates = next.materials
        .slice(1)
        .map((m) => compareMaterial(source, m))
      summary = `已完成 ${next.candidates.length} 个候选的逐属性比对；${next.candidates.filter((c) => !c.hardFilterPassed).length} 个候选被关键属性规则否决。`
      break
    }
    case 'audit-conflicts': {
      next.criticalConflict = next.materials.some((a, i) =>
        next.materials
          .slice(i + 1)
          .some(
            (b) => a.code === b.code && !compareMaterial(a, b).hardFilterPassed,
          ),
      )
      summary = next.criticalConflict
        ? '确认同一编码绑定不同材质、尺寸及图号；生成隔离和拆分建议，未经审批不得改变采购与库存。'
        : '未发现同一码下关键属性不兼容；可继续评估身份映射。'
      break
    }
    case 'assess-impact':
      next.impacts = next.materials.flatMap((m, i) => [
        {
          system: 'WMS',
          reference: `INV-${m.id}`,
          type: 'inventory' as const,
          description: `${m.plant} ${m.name}`,
          quantity: m.quantity,
          amount: m.quantity * m.unitCost,
          action: next.criticalConflict
            ? '按图号核验批次，隔离混码库存，保留旧码追溯'
            : '保留本地库存编码，增加全局身份映射',
        },
        {
          system: 'MES',
          reference: `BOM-${m.drawing}-${m.id}`,
          type: 'bom' as const,
          description: `新能源乘用车 ${i === 0 ? 'A' : 'B'} 平台装配 BOM`,
          quantity: i === 0 ? 6 : 4,
          amount: 0,
          action: next.criticalConflict
            ? '审批后建立独立替换清单，不直接修改在制 BOM'
            : '引用统一物料身份，保留本地 BOM 编码',
        },
        {
          system: 'SRM',
          reference: `PO-260905-${i + 1}`,
          type: 'purchase' as const,
          description: `${m.supplier} 未交采购订单`,
          quantity: 400,
          amount: 400 * m.unitCost,
          action: next.criticalConflict
            ? '审批后阻止旧冲突码新增采购，订单按规格分流'
            : '采购描述归一，订单保持原编码',
        },
      ])
      summary = `完成 ${next.impacts.length} 项 BOM、库存及采购影响核对；涉及库存金额 ${next.materials.reduce((s, m) => s + m.quantity * m.unitCost, 0).toFixed(2)} 元。`
      break
    case 'propose-governance': {
      const same = next.candidates.some((c) => c.hardFilterPassed)
      const operation = next.criticalConflict
        ? 'split_identity'
        : same
          ? next.kind === 'drawing_request'
            ? 'reuse_existing'
            : 'map_aliases'
          : 'new_identity'
      const identities = next.materials.map(goldenIdentity)
      const goldenIds = [...new Set(identities)]
      summary =
        operation === 'split_identity'
          ? '为关键属性不同的物料建立独立全局身份，标记旧混码需管控；按图号保留批次、BOM 与历史采购追溯。'
          : operation === 'reuse_existing'
            ? '复用已存在的转向电机隔套物料身份，驳回重复建码需要，保留研发申请与图纸证据。'
            : operation === 'new_identity'
              ? '没有可合并的有效候选，为当前物料保留独立全局身份并完成建码审批。'
              : '将跨工厂本地编码映射到同一全局物料身份，各工厂合法本地编码继续保留。'
      next.proposal = {
        revision: 1,
        operation,
        summary,
        goldenIds,
        mappings: next.materials.map((m, i) => ({
          sourceId: m.id,
          localCode: m.code,
          plant: m.plant,
          goldenId: identities[i]!,
          relation:
            operation === 'split_identity' ? 'different' : 'local_alias',
        })),
        safeguards: [
          '人工审批绑定当前方案修订；证据变化后原批准失效。',
          '保留来源记录、历史编码及批次追溯，不直接重写已执行交易。',
          '关键属性冲突不允许合并，替代和版本继承必须独立建关系。',
          '仅发布到 Mock MDM / ERP；同一方案每个系统只确认一次。',
        ],
        evidenceIds: next.evidence.map((e) => e.id),
      }
      break
    }
    case 'publish-records':
      if (
        !next.proposal ||
        next.approval?.decision !== 'approved' ||
        next.approval.proposalRevision !== next.proposal.revision
      )
        throw new Error('approval_required')
      // Adapter acknowledgements must be persisted by the application service before this domain transition.
      if (
        next.publications.length < 2 ||
        next.publications.some((p) => p.status !== 'confirmed')
      )
        throw new Error('external_confirmation_required')
      summary =
        'Mock MDM 与 ERP 已确认黄金记录及编码映射。已保留历史来源、审批和各系统回执。'
      break
    default:
      throw new Error('unsupported_node')
  }
  next.artifacts.push({
    key: node.artifactKey!,
    revision: 1,
    status: 'accepted',
    roleKey,
    summary,
    evidenceIds: next.evidence.map((e) => e.id),
    at: now,
  })
  next.revision++
  next.updatedAt = now
  next.status =
    nodeKey === 'publish-records'
      ? 'completed'
      : nodeKey === 'propose-governance'
        ? 'review_required'
        : 'active'
  return next
}
