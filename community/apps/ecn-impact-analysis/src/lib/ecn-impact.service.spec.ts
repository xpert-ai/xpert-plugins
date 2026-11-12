import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { EcnImpactService, EcnImpactError } from './ecn-impact.service'
import { memoryRepo } from './testing/memory-repo'
import type { EcnScope } from './types'

const scope: EcnScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1'
}

const otherScope: EcnScope = {
  tenantId: 'tenant-2',
  organizationId: 'org-1',
  userId: 'user-9'
}

function buildService() {
  const service = new EcnImpactService(
    memoryRepo() as never,
    memoryRepo() as never,
    memoryRepo() as never
  )
  return { service }
}

const baseChange = {
  materialNo: 'P-1003',
  changeType: 'material' as const,
  changeDescription: '材料由 HT200 改为 HT250，常温强度不足'
}

describe('EcnImpactService 创建评估单', () => {
  it('创建评估单并按 changeNo 幂等去重', async () => {
    const { service } = buildService()
    const first = await service.createAssessment(scope, { changeNo: 'ECN-2026-015', ...baseChange })
    expect(first.created).toBe(true)
    expect(first.assessment.status).toBe('draft')

    const second = await service.createAssessment(scope, { changeNo: 'ECN-2026-015', ...baseChange })
    expect(second.created).toBe(false)
    expect(second.assessment.id).toBe(first.assessment.id)
  })

  it('同一 changeNo 在不同租户下是隔离的', async () => {
    const { service } = buildService()
    await service.createAssessment(scope, { changeNo: 'ECN-SHARED', ...baseChange })
    const other = await service.createAssessment(otherScope, { changeNo: 'ECN-SHARED', ...baseChange })
    expect(other.created).toBe(true)
  })

  it('changeNo 缺省时自动生成', async () => {
    const { service } = buildService()
    const { assessment, created } = await service.createAssessment(scope, { ...baseChange, changeNo: undefined })
    expect(created).toBe(true)
    expect(assessment.changeNo).toMatch(/^ECN-\d{8}-[0-9A-F]{4}$/)
  })
})

describe('EcnImpactService 保存 AI 分析（幂等）', () => {
  const items = [
    {
      impactKey: 'bom:A-210',
      domain: 'bom' as const,
      targetNo: 'A-210',
      impactDescription: '轴承座数量 2 件/台，需复核压装过盈量',
      suggestedAction: '复评压装公差'
    },
    {
      impactKey: 'mo:MO-24001',
      domain: 'production' as const,
      targetNo: 'MO-24001',
      impactDescription: '在制 200 件旧材料工件',
      suggestedAction: '评估返工或让步接收'
    }
  ]

  it('保存分析后状态变为 ai_completed，影响项落库', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-A', ...baseChange })
    const detail = await service.saveAnalysis(scope, {
      assessmentId: assessment.id!,
      summary: '影响 1 个上层组件与 1 张在制工单',
      riskLevel: 'high',
      items
    })
    expect(detail.status).toBe('ai_completed')
    expect(detail.itemCount).toBe(2)
    expect(detail.pendingCount).toBe(2)
    expect(detail.riskLevel).toBe('high')
  })

  it('重复保存相同 impactKey 不产生重复行（幂等）', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-B', ...baseChange })
    await service.saveAnalysis(scope, { assessmentId: assessment.id!, summary: '第一次', riskLevel: 'medium', items })
    const again = await service.saveAnalysis(scope, { assessmentId: assessment.id!, summary: '第二次', riskLevel: 'low', items })
    expect(again.items.length).toBe(2)
    expect(again.aiSummary).toBe('第二次')
  })

  it('人工已审核的影响项在重试时不被覆盖', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-C', ...baseChange })
    await service.saveAnalysis(scope, { assessmentId: assessment.id!, summary: '初版', riskLevel: 'medium', items })
    const withItems = await service.getAssessmentForAgent(scope, assessment.id!)
    const firstItem = withItems.items[0]!
    await service.reviewItem(scope, assessment.id!, firstItem.id, 'rejected', '材料强度已复核，无需处理', '王工')

    await service.saveAnalysis(scope, {
      assessmentId: assessment.id!,
      summary: '重试后的新结论',
      riskLevel: 'low',
      items: [{ ...items[0]!, impactDescription: '试图覆盖人工驳回结论' }, items[1]!]
    })

    const after = await service.getAssessmentForAgent(scope, assessment.id!)
    const rejected = after.items.find((item) => item.id === firstItem.id)!
    expect(rejected.status).toBe('rejected')
    expect(rejected.reviewNote).toBe('材料强度已复核，无需处理')
    expect(after.aiSummary).toBe('重试后的新结论')
    expect(after.retryCount).toBe(0)
  })

  it('重复 impactKey 的同批保存被拒绝', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-D', ...baseChange })
    await expect(
      service.saveAnalysis(scope, {
        assessmentId: assessment.id!,
        summary: 'bad',
        riskLevel: 'low',
        items: [items[0]!, { ...items[0]! }]
      })
    ).rejects.toMatchObject({ code: 'duplicate_impact_keys' })
  })

  it('已确认评估单不能被 AI 覆写', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-E', ...baseChange })
    await service.saveAnalysis(scope, { assessmentId: assessment.id!, summary: 's', riskLevel: 'low', items })
    // 人工审核全部通过后确认
    const detail = await service.getAssessmentForAgent(scope, assessment.id!)
    for (const item of detail.items) {
      await service.reviewItem(scope, assessment.id!, item.id, 'accepted', undefined, '李工')
    }
    await service.confirmAssessment(scope, assessment.id!, '李工')
    await expect(
      service.saveAnalysis(scope, { assessmentId: assessment.id!, summary: 'x', riskLevel: 'low', items })
    ).rejects.toMatchObject({ code: 'invalid_state' })
  })
})

