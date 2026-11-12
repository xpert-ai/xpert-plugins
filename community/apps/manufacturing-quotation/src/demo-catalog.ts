import type { ProductRecord } from './business-rules.js'

// Synthetic values from the plugin's original catalog in c825568.
const products = [
  ['demo-elbow-25-a', '90°弯头', '25', 'a', 7, '0.103'],
  ['demo-elbow-25-A', '90°弯头', '25', 'A', 9, '0.117'],
  ['demo-elbow-25-b', '90°弯头', '25', 'b', 11, '0.145'],
  ['demo-tee-25-b', '三通', '25', 'b', 13, '1.07'],
  ['demo-tee-32-b', '三通', '32', 'b', 17, '1.53'],
  ['demo-coupling-25-b', '管箍', '25', 'b', 19, '0.98']
] as const

export const DEMO_PRODUCTS: ProductRecord[] = products.map(([
  id, productName, specification, priceMarker, packingQuantity, unitPrice
], index) => ({
  id, productName, specification, priceMarker, packingQuantity, unitPrice,
  sourceCategory: '玛钢', aliases: [], status: 'enabled',
  source: { file: 'synthetic-catalog', sheet: '玛钢数据', row: index + 1 }
}))
