import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { InvoiceRecord } from './entities/invoice-record.entity.js'
import { DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_TAX_NO } from './constants.js'
import type {
  CreateInvoiceRecordDto,
  InvoiceComplianceCheck,
  InvoiceParsedData,
  ParseInvoiceInput,
  ParseInvoiceOutput
} from './types.js'

@Injectable()
export class InvoiceReimbursementService {
  private inMemoryRecords: Map<string, InvoiceRecord> = new Map()

  constructor(
    @Optional()
    @InjectRepository(InvoiceRecord)
    private readonly invoiceRepo?: Repository<InvoiceRecord>
  ) {}

  /**
   * 智能发票文本提取与合规自检规则引擎
   */
  parseInvoiceText(input: ParseInvoiceInput): ParseInvoiceOutput {
    const rawText = (input.text || '').trim()
    const targetTaxNo = input.companyTaxNo || DEFAULT_COMPANY_TAX_NO
    const targetCompanyName = input.companyName || DEFAULT_COMPANY_NAME

    if (!rawText || rawText.length < 10) {
      return {
        success: false,
        error: '发票文本内容过短或为空，无法进行有效识别。'
      }
    }

    // 检查是否为完全无关的文本
    const containsInvoiceKeywords = /(发票|代码|号码|税|金额|合计|购买方|销售方|元|开票)/.test(rawText)
    if (!containsInvoiceKeywords) {
      return {
        success: false,
        error: '未在输入文本中检测到发票关键标识（缺少发票代码/号码/金额等要素）。'
      }
    }

    // 正则与特征抽取
    const invoiceCodeMatch = rawText.match(/(?:发票代码|代码)[:：\s]*([0-9]{10,12})/)
    const invoiceNumberMatch = rawText.match(/(?:发票号码|号码|NO)[:：\s]*([0-9]{8,12})/i)
    const dateMatch = rawText.match(/(?:开票日期|日期)[:：\s]*([0-9]{4}[-年/][0-9]{1,2}[-月/][0-9]{1,2})/)
    const buyerNameMatch = rawText.match(/(?:购买方名称|购买方|抬头)[:：\s]*([^\n\r,，;]+)/)
    const taxNoMatch = rawText.match(/(?:统一社会信用代码|纳税人识别号|税号)[:：\s]*([0-9A-Z]{15,20})/i)
    const sellerNameMatch = rawText.match(/(?:销售方名称|销售方|开票单位)[:：\s]*([^\n\r,，;]+)/)

    // 金额抽取
    const totalMatch = rawText.match(/(?:价税合计|小写|合计|总金额)[:：\s]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/)
    const pretaxMatch = rawText.match(/(?:不含税金额|金额)[:：\s]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/)
    const taxMatch = rawText.match(/(?:税额)[:：\s]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/)
    const taxRateMatch = rawText.match(/(?:税率)[:：\s]*([0-9]+%)/)

    // 确定数值
    let totalAmount = totalMatch ? parseFloat(totalMatch[1]) : 0
    let pretaxAmount = pretaxMatch ? parseFloat(pretaxMatch[1]) : 0
    let taxAmount = taxMatch ? parseFloat(taxMatch[1]) : 0
    let taxRate = taxRateMatch ? taxRateMatch[1] : '6%'

    // 若只提取到总金额，推导不含税与税额 (按6%常规税率估算)
    if (totalAmount > 0 && pretaxAmount === 0 && taxAmount === 0) {
      pretaxAmount = Math.round((totalAmount / 1.06) * 100) / 100
      taxAmount = Math.round((totalAmount - pretaxAmount) * 100) / 100
    } else if (totalAmount === 0 && pretaxAmount > 0) {
      totalAmount = Math.round((pretaxAmount + taxAmount) * 100) / 100
    }

    if (totalAmount <= 0 && pretaxAmount <= 0) {
      return {
        success: false,
        error: '未能识别到有效的金额数据，请核对票面内容。'
      }
    }

    // 智能推断品目分类
    let category = '差旅交通'
    if (/(餐饮|工作餐|美食|酒楼|火锅|咖啡)/.test(rawText)) {
      category = '餐饮招待'
    } else if (/(办公|耗材|文具|鼠标|键盘|纸张|打印)/.test(rawText)) {
      category = '办公耗材'
    } else if (/(软件|云服务|服务器|技术服务|订阅)/.test(rawText)) {
      category = '云服务/软件'
    }

    const buyerName = buyerNameMatch ? buyerNameMatch[1].trim() : targetCompanyName
    const buyerTaxNo = taxNoMatch ? taxNoMatch[1].trim() : ''

    // 执行合规性校验
    const isTaxNoMatched = Boolean(buyerTaxNo && buyerTaxNo.toUpperCase() === targetTaxNo.toUpperCase())
    const messages: string[] = []
    let riskLevel: 'PASS' | 'WARN' | 'FAIL' = 'PASS'
    let title = '合规自检通过'

    if (isTaxNoMatched) {
      messages.push(`购买方税号与公司档案完全匹配 (${targetTaxNo})`)
    } else if (buyerTaxNo) {
      riskLevel = 'WARN'
      title = '税号不匹配预警'
      messages.push(`识别税号 (${buyerTaxNo}) 与公司标准税号 (${targetTaxNo}) 不一致，请人工确认`)
    } else {
      riskLevel = 'WARN'
      title = '缺少购买方税号'
      messages.push(`未识别到购买方税号，请核对票面抬头完整性`)
    }

    // 品目特殊规则
    if (category === '餐饮招待') {
      riskLevel = 'WARN'
      title = '品目需补充材料'
      messages.push('餐饮招待品目根据财务报销制度，需随单附随行人员名单及业务招待说明')
    }

    // 计算平衡性校验
    const calcDiff = Math.abs(totalAmount - (pretaxAmount + taxAmount))
    if (calcDiff > 0.05) {
      messages.push(`价税合计 (¥${totalAmount}) 与 [不含税+税额] (¥${(pretaxAmount + taxAmount).toFixed(2)}) 存在计算差异`)
      if (riskLevel === 'PASS') {
        riskLevel = 'WARN'
        title = '金额核算微差提示'
      }
    } else {
      messages.push(`价税计算无误: ¥${pretaxAmount.toFixed(2)} + ¥${taxAmount.toFixed(2)} = ¥${totalAmount.toFixed(2)}`)
    }

    const compliance: InvoiceComplianceCheck = {
      isTaxNoMatched,
      riskLevel,
      title,
      messages
    }

    const data: InvoiceParsedData = {
      invoiceCode: invoiceCodeMatch ? invoiceCodeMatch[1] : '011002300111',
      invoiceNumber: invoiceNumberMatch ? invoiceNumberMatch[1] : `${Date.now()}`.slice(-8),
      issueDate: dateMatch ? dateMatch[1].replace(/[年月日/]/g, '-') : new Date().toISOString().slice(0, 10),
      buyerName,
      buyerTaxNo: buyerTaxNo || targetTaxNo,
      sellerName: sellerNameMatch ? sellerNameMatch[1].trim() : '开票销售方有限公司',
      pretaxAmount,
      taxRate,
      taxAmount,
      totalAmount,
      category,
      department: '研发中心',
      compliance
    }

    return {
      success: true,
      data
    }
  }

