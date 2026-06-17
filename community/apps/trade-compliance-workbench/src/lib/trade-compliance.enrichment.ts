import type { ProductEnrichmentInput, ProductEnrichmentResult } from './types.js'

const MOCK_ENRICHMENT = [
  {
    keywords: ['服务器', 'server', 'hpc-8208', 'hpc-7242'],
    hsCode: '8471499100',
    taxRefundRate: '13%',
    englishName: 'Server'
  },
  {
    keywords: ['数字计算机', 'computer'],
    hsCode: '8471501010',
    taxRefundRate: '13%',
    englishName: 'Digital Computer'
  }
]

export async function enrichProductWithFallback(input: ProductEnrichmentInput): Promise<ProductEnrichmentResult> {
  const text = [input.productName, input.model, input.description, input.hsCode].filter(Boolean).join(' ').toLowerCase()
  const match = MOCK_ENRICHMENT.find((record) => record.keywords.some((keyword) => text.includes(keyword.toLowerCase())))

  if (match) {
    return {
      source: 'mock',
      hsCode: input.hsCode ?? match.hsCode,
      taxRefundRate: match.taxRefundRate,
      englishName: match.englishName
    }
  }

  return {
    source: 'mock',
    hsCode: input.hsCode,
    englishName: toEnglishFallback(input.productName)
  }
}

function toEnglishFallback(productName: string | undefined) {
  if (!productName?.trim()) {
    return undefined
  }
  if (productName.includes('支架')) {
    return 'Customized Bracket'
  }
  return productName
}
