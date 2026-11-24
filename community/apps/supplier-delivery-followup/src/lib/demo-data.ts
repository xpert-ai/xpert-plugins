// All suppliers and sample correspondence are fictional.
export const DEMO_ORDER_LINES = [
  {
    poNumber: 'DEMO-001',
    lineNo: 1,
    supplierName: '虚构星苔零件社',
    materialCode: 'MAT-01',
    materialName: '定位环',
    quantity: 100,
    unit: '件',
    originalDate: '2026-11-20'
  },
  {
    poNumber: 'DEMO-001',
    lineNo: 2,
    supplierName: '虚构星苔零件社',
    materialCode: 'MAT-02',
    materialName: '连接片',
    quantity: 200,
    unit: '件',
    originalDate: '2026-11-20'
  },
  {
    poNumber: 'DEMO-002',
    lineNo: 1,
    supplierName: '虚构星苔零件社',
    materialCode: 'MAT-03',
    materialName: '导向销',
    quantity: 80,
    unit: '件',
    originalDate: '2026-11-22'
  },
  {
    poNumber: 'DEMO-002',
    lineNo: 2,
    supplierName: '虚构星苔零件社',
    materialCode: 'MAT-04',
    materialName: '支撑座',
    quantity: 60,
    unit: '件',
    originalDate: '2026-11-23'
  },
  {
    poNumber: 'DEMO-003',
    lineNo: 1,
    supplierName: '虚构云砾材料坊',
    materialCode: 'MAT-05',
    materialName: '密封垫',
    quantity: 300,
    unit: '片',
    originalDate: '2026-11-24'
  },
  {
    poNumber: 'DEMO-003',
    lineNo: 2,
    supplierName: '虚构云砾材料坊',
    materialCode: 'MAT-06',
    materialName: '绝缘板',
    quantity: 50,
    unit: '片',
    originalDate: '2026-11-24'
  },
  {
    poNumber: 'DEMO-004',
    lineNo: 1,
    supplierName: '虚构云砾材料坊',
    materialCode: 'MAT-07',
    materialName: '缓冲条',
    quantity: 120,
    unit: '米',
    originalDate: '2026-11-25'
  },
  {
    poNumber: 'DEMO-004',
    lineNo: 2,
    supplierName: '虚构云砾材料坊',
    materialCode: 'MAT-08',
    materialName: '防护膜',
    quantity: 40,
    unit: '卷',
    originalDate: '2026-11-25'
  },
  {
    poNumber: 'DEMO-005',
    lineNo: 1,
    supplierName: '虚构月榫组件屋',
    materialCode: 'MAT-09',
    materialName: '弹簧组件',
    quantity: 150,
    unit: '套',
    originalDate: '2026-11-26'
  },
  {
    poNumber: 'DEMO-005',
    lineNo: 2,
    supplierName: '虚构月榫组件屋',
    materialCode: 'MAT-10',
    materialName: '滑轨组件',
    quantity: 70,
    unit: '套',
    originalDate: '2026-11-26'
  },
  {
    poNumber: 'DEMO-006',
    lineNo: 1,
    supplierName: '虚构月榫组件屋',
    materialCode: 'MAT-11',
    materialName: '锁扣组件',
    quantity: 90,
    unit: '套',
    originalDate: '2026-11-27'
  },
  {
    poNumber: 'DEMO-006',
    lineNo: 2,
    supplierName: '虚构月榫组件屋',
    materialCode: 'MAT-12',
    materialName: '铰链组件',
    quantity: 110,
    unit: '套',
    originalDate: '2026-11-27'
  }
] as const

export const DEMO_REPLIES = [
  {
    kind: 'weekly_update',
    rawText:
      '王工好，同步下本周情况：\n1、弹簧组件热处理炉检修，要比原计划晚一周出货，数量不变；\n2、滑轨那单按原计划先发一半，剩下的 12 月 5 号前补齐；\n3、锁扣组件按原计划；\n4、铰链可以提前三天给到。\n发票下周一一起寄出。\n—— 虚构月榫组件屋 小李'
  },
  { kind: 'single_delay', rawText: 'DEMO-001 第1行定位环100件，因设备检修，交期由2026-11-20延期到2026-11-28。' },
  {
    kind: 'multiple_lines',
    rawText: 'DEMO-001 第2行连接片200件改为2026-11-26；DEMO-002 第1行导向销80件改为2026-11-29，原因均为排产调整。'
  },
  { kind: 'missing_order', rawText: '定位环100件预计2026-11-30到货，请帮忙确认对应订单。' },
  {
    kind: 'partial',
    rawText: 'DEMO-003 第1行密封垫分批交付：100片于2026-11-24到货，200片于2026-12-02到货，因原料分批入库。'
  },
  { kind: 'advance', rawText: 'DEMO-005 第1行弹簧组件150套已完成，交期提前到2026-11-19。' },
  { kind: 'no_date', rawText: 'DEMO-006 第2行铰链组件我们尽快安排，有进展再通知。' }
] as const
