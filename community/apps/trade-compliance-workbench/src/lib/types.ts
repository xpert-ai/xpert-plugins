export type TradeComplianceScope = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  assistantId?: string | null
  projectId?: string | null
  userId?: string | null
}

export type ReviewStatus = 'pending' | 'confirmed' | 'rejected' | 'needs_revision'
export type ReviewItemType = 'controlled_goods' | 'supplier_product' | 'customs_workbook'
export type ImportBatchType = 'controlled_goods_file' | 'supplier_contract' | 'sales_contract'
export type ControlledGoodsStatus = 'unchecked' | 'not_controlled' | 'suspected' | 'controlled'

export type ProductMatchInput = {
  productName?: string
  model?: string
  description?: string
  hsCode?: string
}

export type ControlledGoodsMatchCandidate = {
  id: string
  productName?: string
  hsCode?: string
  keywords?: string[]
  controlNote?: string
  enabled?: boolean
}

export type ControlledGoodsMatchReason = 'hs_code' | 'product_name' | 'keyword'

export type ControlledGoodsMatch = {
  controlledGoodsId: string
  productName?: string
  hsCode?: string
  controlNote?: string
  reason: ControlledGoodsMatchReason
  matchedValue: string
}

export type ControlledGoodsMatchResult = {
  status: ControlledGoodsStatus
  matches: ControlledGoodsMatch[]
  controlNote?: string
}

export type ProductEnrichmentInput = {
  productName?: string
  model?: string
  description?: string
  hsCode?: string
}

export type ProductEnrichmentResult = {
  source: 'mock' | 'api' | 'mcp'
  hsCode?: string
  taxRefundRate?: string
  englishName?: string
}

export type TradeTemplateDefaults = {
  sellerEnglishName?: string
  sellerEnglishAddress?: string
  phone?: string
  email?: string
  bankBeneficiary?: string
  bankName?: string
  bankAddress?: string
  bankAccountNo?: string
  cnapsCode?: string
  swiftCode?: string
  paymentTerm?: string
  tradeTerm?: string
  origin?: string
  destination?: string
  packageType?: string
  supervisionMode?: string
  taxExemptionNature?: string
  domesticSourceLocation?: string
  exchangeRate?: number
}

export type CustomsWorkbookItem = {
  productName?: string
  englishName?: string
  model?: string
  description?: string
  quantity?: number
  unit?: string
  unitPrice?: number
  amount?: number
  hsCode?: string
  cartonNo?: string
  dimension?: string
  netWeight?: number
  grossWeight?: number
}

export type CustomsWorkbookSource = {
  invoiceNo?: string
  contractNo?: string
  date?: string
  buyerName?: string
  buyerAddress?: string
  sellerName?: string
  sellerEnglishName?: string
  sellerEnglishAddress?: string
  paymentTerm?: string
  tradeTerm?: string
  origin?: string
  destination?: string
  currency?: string
  exchangeRate?: number
  packageType?: string
  supervisionMode?: string
  taxExemptionNature?: string
  domesticSourceLocation?: string
  bankBeneficiary?: string
  bankName?: string
  bankAddress?: string
  bankAccountNo?: string
  cnapsCode?: string
  swiftCode?: string
  items?: CustomsWorkbookItem[]
}

export type CustomsWorkbookModel = Required<Pick<CustomsWorkbookSource, 'invoiceNo'>> &
  Omit<CustomsWorkbookSource, 'invoiceNo'> & {
    sellerEnglishName?: string
    sellerEnglishAddress?: string
    paymentTerm?: string
    tradeTerm?: string
    origin?: string
    destination?: string
    exchangeRate?: number
    items: CustomsWorkbookItem[]
  }

export type CustomsWorkbookBufferResult = {
  fileName: string
  sheetNames: string[]
  buffer: Buffer
}