  /**
   * 保存或更新发票台账记录
   */
  async createInvoiceRecord(
    dto: CreateInvoiceRecordDto,
    tenantId = 'default',
    organizationId = 'default'
  ): Promise<InvoiceRecord> {
    const record: InvoiceRecord = {
      id: `INV-${Date.now().toString().slice(-6)}`,
      tenantId,
      organizationId,
      invoiceCode: dto.invoiceCode,
      invoiceNumber: dto.invoiceNumber,
      issueDate: dto.issueDate,
      buyerName: dto.buyerName,
      buyerTaxNo: dto.buyerTaxNo,
      sellerName: dto.sellerName,
      pretaxAmount: Number(dto.pretaxAmount || 0),
      taxRate: dto.taxRate || '6%',
      taxAmount: Number(dto.taxAmount || 0),
      totalAmount: Number(dto.totalAmount || 0),
      category: dto.category || '差旅交通',
      department: dto.department || '研发中心',
      remark: dto.remark || '',
      rawText: dto.rawText || '',
      compliance: dto.compliance || {
        isTaxNoMatched: true,
        riskLevel: 'PASS',
        title: '已通过预审',
        messages: ['人工审核入库']
      },
      status: dto.status || 'CONFIRMED',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    if (this.invoiceRepo) {
      try {
        const saved = await this.invoiceRepo.save(record)
        this.inMemoryRecords.set(saved.id || record.id!, saved)
        return saved
      } catch (err) {
        console.warn('[InvoiceReimbursementService] Database save failed, falling back to memory store:', err)
      }
    }

    this.inMemoryRecords.set(record.id!, record)
    return record
  }

  /**
   * 获取台账列表
   */
  async listInvoiceRecords(tenantId = 'default', organizationId = 'default'): Promise<InvoiceRecord[]> {
    if (this.invoiceRepo) {
      try {
        const records = await this.invoiceRepo.find({
          order: { createdAt: 'DESC' }
        })
        if (records && records.length > 0) {
          return records
        }
      } catch (err) {
        console.warn('[InvoiceReimbursementService] Database find failed, using memory store:', err)
      }
    }

    // 返回内存中存储的记录（包含默认初始种子数据）
    if (this.inMemoryRecords.size === 0) {
      this.initSeedData()
    }

    return Array.from(this.inMemoryRecords.values()).sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    )
  }

