import type { InspectionScope } from './types.js'

export interface SeedHistoryRecord {
  deviceType: string
  faultCategory: string
  faultKeywords: string
  description: string
  resolution: string
  effectiveness: string
}

/** 内置历史处理方案知识库（按设备类型 + 故障类别沉淀，供 AI 检索复用） */
export const INSPECTION_SEED_HISTORY: SeedHistoryRecord[] = [
  {
    deviceType: 'BBU',
    faultCategory: '电源掉电',
    faultKeywords: 'BBU 掉电 电源 断电 闪断',
    description: '站点 BBU 反复掉电，告警为直流输入电压异常，设备不定期重启。',
    resolution: '现场检查直流配电单元接线端子是否松动，测量输入电压波动；确认蓄电池组电压及健康度，更换失效蓄电池；检查整流模块风扇与防尘网，清理积尘后复测。',
    effectiveness: '处理后 72 小时无掉电告警，设备稳定运行。'
  },
  {
    deviceType: 'BBU',
    faultCategory: '基带板异常',
    faultKeywords: 'BBU 基带板 异常 复位 光模块 告警',
    description: 'BBU 基带板上报异常复位，对应小区退服，光模块收发光异常。',
    resolution: '依次执行：检查光模块型号与速率是否匹配，清洁光纤接头；更换备板验证是否为板卡硬件故障；核对基带板软件版本与主控一致性，异常则升级补丁。',
    effectiveness: '更换光模块后小区恢复，后续无重复告警。'
  },
  {
    deviceType: 'RRU',
    faultCategory: '驻波告警',
    faultKeywords: 'RRU 驻波 告警 天馈 接头 进水',
    description: 'RRU 上报高驻波比告警，小区覆盖下降，用户投诉上网慢。',
    resolution: '现场用驻波比测试仪分段排查天馈系统，重点检查馈线接头是否进水/氧化；紧固或更换接头并做防水处理；测试天馈驻波比恢复至 1.5 以下后复位 RRU 告警。',
    effectiveness: '更换进水接头并做防水后驻波告警消除，覆盖恢复。'
  },
  {
    deviceType: '传输设备',
    faultCategory: '光路中断',
    faultKeywords: '传输 光路 中断 LOS 光功率 割接',
    description: '传输设备上报光路中断（LOS），基站业务全阻，影响范围内用户无信号。',
    resolution: '用光功率计在收发光两端测试光功率，判断是否为光缆断纤；对光缆进行 OTDR 测试定位断点；若为割接或尾纤松动，重熔/重插后核对光功率在收端灵敏度范围内。',
    effectiveness: '重熔断纤后光路恢复，业务 30 分钟内恢复。'
  },
  {
    deviceType: '动环监控',
    faultCategory: '高温告警',
    faultKeywords: '动环 高温 空调 告警 机房温度',
    description: '动环监控上报机房高温告警，空调制冷异常，温度持续超过 35℃。',
    resolution: '检查机房空调是否故障（压缩机、制冷剂、滤网），清洗滤网并检查送风通道；空调失效时临时加装轴流风机强制通风；确认空调温控设定与动环阈值联动正常。',
    effectiveness: '空调修复后温度回落至 24℃ 以内，高温告警清除。'
  },
  {
    deviceType: '天线',
    faultCategory: '覆盖异常',
    faultKeywords: '天线 覆盖 弱覆盖 倾角 方位角 优化',
    description: '周边用户反馈弱覆盖，路测发现天线覆盖方向偏移，扇区信号强度明显下降。',
    resolution: '核对设计图纸与现场天线方位角/下倾角是否一致；使用坡度仪与罗盘校正天线倾角方位角；调整后复测参考信号功率与 SINR，配合后台参数优化。',
    effectiveness: '调整后天线下倾角与设计一致，弱覆盖区域指标回升。'
  },
  {
    deviceType: '蓄电池组',
    faultCategory: '容量下降',
    faultKeywords: '蓄电池 容量 下降 后备时间 失效',
    description: '市电中断测试发现蓄电池后备时间不足，单节电池电压异常。',
    resolution: '逐节测量单体电压与内阻，定位落后电池；对落后电池组做容量核容测试，确认无法恢复后整组更换；更换后复测后备时间满足设计要求。',
    effectiveness: '更换电池组后后备时间恢复至 4 小时以上。'
  }
]

export function buildSeedHistory(scope: InspectionScope) {
  return INSPECTION_SEED_HISTORY.map((record, index) => ({
    id: `seed-${scope.tenantId.slice(0, 8)}-${index}`,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    deviceType: record.deviceType,
    faultCategory: record.faultCategory,
    faultKeywords: record.faultKeywords,
    description: record.description,
    resolution: record.resolution,
    effectiveness: record.effectiveness,
    sourceCaseNo: null
  }))
}