describe('EcnImpactService 人工确认闭环', () => {
  async function prepare() {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-F', ...baseChange })
    await service.saveAnalysis(scope, {
      assessmentId: assessment.id!,
      summary: '两条影响项',
      riskLevel: 'high',
      items: [
        { impactKey: 'bom:A-210', domain: 'bom', targetNo: 'A-210', impactDescription: 'd1' },
        { impactKey: 'inv:R-3001', domain: 'inventory', targetNo: 'R-3001', impactDescription: 'd2' }
      ]
    })
    return { service, assessmentId: assessment.id! }
  }

  it('存在 pending 影响项时不能确认', async () => {
    const { service, assessmentId } = await prepare()
    await expect(service.confirmAssessment(scope, assessmentId, '王工')).rejects.toMatchObject({ code: 'pending_items' })
  })

  it('全部审核后确认成功并留痕，归档后闭环', async () => {
    const { service, assessmentId } = await prepare()
    const detail = await service.getAssessmentForAgent(scope, assessmentId)
    await service.reviewItem(scope, assessmentId, detail.items[0]!.id, 'accepted', undefined, '王工')
    await service.reviewItem(scope, assessmentId, detail.items[1]!.id, 'rejected', '在途毛坯需改签', '王工')
    const confirmed = await service.confirmAssessment(scope, assessmentId, '王工')
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.confirmedBy).toBe('王工')

    const closed = await service.closeAssessment(scope, assessmentId, '评估完成归档', '王工')
    expect(closed.status).toBe('closed')
    const logs = closed.logs.map((log) => log.type)
    expect(logs).toContain('confirmed')
    expect(logs).toContain('closed')
    expect(logs).toContain('item_rejected')
  })

  it('跨租户访问返回 assessment_not_found（不泄露存在性）', async () => {
    const { service, assessmentId } = await prepare()
    await expect(service.getAssessmentDetail(otherScope, assessmentId)).rejects.toMatchObject({
      code: 'assessment_not_found'
    })
  })
})

describe('EcnImpactService 失败上报与重试', () => {
  it('reportAnalysisFailure 记录原因并累加重试计数', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-G', ...baseChange })
    const failed = await service.reportAnalysisFailure(scope, assessment.id!, 'ERP 库存接口不可用')
    expect(failed.status).toBe('draft')
    expect(failed.lastError).toContain('ERP')
    expect(failed.retryCount).toBe(1)
    const failedAgain = await service.reportAnalysisFailure(scope, assessment.id!, '仍然失败')
    expect(failedAgain.retryCount).toBe(2)
  })

  it('recordRetry 累加并保留日志', async () => {
    const { service } = buildService()
    const { assessment } = await service.createAssessment(scope, { changeNo: 'ECN-H', ...baseChange })
    const retried = await service.recordRetry(scope, assessment.id!, '王工')
    expect(retried.retryCount).toBe(1)
    expect(retried.logs.some((log) => log.type === 'retry')).toBe(true)
  })
})

describe('EcnImpactService 视图数据', () => {
  it('getViewData 返回分页列表与选中详情', async () => {
    const { service } = buildService()
    const a = await service.createAssessment(scope, { changeNo: 'ECN-I', ...baseChange })
    await service.createAssessment(scope, { changeNo: 'ECN-J', materialNo: 'P-1004', changeType: 'dimension', changeDescription: '孔径收紧' })
    const view = await service.getViewData(scope, { selectionId: a.assessment.id })
    expect(view.total).toBe(2)
    expect(view.selected?.id).toBe(a.assessment.id)
    expect(view.selected?.changeNo).toBe('ECN-I')
  })

  it('错误异常带稳定 code，供前端本地化', async () => {
    const { service } = buildService()
    await expect(service.getAssessmentDetail(scope, 'missing-id')).rejects.toBeInstanceOf(EcnImpactError)
  })
})
