import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TravelPlan } from './entities/travel-plan.entity'
import type {
  TravelItinerary,
  TravelPlanRecord,
  TravelPlanStatus,
  TravelPlanViewData,
  TravelRequirements,
  TravelScope
} from './types'
import { validateTravelItinerary } from './types'

@Injectable()
export class TravelItineraryService {
  constructor(@InjectRepository(TravelPlan) private readonly repository: Repository<TravelPlan>) {}

  async createPlan(scope: TravelScope, requirements: TravelRequirements): Promise<TravelPlanRecord> {
    this.validateRequirements(requirements)
    const plan = this.repository.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      createdById: scope.userId,
      assistantId: scope.assistantId,
      conversationId: scope.conversationId,
      title: `${requirements.destination} 旅行方案`,
      status: 'draft',
      requirements,
      itinerary: null,
      errorMessage: null
    })
    return this.toRecord(await this.repository.save(plan))
  }

  async listPlans(scope: TravelScope): Promise<TravelPlanRecord[]> {
    const plans = await this.repository.find({
      where: this.scopeWhere(scope),
      order: { updatedAt: 'DESC' },
      take: 50
    })
    return plans.map((plan) => this.toRecord(plan))
  }

  async getPlan(scope: TravelScope, id: string): Promise<TravelPlanRecord> {
    const plan = await this.findPlan(scope, id)
    return this.toRecord(plan)
  }

  async startGeneration(scope: TravelScope, id: string): Promise<TravelPlanRecord> {
    const plan = await this.findPlan(scope, id)
    plan.status = 'generating'
    plan.errorMessage = null
    return this.toRecord(await this.repository.save(plan))
  }

  async saveGeneratedItinerary(scope: TravelScope, id: string, itinerary: TravelItinerary): Promise<TravelPlanRecord> {
    const plan = await this.findPlan(scope, id)
    const result = validateTravelItinerary(itinerary, plan.requirements as TravelRequirements)
    if (!result.valid) {
      plan.status = 'failed'
      plan.errorMessage = result.errors.join('；')
      await this.repository.save(plan)
      throw new BadRequestException(result.errors.join('; '))
    }
    plan.itinerary = itinerary
    plan.status = 'ready_for_review'
    plan.errorMessage = null
    plan.updatedById = scope.userId
    return this.toRecord(await this.repository.save(plan))
  }

  async markGenerationFailed(scope: TravelScope, id: string, message: string): Promise<TravelPlanRecord> {
    const plan = await this.findPlan(scope, id)
    plan.status = 'failed'
    plan.errorMessage = message.slice(0, 1000)
    plan.updatedById = scope.userId
    return this.toRecord(await this.repository.save(plan))
  }

  async retryPlan(scope: TravelScope, id: string): Promise<TravelPlanRecord> {
    const plan = await this.findPlan(scope, id)
    if (plan.status !== 'failed') throw new BadRequestException('只有失败的旅行方案才能重试')
    plan.status = 'draft'
    plan.errorMessage = null
    plan.updatedById = scope.userId
    return this.toRecord(await this.repository.save(plan))
  }

  async confirmPlan(scope: TravelScope, id: string): Promise<TravelPlanRecord> {
    const plan = await this.findPlan(scope, id)
    if (plan.status !== 'ready_for_review' || !plan.itinerary) {
      throw new BadRequestException('只有已生成且待审核的方案才能确认')
    }
    plan.status = 'confirmed'
    plan.updatedById = scope.userId
    return this.toRecord(await this.repository.save(plan))
  }

  async getViewData(scope: TravelScope, selectedPlanId?: string): Promise<TravelPlanViewData> {
    const plans = await this.listPlans(scope)
    const selectedPlan = selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) : plans[0]
    return {
      summary: {
        totalPlans: plans.length,
        confirmedPlans: plans.filter((plan) => plan.status === 'confirmed').length,
        failedPlans: plans.filter((plan) => plan.status === 'failed').length
      },
      plans,
      selectedPlan: selectedPlan ?? null
    }
  }

  private async findPlan(scope: TravelScope, id: string) {
    const plan = await this.repository.findOne({ where: { id, ...this.scopeWhere(scope) } })
    if (!plan) throw new NotFoundException('旅行方案不存在或无权访问')
    return plan
  }

  private scopeWhere(scope: TravelScope) {
    return {
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null
    }
  }

  private validateRequirements(requirements: TravelRequirements) {
    if (!requirements.destination.trim()) throw new BadRequestException('目的地不能为空')
    if (!requirements.startDate || !requirements.endDate || requirements.startDate > requirements.endDate) {
      throw new BadRequestException('出行日期范围无效')
    }
    if (!Number.isInteger(requirements.travelers) || requirements.travelers < 1) {
      throw new BadRequestException('出行人数必须是正整数')
    }
  }

  private toRecord(plan: TravelPlan): TravelPlanRecord {
    return {
      id: plan.id ?? '',
      title: plan.title ?? '',
      status: (plan.status ?? 'draft') as TravelPlanStatus,
      requirements: plan.requirements as TravelRequirements,
      itinerary: plan.itinerary ?? null,
      errorMessage: plan.errorMessage ?? null,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    }
  }
}
