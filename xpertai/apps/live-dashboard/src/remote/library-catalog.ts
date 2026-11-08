import type en from './locales/en.json'
export type CatalogKind = 'analysis-template' | 'visual-theme' | 'component'
export const categoryKeys = {
  growth: 'shellCategory_growth', channels: 'shellCategory_channels', customers: 'shellCategory_customers',
  conversion: 'shellCategory_conversion', risk: 'shellCategory_risk', regions: 'shellCategory_regions',
  operations: 'shellCategory_operations', decisions: 'shellCategory_decisions', business: 'shellCategory_business',
  minimal: 'shellCategory_minimal', tech: 'shellCategory_tech', creative: 'shellCategory_creative',
  retro: 'shellCategory_retro', editorial: 'shellCategory_editorial', light: 'shellCategory_light', dark: 'shellCategory_dark',
  data: 'shellCategory_data', filters: 'shellCategory_filters', charts: 'shellCategory_charts', layout: 'shellCategory_layout', scenes: 'shellCategory_scenes',
} as const satisfies Record<string, keyof typeof en>
export const catalogCategories: Record<CatalogKind, (keyof typeof categoryKeys)[]> = {
  'analysis-template': ['growth', 'channels', 'customers', 'conversion', 'risk', 'regions', 'operations', 'decisions'],
  'visual-theme': ['business', 'minimal', 'tech', 'creative', 'retro', 'editorial'],
  component: ['data', 'filters', 'charts', 'layout', 'scenes'],
}
