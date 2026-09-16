import { Injectable } from '@nestjs/common'
import type {
  ClauseRiskItem,
  ContractAuditRecord,
  ContractAuditorScope,
  WorkbenchData
} from './types.js'

export const SAMPLE_CONTRACTS = [
  {
    title: '企业硬件设备定制采购协议（含典型霸王条款样例）',
    content: `第一条 货物与交付
乙方须在合同签订后10日内完成全部定制硬件交付。因任何原因（包括不可抗力、原材料短缺等）导致延期交付的，乙方每日须向甲方支付相当于合同总价款5%的违约金；逾期超过3日，甲方有权单方解除合同，乙方须退还全部已收款项并支付合同总额50%的惩罚性违约金。

第二条 验收与付款
甲方在收到全部货物后享有长达180日的验收期。在甲方出具正式无保留最终合格验收书之前，甲方无需支付任何款项。若验收期内因任何技术瑕疵导致甲方不满，甲方有权无限期顺延付款且不承担逾期付款违约责任。

第三条 知识产权与成果归属
在履行本合同过程中产生的所有技术方案、设计图纸、软件代码及衍生知识产权，无论是否由乙方独立研发或出资，其全部知识产权及衍生权益均自产生之日起无偿且排他性地永久归属甲方所有。

第四条 责任免除与限制
甲方在任何情况下均不对乙方的任何间接损失、利润损失或商业机会损失承担责任。因甲方指令失误或现场配合不当导致乙方损失的，甲方累计赔偿限额不超过人民币100元。

第五条 争议管辖
本合同履行过程中发生争议的，双方应协商解决；协商不成的，任何一方必须向甲方所在地有管辖权的人民法院提起诉讼，乙方放弃任何管辖权异议权利。`
  },
  {
    title: '软件系统定制开发委托合同（风险样例）',
    content: `第一条 需求变更与开发周期
甲方可随时提出业务需求变更，乙方须无条件免费响应该等变更并于3日内交付上线，不得以此为由顺延开发交付期限或主张增加开发费用。

第二条 违约赔偿责任
如乙方交付之系统存在任何缺陷或偶发Bug，乙方须按合同总金额的30%向甲方支付违约赔偿金，并全额赔偿甲方预期的所有商业利润损失。

第三条 单方解除权
在合同履行全过程中，甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用。`
  }
]

@Injectable()
export class ContractRiskAuditorService {
  private readonly records = new Map<string, ContractAuditRecord>()

  constructor() {
    this.initDefaultRecords()
  }

