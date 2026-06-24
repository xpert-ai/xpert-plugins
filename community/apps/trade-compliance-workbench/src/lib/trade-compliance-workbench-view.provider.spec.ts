// @ts-nocheck
import { TradeComplianceWorkbenchViewProvider } from './trade-compliance-workbench-view.provider.js'
import { parseControlledGoodsText } from './controlled-goods-file-parser.js'
import {
  TRADE_COMPLIANCE_PROVIDER_KEY,
  TRADE_COMPLIANCE_VIEW_KEY
} from './constants.js'

describe('TradeComplianceWorkbenchViewProvider', () => {
  const createService = () => ({
    listReviewItems: jest.fn().mockResolvedValue([
      {
        id: 'item-1',
        type: 'supplier_product',
        title: 'HPC-8208',
        reviewStatus: 'pending',
        extractedData: {
          supplierName: '长城科技',
          productName: '服务器',
          model: 'HPC-8208',
          enrichedHsCode: '8471499100'
        },
        sourceLocation: 'supplier.docx'
      }
    ]),
    listControlledGoods: jest.fn().mockResolvedValue([
      { id: 'cg-1', productName: '特种泵', hsCode: '8413502090', enabled: true }
    ]),
    listProducts: jest.fn().mockResolvedValue([
      {
        id: 'prod-1',
        supplierName: '长城科技',
        productName: '服务器',
        model: 'HPC-8208',
        enrichedHsCode: '8471499100'
      }
    ]),
    listWorkbookGenerations: jest.fn().mockResolvedValue([
      { id: 'wb-1', fileName: '报关资料.xls', invoiceNo: 'INV-1' }
    ]),
    confirmReviewItem: jest.fn().mockResolvedValue({
      id: 'item-1',
      type: 'supplier_product',
      title: 'HPC-8208',
      confirmedData: { supplierName: '长城科技', productName: '服务器' }
    }),
    rejectReviewItem: jest.fn().mockResolvedValue({ id: 'item-1', reviewStatus: 'rejected' }),
    deleteReviewItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
    saveControlledGoods: jest.fn(),
    saveSupplierProduct: jest.fn().mockResolvedValue({ id: 'prod-2' })
  })

  it('returns a table manifest compatible with the new agent detail sidebar', () => {
    const provider = new TradeComplianceWorkbenchViewProvider(createService() as never)
    const manifests = provider.getViewManifests(
      { tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1', slots: [] } as never,
      'detail.sidebar'
    )

    expect(manifests).toHaveLength(1)
    expect(manifests[0]?.key).toBe(TRADE_COMPLIANCE_VIEW_KEY)
    expect(manifests[0]?.source.provider).toBe(TRADE_COMPLIANCE_PROVIDER_KEY)
    expect(manifests[0]?.slot).toBe('detail.sidebar')
    expect(manifests[0]?.view.type).toBe('table')
    expect(manifests[0]?.dataSource.querySchema).toEqual(expect.objectContaining({
      supportsPagination: true,
      supportsSearch: true,
      supportsSort: true
    }))
    expect(manifests[0]?.actions?.map((action) => action.key)).toEqual([
      'refresh',
      'confirm_review_item',
      'reject_review_item',
      'delete_review_item'
    ])
  })

  it('keeps the legacy workbench slots visible for older platform builds', () => {
    const provider = new TradeComplianceWorkbenchViewProvider(createService() as never)
    const manifests = provider.getViewManifests(
      { tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1', slots: [] } as never,
      'agent.workbench.main'
    )

    expect(manifests).toHaveLength(1)
    expect(manifests[0]?.slot).toBe('agent.workbench.main')
    expect(manifests[0]?.view.type).toBe('table')
  })

  it('returns flattened rows for the platform table renderer', async () => {
    const provider = new TradeComplianceWorkbenchViewProvider(createService() as never)
    const result = await provider.getViewData(
      { tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1', slots: [] } as never,
      TRADE_COMPLIANCE_VIEW_KEY,
      { page: 1, pageSize: 20 }
    )

    expect(result.total).toBe(1)
    expect(result.items?.[0]).toEqual(expect.objectContaining({
      id: 'item-1',
      recordKind: '审核记录',
      typeLabel: '供应商商品',
      statusLabel: '待审核',
      title: 'HPC-8208',
      supplierName: '长城科技',
      productName: '服务器',
      model: 'HPC-8208',
      hsCode: '8471499100',
      sourceLocation: 'supplier.docx'
    }))
  })

  it('uses targetId for new-platform row actions', async () => {
    const service = createService()
    const provider = new TradeComplianceWorkbenchViewProvider(service as never)

    const result = await provider.executeViewAction(
      { tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1', slots: [] } as never,
      TRADE_COMPLIANCE_VIEW_KEY,
      'reject_review_item',
      { targetId: 'item-1' }
    )

    expect(result.success).toBe(true)
    expect(service.rejectReviewItem).toHaveBeenCalledWith(expect.any(Object), 'item-1')
  })

  it('extracts controlled goods candidates from paged catalog text', () => {
    const result = parseControlledGoodsText([
      '-- 1 of 168 --',
      '一、监控化学品管理条例名录所列物项',
      '序号 商品名称 海关编码 单位',
      '1 氮芥气 HN1：N,N-二（2-氯乙基）乙胺 2921193000 千克',
      '2 氮芥气 HN2：N,N-二（2-氯乙基）甲胺',
      '2921194000 千克',
      '-- 2 of 168 --',
      '二、有关化学品及相关设备和技术',
      '3 三乙醇胺 2922150000 千克',
      '备注：以上商品以目录为准。'
    ].join('\n'))

    expect(result.candidates).toHaveLength(3)
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      sequence: '1',
      category: '一、监控化学品管理条例名录所列物项',
      hsCodes: ['2921193000'],
      sourceLocation: '第 1 页'
    }))
    expect(result.candidates[1]?.rawText).toContain('2921194000')
  })
})
