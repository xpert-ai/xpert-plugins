import { describe, expect, it } from 'vitest'
import {
  createAssessmentSchema,
  getMaterialSchema,
  materialNosSchema,
  reportFailureSchema,
  saveAnalysisSchema,
  searchBomParentsSchema
} from './ecn-impact.middleware'

/**
 * Tool schema contract tests. Following agent-tool-parameter-design.md:
 * the most natural payload a competent model would write must pass
 * validation on the first try; historical failure shapes must be rejected.
 */

describe('ecn_impact_create_assessment schema', () => {
  it('模型自然形态（只有变更描述与物料号）一次通过', () => {
    const natural = {
      materialNo: 'P-1003',
      changeType: 'material',
      changeDescription: '材料由 HT200 改为 HT250'
    }
    expect(createAssessmentSchema.safeParse(natural).success).toBe(true)
  })

  it('带 changeNo 与原因的完整形态通过', () => {
    expect(
      createAssessmentSchema.safeParse({
        changeNo: 'ECN-2026-015',
        materialNo: 'P-1003',
        materialName: '轴承座',
        changeType: 'material',
        changeDescription: '材料由 HT200 改为 HT250',
        changeReason: '常温强度不足',
        expectedEffectDate: '2026-12-01'
      }).success
    ).toBe(true)
  })

  it('未知字段被拒绝（strict）', () => {
    expect(
      createAssessmentSchema.safeParse({
        materialNo: 'P-1003',
        changeType: 'material',
        changeDescription: 'x',
        tenantId: 'hacked'
      }).success
    ).toBe(false)
  })

  it('changeType 枚举外的值被拒绝', () => {
    expect(
      createAssessmentSchema.safeParse({ materialNo: 'P-1003', changeType: 'color', changeDescription: 'x' }).success
    ).toBe(false)
  })
})

describe('ecn_impact_get_material schema', () => {
  it('materialNo 或 keyword 至少其一', () => {
    expect(getMaterialSchema.safeParse({ materialNo: 'P-1003' }).success).toBe(true)
    expect(getMaterialSchema.safeParse({ keyword: '轴承' }).success).toBe(true)
    expect(getMaterialSchema.safeParse({}).success).toBe(false)
  })
})

describe('ecn_impact_search_bom_parents schema', () => {
  it('maxDepth 限制在 1-3', () => {
    expect(searchBomParentsSchema.safeParse({ materialNo: 'P-1003' }).success).toBe(true)
    expect(searchBomParentsSchema.safeParse({ materialNo: 'P-1003', maxDepth: 2 }).success).toBe(true)
    expect(searchBomParentsSchema.safeParse({ materialNo: 'P-1003', maxDepth: 5 }).success).toBe(false)
  })
})

describe('材料集合 schema（routing/production/inventory 共用形状）', () => {
  it('1-10 个物料号', () => {
    expect(materialNosSchema.safeParse({ materialNos: ['P-1003'] }).success).toBe(true)
    expect(materialNosSchema.safeParse({ materialNos: ['P-1003', 'A-210', 'EA-200'] }).success).toBe(true)
    expect(materialNosSchema.safeParse({ materialNos: [] }).success).toBe(false)
    expect(
      materialNosSchema.safeParse({
        materialNos: Array.from({ length: 11 }, (_, i) => `M-${i}`)
      }).success
    ).toBe(false)
  })
})

describe('ecn_impact_save_analysis schema', () => {
  const natural = {
    assessmentId: 'a1',
    summary: '影响 1 个上层组件、2 张在制工单和 1 处库存',
    riskLevel: 'high',
    items: [
      {
        impactKey: 'bom:A-210',
        domain: 'bom',
        targetNo: 'A-210',
        impactDescription: '轴承座 2 件/台，需复核压装过盈量',
        suggestedAction: '复评压装公差',
        riskLevel: 'high',
        confidence: 0.9,
        evidence: { quantityPer: 2, relationPath: 'EA-200 > A-210 > P-1003' }
      },
      {
        impactKey: 'mo:MO-24001',
        domain: 'production',
        targetNo: 'MO-24001',
        impactDescription: '在制 200 件',
        suggestedAction: '评估返工'
      }
    ]
  }

  it('模型自然形态一次通过（无多余包装、无重复上下文字段）', () => {
    const result = saveAnalysisSchema.safeParse(natural)
    expect(result.success).toBe(true)
  })

  it('空 items 被拒绝', () => {
    expect(saveAnalysisSchema.safeParse({ ...natural, items: [] }).success).toBe(false)
  })

  it('同批重复 impactKey 不在 schema 层重复校验，由服务层幂等处理（数组元素允许相同 key 解析）', () => {
    // schema 不重复拒绝（服务层统一去重报错），但数组本身合法
    const dup = { ...natural, items: [natural.items[0], { ...natural.items[0]! }] }
    expect(saveAnalysisSchema.safeParse(dup).success).toBe(true)
  })

  it('confidence 越界被拒绝', () => {
    expect(
      saveAnalysisSchema.safeParse({
        ...natural,
        items: [{ ...natural.items[0]!, confidence: 1.5 }]
      }).success
    ).toBe(false)
  })

  it('items 超过 50 条被拒绝', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      impactKey: `k${i}`,
      domain: 'bom',
      targetNo: `T${i}`,
      impactDescription: 'x'
    }))
    expect(saveAnalysisSchema.safeParse({ ...natural, items }).success).toBe(false)
  })

  it('嵌套 item 的未知字段被拒绝', () => {
    expect(
      saveAnalysisSchema.safeParse({
        ...natural,
        items: [{ ...natural.items[0]!, tenantId: 'x' }]
      }).success
    ).toBe(false)
  })
})

describe('ecn_impact_report_analysis_failure schema', () => {
  it('reason 必填', () => {
    expect(reportFailureSchema.safeParse({ assessmentId: 'a1', reason: 'ERP 不可用' }).success).toBe(true)
    expect(reportFailureSchema.safeParse({ assessmentId: 'a1' }).success).toBe(false)
  })
})
