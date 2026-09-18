import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegistrationRecord } from './registration.entity'
import { scopeColumns } from './scope'
import type { RegistrationScope } from './types'

interface SeedRecord {
  activityId: string
  activityName: string
  name: string
  phone: string
  email: string
  city: string
  channel: string
  registerTime: string
  status: string
  fee: number
}

const DEMO_RECORDS: SeedRecord[] = [
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '张伟', phone: '13800000001', email: 'zhangwei@example.com', city: '北京', channel: 'website', registerTime: '2026-09-01T09:00:00Z', status: 'confirmed', fee: 199 },
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '李娜', phone: '13800000002', email: 'lina@example.com', city: '上海', channel: 'wechat', registerTime: '2026-09-02T10:30:00Z', status: 'confirmed', fee: 199 },
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '王强', phone: '13800000003', email: 'wangqiang@example.com', city: '深圳', channel: 'website', registerTime: '2026-09-03T14:00:00Z', status: 'pending', fee: 199 },
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '赵敏', phone: '13800000004', email: 'zhaomin@example.com', city: '北京', channel: 'partner', registerTime: '2026-09-04T16:20:00Z', status: 'confirmed', fee: 0 },
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '刘洋', phone: '13800000005', email: 'liuyang@example.com', city: '成都', channel: 'wechat', registerTime: '2026-09-05T11:10:00Z', status: 'cancelled', fee: 199 },
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '陈静', phone: '13800000006', email: 'chenjing@example.com', city: '杭州', channel: 'offline', registerTime: '2026-09-06T09:45:00Z', status: 'confirmed', fee: 199 },
  { activityId: 'act-devconf', activityName: 'AI 开发者大会', name: '杨帆', phone: '13800000007', email: 'yangfan@example.com', city: '北京', channel: 'website', registerTime: '2026-09-08T13:00:00Z', status: 'confirmed', fee: 299 },
  { activityId: 'act-devconf', activityName: 'AI 开发者大会', name: '周杰', phone: '13800000008', email: 'zhoujie@example.com', city: '上海', channel: 'wechat', registerTime: '2026-09-09T10:00:00Z', status: 'confirmed', fee: 299 },
  { activityId: 'act-devconf', activityName: 'AI 开发者大会', name: '吴磊', phone: '13800000009', email: 'wulei@example.com', city: '广州', channel: 'partner', registerTime: '2026-09-10T15:30:00Z', status: 'pending', fee: 0 },
  { activityId: 'act-devconf', activityName: 'AI 开发者大会', name: '郑爽', phone: '13800000010', email: 'zhengshuang@example.com', city: '深圳', channel: 'website', registerTime: '2026-09-11T09:15:00Z', status: 'confirmed', fee: 299 },
  { activityId: 'act-devconf', activityName: 'AI 开发者大会', name: '孙浩', phone: '13800000011', email: 'sunhao@example.com', city: '武汉', channel: 'offline', registerTime: '2026-09-12T17:40:00Z', status: 'cancelled', fee: 299 },
  { activityId: 'act-workshop', activityName: '产品增长工作坊', name: '马超', phone: '13800000012', email: 'machao@example.com', city: '上海', channel: 'wechat', registerTime: '2026-09-14T14:00:00Z', status: 'confirmed', fee: 99 },
  { activityId: 'act-workshop', activityName: '产品增长工作坊', name: '朱莉', phone: '13800000013', email: 'zhuli@example.com', city: '北京', channel: 'website', registerTime: '2026-09-15T10:20:00Z', status: 'confirmed', fee: 99 },
  { activityId: 'act-workshop', activityName: '产品增长工作坊', name: '胡军', phone: '13800000014', email: 'hujun@example.com', city: '杭州', channel: 'partner', registerTime: '2026-09-16T11:50:00Z', status: 'pending', fee: 0 },
  { activityId: 'act-meetup', activityName: '开源社区 Meetup', name: '林峰', phone: '13800000015', email: 'linfeng@example.com', city: '北京', channel: 'offline', registerTime: '2026-09-01T18:00:00Z', status: 'confirmed', fee: 0 },
  { activityId: 'act-meetup', activityName: '开源社区 Meetup', name: '何静', phone: '13800000016', email: 'hejing@example.com', city: '成都', channel: 'wechat', registerTime: '2026-09-02T19:30:00Z', status: 'confirmed', fee: 0 },
  { activityId: 'act-meetup', activityName: '开源社区 Meetup', name: '高翔', phone: '13800000017', email: 'gaoxiang@example.com', city: '深圳', channel: 'website', registerTime: '2026-09-03T20:00:00Z', status: 'cancelled', fee: 0 },
  { activityId: 'act-tech-summit', activityName: '2026 技术峰会', name: '罗静', phone: '13800000018', email: 'luojing@example.com', city: '苏州', channel: 'website', registerTime: '2026-09-06T08:30:00Z', status: 'confirmed', fee: 199 },
  { activityId: 'act-devconf', activityName: 'AI 开发者大会', name: '梁宇', phone: '13800000019', email: 'liangyu@example.com', city: '南京', channel: 'wechat', registerTime: '2026-09-12T12:10:00Z', status: 'confirmed', fee: 299 },
  { activityId: 'act-workshop', activityName: '产品增长工作坊', name: '宋佳', phone: '13800000020', email: 'songjia@example.com', city: '上海', channel: 'offline', registerTime: '2026-09-17T13:25:00Z', status: 'confirmed', fee: 99 }
]

@Injectable()
export class RegistrationSeedService {
  constructor(
    @InjectRepository(RegistrationRecord)
    private readonly recordRepository: Repository<RegistrationRecord>
  ) {}

  async ensureSeeded(scope: RegistrationScope) {
    const existing = await this.recordRepository.count({ where: scopeColumns(scope) as never })
    if (existing > 0) {
      return
    }
    const entities = DEMO_RECORDS.map((record) =>
      this.recordRepository.create({
        ...scopeColumns(scope),
        activityId: record.activityId,
        activityName: record.activityName,
        name: record.name,
        phone: record.phone,
        email: record.email,
        city: record.city,
        channel: record.channel,
        registerTime: new Date(record.registerTime),
        status: record.status,
        fee: record.fee,
        createdById: scope.userId ?? null
      })
    )
    await this.recordRepository.save(entities)
  }
}
