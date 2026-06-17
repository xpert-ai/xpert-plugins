import * as XLSX from 'xlsx'
import type {
  CustomsWorkbookBufferResult,
  CustomsWorkbookItem,
  CustomsWorkbookModel,
  CustomsWorkbookSource,
  TradeTemplateDefaults
} from './types.js'

const SHEET_NAMES = ['报关单', 'CI', 'Contract', 'PL']

export function buildCustomsWorkbookModel(
  source: CustomsWorkbookSource,
  defaults: TradeTemplateDefaults
): CustomsWorkbookModel {
  return {
    ...source,
    invoiceNo: source.invoiceNo ?? buildInvoiceNo(),
    sellerEnglishName: source.sellerEnglishName ?? defaults.sellerEnglishName,
    sellerEnglishAddress: source.sellerEnglishAddress ?? defaults.sellerEnglishAddress,
    paymentTerm: source.paymentTerm ?? defaults.paymentTerm,
    tradeTerm: source.tradeTerm ?? defaults.tradeTerm,
    origin: source.origin ?? defaults.origin,
    destination: source.destination ?? defaults.destination,
    packageType: source.packageType ?? defaults.packageType,
    supervisionMode: source.supervisionMode ?? defaults.supervisionMode,
    taxExemptionNature: source.taxExemptionNature ?? defaults.taxExemptionNature,
    domesticSourceLocation: source.domesticSourceLocation ?? defaults.domesticSourceLocation,
    bankBeneficiary: source.bankBeneficiary ?? defaults.bankBeneficiary,
    bankName: source.bankName ?? defaults.bankName,
    bankAddress: source.bankAddress ?? defaults.bankAddress,
    bankAccountNo: source.bankAccountNo ?? defaults.bankAccountNo,
    cnapsCode: source.cnapsCode ?? defaults.cnapsCode,
    swiftCode: source.swiftCode ?? defaults.swiftCode,
    exchangeRate: source.exchangeRate ?? defaults.exchangeRate,
    items: source.items ?? []
  }
}

export function createCustomsWorkbookBuffer(model: CustomsWorkbookModel): CustomsWorkbookBufferResult {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildDeclarationRows(model)), SHEET_NAMES[0])
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildCommercialInvoiceRows(model)), SHEET_NAMES[1])
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildSalesContractRows(model)), SHEET_NAMES[2])
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildPackingListRows(model)), SHEET_NAMES[3])

  return {
    fileName: `${sanitizeFilePart(model.invoiceNo)}-customs-workbook.xlsx`,
    sheetNames: [...SHEET_NAMES],
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
}

function buildDeclarationRows(model: CustomsWorkbookModel) {
  return [
    ['境内发货人', model.sellerName ?? model.sellerEnglishName ?? ''],
    ['境外收货人', model.buyerName ?? ''],
    ['合同协议号', model.contractNo ?? ''],
    ['监管方式', model.supervisionMode ?? ''],
    ['征免性质', model.taxExemptionNature ?? ''],
    ['包装种类', model.packageType ?? ''],
    ['项号', '商品编号', '商品名称及规格型号', '数量及单位', '单价', '总价', '境内货源地'],
    ...model.items.map((item, index) => [
      index + 1,
      item.hsCode ?? '',
      item.productName ?? item.englishName ?? '',
      formatQuantity(item),
      item.unitPrice ?? '',
      item.amount ?? '',
      model.domesticSourceLocation ?? ''
    ])
  ]
}

function buildCommercialInvoiceRows(model: CustomsWorkbookModel) {
  return [
    [model.sellerEnglishName ?? ''],
    [model.sellerEnglishAddress ?? ''],
    ['Commercial Invoice'],
    ['Buyer', model.buyerName ?? '', '', 'Seller', model.sellerEnglishName ?? ''],
    ['Address', model.buyerAddress ?? '', '', 'Invoice No.', model.invoiceNo],
    ['From', model.origin ?? '', '', 'Payment Term', model.paymentTerm ?? ''],
    ['To', model.destination ?? '', '', 'Contract No.', model.contractNo ?? ''],
    ['Item No.', 'Item', 'Description', 'QTY', 'UNIT PRICE', 'UNIT', 'RATE', 'AMOUNT', 'HS CODE'],
    ...model.items.map((item, index) => [
      index + 1,
      item.model ?? item.englishName ?? item.productName ?? '',
      item.description ?? '',
      item.quantity ?? '',
      item.unitPrice ?? '',
      item.unit ?? '',
      model.exchangeRate ?? '',
      item.amount ?? '',
      item.hsCode ?? ''
    ]),
    ['Total Amount(RMB)', '', '', '', '', '', totalAmount(model.items)]
  ]
}

function buildSalesContractRows(model: CustomsWorkbookModel) {
  return [
    [model.sellerEnglishName ?? ''],
    [model.sellerEnglishAddress ?? ''],
    ['Sales Contract'],
    ['Buyer', model.buyerName ?? '', '', 'Seller', model.sellerEnglishName ?? ''],
    ['Address', model.buyerAddress ?? '', '', 'Invoice No.', model.invoiceNo],
    ['From', model.origin ?? '', '', 'Payment Term', model.paymentTerm ?? ''],
    ['To', model.destination ?? '', '', 'Contract No.', model.contractNo ?? ''],
    ['Item No.', 'Item', 'Description', 'QTY', 'UNIT PRICE', 'UNIT', 'RATE', 'AMOUNT', 'HS CODE'],
    ...model.items.map((item, index) => [
      index + 1,
      item.model ?? item.englishName ?? item.productName ?? '',
      item.description ?? '',
      item.quantity ?? '',
      item.unitPrice ?? '',
      item.unit ?? '',
      model.exchangeRate ?? '',
      item.amount ?? '',
      item.hsCode ?? ''
    ])
  ]
}

function buildPackingListRows(model: CustomsWorkbookModel) {
  return [
    [model.sellerEnglishAddress ?? ''],
    ['PACKING LIST'],
    ['Ship to', model.buyerName ?? '', '', 'Seller', model.sellerEnglishName ?? ''],
    ['Country', model.destination ?? ''],
    ['Items', 'Model', 'Description', 'Qty', 'Unit', 'Ctn No', 'Dimension(mm)', 'NW(kg)', 'GW(kg)'],
    ...model.items.map((item) => [
      item.englishName ?? item.productName ?? '',
      item.model ?? '',
      item.description ?? '',
      item.quantity ?? '',
      item.unit ?? '',
      item.cartonNo ?? '',
      item.dimension ?? '',
      item.netWeight ?? '',
      item.grossWeight ?? ''
    ]),
    ['Total weight (KG)', '', '', '', '', '', '', sum(model.items, 'netWeight'), sum(model.items, 'grossWeight')]
  ]
}

function formatQuantity(item: CustomsWorkbookItem) {
  return [item.quantity, item.unit].filter((value) => value !== undefined && value !== '').join(' ')
}

function totalAmount(items: CustomsWorkbookItem[]) {
  return sum(items, 'amount')
}

function sum(items: CustomsWorkbookItem[], key: keyof CustomsWorkbookItem) {
  return items.reduce((total, item) => {
    const value = item[key]
    return typeof value === 'number' ? total + value : total
  }, 0)
}

function buildInvoiceNo() {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `INV-${yyyy}${mm}${dd}`
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}
