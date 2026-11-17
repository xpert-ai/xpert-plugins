export interface CategoryDefinition {
  id: string
  label: { en_US: string; zh_Hans: string }
  /** What belongs in this category. Shown to the model and to reviewers. */
  definition: string
}

/**
 * Self-authored category table for a facility issue-report desk.
 * Each acceptance run freezes these definitions alongside its prompts.
 */
export const CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'plumbing', label: { en_US: 'Plumbing and leaks', zh_Hans: '给排水与漏水' }, definition: 'Leaking pipes, taps, toilets, drains, water stains caused by an active leak.' },
  { id: 'electrical', label: { en_US: 'Electrical and lighting', zh_Hans: '电路与照明' }, definition: 'Failed lights, damaged sockets or switches, exposed wiring, tripped panels.' },
  { id: 'hvac', label: { en_US: 'Heating and cooling', zh_Hans: '空调与通风' }, definition: 'Air conditioners, vents, heaters and thermostats that are broken, dripping or noisy.' },
  { id: 'doors_windows', label: { en_US: 'Doors, windows and locks', zh_Hans: '门窗与门锁' }, definition: 'Doors or windows that do not close, broken glass, faulty locks, handles or closers.' },
  { id: 'furniture', label: { en_US: 'Furniture and fittings', zh_Hans: '家具与固定设施' }, definition: 'Broken chairs, desks, cabinets, shelves, blinds and other fitted items.' },
  { id: 'surfaces', label: { en_US: 'Walls, floors and ceilings', zh_Hans: '墙面地面与天花' }, definition: 'Cracks, peeling paint, loose tiles, damaged carpet, sagging or stained ceiling panels.' },
  { id: 'appliances', label: { en_US: 'Appliances and equipment', zh_Hans: '电器与设备' }, definition: 'Shared appliances and office equipment such as fridges, printers, water dispensers.' },
  { id: 'safety', label: { en_US: 'Safety hazard', zh_Hans: '安全隐患' }, definition: 'Anything that could injure someone now: blocked exits, trip hazards, damaged fire equipment.' },
  { id: 'unclear', label: { en_US: 'Unclear from the photo', zh_Hans: '照片无法判断' }, definition: 'The photo does not show enough to choose a category. A person should decide.' }
]

export const CATEGORY_IDS = CATEGORIES.map(category => category.id)
/** The part of the table a model is shown. */
export const categoryDefinitions = () => CATEGORIES.map(({ id, definition }) => ({ id, definition }))