  private initDefaultRecords() {
    const sample = SAMPLE_CONTRACTS[0]
    const initialRecord: ContractAuditRecord = {
      id: 'demo-contract-1',
      title: sample.title,
      originalContent: sample.content,
      revisedContent: sample.content,
      risks: this.analyzeContractText(sample.content),
      summary: '检测到 4 项高危合规风险（含过高违约金50%、不合理单方免责、知识产权不当归属及异地管辖陷阱），建议采纳修订条款。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.records.set(initialRecord.id, initialRecord)
  }

  analyzeContractText(content: string): ClauseRiskItem[] {
    const risks: ClauseRiskItem[] = []

    // 1. 违约金过高排查
    if (content.includes('50%') || content.includes('30%') || content.includes('惩罚性违约金') || content.includes('总价款5%')) {
      const matchText = content.includes('支付合同总额50%的惩罚性违约金')
        ? '支付合同总额50%的惩罚性违约金'
        : '按合同总金额的30%向甲方支付违约赔偿金'
      risks.push({
        id: 'risk-liquidated-damages',
        originalText: matchText,
        category: '违约金责任过重',
        riskLevel: 'HIGH',
        riskAnalysis: '约定违约金高达合同总额的30%~50%，根据《民法典》第五百八十五条，约定的违约金超过造成损失的百分之三十的，当事人可以请求人民法院或者仲裁机构予以适当减少。该条款严重加重乙方履约风险。',
        suggestedRevision: '按照实际直接损失赔偿，违约金上限不超过迟延履行部分金额的10%',
        status: 'PENDING'
      })
    }

    // 2. 知识产权不平等归属
    if (content.includes('无论是否由乙方独立研发') || content.includes('无偿且排他性地永久归属甲方')) {
      risks.push({
        id: 'risk-ip-ownership',
        originalText: '无论是否由乙方独立研发或出资，其全部知识产权及衍生权益均自产生之日起无偿且排他性地永久归属甲方所有',
        category: '知识产权侵夺',
        riskLevel: 'HIGH',
        riskAnalysis: '剥夺了乙方对其在合同签订前已拥有的背景知识产权（Background IP）以及独立研发成果的合法权益，存在资产流失法律风险。',
        suggestedRevision: '乙方为本项目独立研发或原有的基础技术成果知识产权仍归乙方所有；针对甲方特定业务定制开发的成果，知识产权归甲方所有',
        status: 'PENDING'
      })
    }

    // 3. 验收及付款无限期拖延
    if (content.includes('180日的验收期') || content.includes('无限期顺延付款')) {
      risks.push({
        id: 'risk-acceptance-delay',
        originalText: '享有长达180日的验收期。在甲方出具正式无保留最终合格验收书之前，甲方无需支付任何款项。若验收期内因任何技术瑕疵导致甲方不满，甲方有权无限期顺延付款',
        category: '付款验收陷阱',
        riskLevel: 'MEDIUM',
        riskAnalysis: '验收周期过长且赋权甲方无限期顺延付款，缺乏客观检验标准与默认验收条款，将导致应收账款严重逾期。',
        suggestedRevision: '自货物送达之日起15个工作日内完成验收。逾期未提出书面异议的，视为验收合格，甲方应按约定节点支付相应款项',
        status: 'PENDING'
      })
    }

    // 4. 甲方免责过大/权利义务失衡
    if (content.includes('赔偿限额不超过人民币100元') || content.includes('无需任何理由随时单方通知乙方立即终止')) {
      risks.push({
        id: 'risk-unilateral-exemption',
        originalText: content.includes('赔偿限额不超过人民币100元')
          ? '甲方累计赔偿限额不超过人民币100元'
          : '甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用',
        category: '权利义务严重不对等',
        riskLevel: 'HIGH',
        riskAnalysis: '单方实质免除己方重大过错责任或享有无责任解除权，违反公平原则，属于显失公平的霸王条款。',
        suggestedRevision: '任何一方因违约导致合同解除的，应赔偿守约方由此遭受的实际直接损失，赔偿总额以该批次货物或服务对应合同金额为限',
        status: 'PENDING'
      })
    }

    // 5. 争议管辖不利
    if (content.includes('甲方所在地有管辖权的人民法院') && content.includes('放弃任何管辖权异议')) {
      risks.push({
        id: 'risk-jurisdiction',
        originalText: '任何一方必须向甲方所在地有管辖权的人民法院提起诉讼，乙方放弃任何管辖权异议权利',
        category: '争议管辖偏向',
        riskLevel: 'LOW',
        riskAnalysis: '限定由甲方所在地法院管辖并强行排除异议，对我方异地应诉成本较高。',
        suggestedRevision: '双方协商不成时，向被告所在地或合同履行地人民法院提起诉讼',
        status: 'PENDING'
      })
    }

    return risks
  }

  async listRecords(_scope: ContractAuditorScope): Promise<ContractAuditRecord[]> {
    return Array.from(this.records.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  async getRecord(_scope: ContractAuditorScope, id: string): Promise<ContractAuditRecord | undefined> {
    return this.records.get(id)
  }

  async auditContract(
    scope: ContractAuditorScope,
    id: string,
    content: string,
    title?: string
  ): Promise<ContractAuditRecord> {
    const existing = this.records.get(id)
    const risks = this.analyzeContractText(content)
    const summary = risks.length > 0
      ? `检测完成：共发现 ${risks.length} 处合同风险项（${risks.filter(r => r.riskLevel === 'HIGH').length} 项高危），已生成防违约修订建议。`
      : '审查完毕：该文本未检测到明显霸王条款或重大违约漏洞，整体合规风险较低。'

    const record: ContractAuditRecord = {
      id: id || `contract-${Date.now()}`,
      title: title || existing?.title || `采购合同审查单 (${new Date().toLocaleDateString()})`,
      originalContent: content,
      revisedContent: content,
      risks,
      summary,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    this.records.set(record.id, record)
    return record
  }

  async acceptRevision(
    _scope: ContractAuditorScope,
    recordId: string,
    riskId: string
  ): Promise<ContractAuditRecord> {
    const record = this.records.get(recordId)
    if (!record) {
      throw new Error(`未找到审查单记录: ${recordId}`)
    }

    const risk = record.risks.find(r => r.id === riskId)
    if (!risk) {
      throw new Error(`未找到风险项: ${riskId}`)
    }

    // 替换原句为建议修改
    if (record.revisedContent.includes(risk.originalText)) {
      record.revisedContent = record.revisedContent.replace(risk.originalText, risk.suggestedRevision)
    }
    risk.status = 'ACCEPTED'
    record.updatedAt = new Date().toISOString()
    this.records.set(recordId, record)
    return record
  }

  async ignoreRisk(
    _scope: ContractAuditorScope,
    recordId: string,
    riskId: string
  ): Promise<ContractAuditRecord> {
    const record = this.records.get(recordId)
    if (!record) {
      throw new Error(`未找到审查单记录: ${recordId}`)
    }

    const risk = record.risks.find(r => r.id === riskId)
    if (!risk) {
      throw new Error(`未找到风险项: ${riskId}`)
    }

    risk.status = 'IGNORED'
    record.updatedAt = new Date().toISOString()
    this.records.set(recordId, record)
    return record
  }

  async saveContract(
    _scope: ContractAuditorScope,
    record: ContractAuditRecord
  ): Promise<ContractAuditRecord> {
    record.updatedAt = new Date().toISOString()
    this.records.set(record.id, record)
    return record
  }

  async getWorkbenchData(
    scope: ContractAuditorScope,
    query?: { recordId?: string }
  ): Promise<WorkbenchData> {
    const records = await this.listRecords(scope)
    const targetId = query?.recordId || records[0]?.id
    const activeRecord = targetId ? this.records.get(targetId) : records[0]

    return {
      records,
      activeRecordId: activeRecord?.id,
      activeRecord,
      sampleContracts: SAMPLE_CONTRACTS
    }
  }
}
