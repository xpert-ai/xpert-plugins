export type ComplianceRiskLevel = 'PASS' | 'WARN' | 'FAIL'

export interface InvoiceComplianceCheck {
  isTaxNoMatched: boolean
  riskLevel: ComplianceRiskLevel
  title: string
  messages: string[]
}

export interface InvoiceParsedData {
  invoiceCode?: string
  invoiceNumber: string
  issueDate: string
  buyerName: string
  buyerTaxNo: string
  sellerName: string
  pretaxAmount: number
  taxRate: string
  taxAmount: number
  totalAmount: number
  category: string
  department?: string
  remark?: string
  compliance: InvoiceComplianceCheck
}

export interface CreateInvoiceRecordDto {
  rawText?: string
  invoiceCode?: string
  invoiceNumber: string
  issueDate: string
  buyerName: string
  buyerTaxNo: string
  sellerName: string
  pretaxAmount: number
  taxRate?: string
  taxAmount: number
  totalAmount: number
  category?: string
  department?: string
  remark?: string
  compliance?: InvoiceComplianceCheck
  status?: string
}

export interface InvoiceRecordVo extends CreateInvoiceRecordDto {
  id: string
  createdAt: string
  updatedAt: string
}

export interface ParseInvoiceInput {
  text: string
  companyName?: string
  companyTaxNo?: string
}

export interface ParseInvoiceOutput {
  success: boolean
  error?: string
  data?: InvoiceParsedData
}