  /**
   * 按 ID 获取发票记录详情
   */
  async getInvoiceRecordById(id: string): Promise<InvoiceRecord | null> {
    if (this.invoiceRepo) {
      try {
        const item = await this.invoiceRepo.findOne({ where: { id } })
        if (item) return item
      } catch {
        // fallback to memory
      }
    }
    return this.inMemoryRecords.get(id) || null
  }

  /**
   * 初始化预置样本数据（确保开箱即可演示台账回溯）
   */
  private initSeedData(): void {
    const seed1: InvoiceRecord = {
      id: 'INV-102501',
      tenantId: 'default',
      organizationId: 'default',
      invoiceCode: '011002300111',
      invoiceNumber: '89432190',
      issueDate: '2026-10-25',
      buyerName: DEFAULT_COMPANY_NAME,
      buyerTaxNo: DEFAULT_COMPANY_TAX_NO,
      sellerName: '滴滴出行科技有限公司',
      pretaxAmount: 94.34,
      taxRate: '6%',
      taxAmount: 5.66,
      totalAmount: 100.0,
      category: '差旅交通',
      department: '研发中心 - 架构组',
      remark: '客户现场架构评审往返出租车',
      compliance: {
        isTaxNoMatched: true,
        riskLevel: 'PASS',
        title: '合规自检通过',
        messages: ['购买方抬头与税号完全匹配', '金额与税额校验正确']
      },
      status: 'CONFIRMED',
      createdAt: new Date(Date.now() - 86400000 * 2),
      updatedAt: new Date(Date.now() - 86400000 * 2)
    }

    const seed2: InvoiceRecord = {
      id: 'INV-102802',
      tenantId: 'default',
      organizationId: 'default',
      invoiceCode: '011002400222',
      invoiceNumber: '45678912',
      issueDate: '2026-10-28',
      buyerName: DEFAULT_COMPANY_NAME,
      buyerTaxNo: DEFAULT_COMPANY_TAX_NO,
      sellerName: '北京某某餐饮有限公司',
      pretaxAmount: 366.04,
      taxRate: '6%',
      taxAmount: 21.96,
      totalAmount: 388.0,
      category: '餐饮招待',
      department: '市场销售部',
      remark: '业务洽谈工作餐',
      compliance: {
        isTaxNoMatched: true,
        riskLevel: 'WARN',
        title: '品目需补充合规证明',
        messages: ['税号完全一致', '餐饮品目根据财务制度需附随行人员名单与招待说明']
      },
      status: 'CONFIRMED',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000)
    }

    this.inMemoryRecords.set(seed1.id!, seed1)
    this.inMemoryRecords.set(seed2.id!, seed2)
  }
}
