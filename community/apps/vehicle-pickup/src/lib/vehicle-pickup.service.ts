import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { readVehiclePickupRuntimeConfig } from './vehicle-pickup.config'
import {
  ACTIVE_STATUSES,
  STATUS_LABELS,
  canTransition,
  formatSystemRejection,
  isValidVehicleNo,
  normalizeVehicleNos,
  requestFingerprint,
  resolveActor
} from './vehicle-pickup.rules'
import { VehiclePickupMockCatalogService } from './vehicle-pickup-mock-catalog.service'
import { VehiclePickupRequest, VehiclePickupRequestLog } from './entities'
import type {
  PickupActor,
  PickupLogDto,
  PickupRequestDto,
  PickupValidationError,
  PickupValidationResult,
  PickupVehicleSnapshot,
  PickupViewData,
  VehiclePickupCreateInput,
  VehiclePickupQueryInput,
  VehiclePickupRejectionSource,
  VehiclePickupRole,
  VehiclePickupStatus,
  VehiclePickupViewQuery
} from './types'

const statusIssue: Record<string, { code: string; message: string }> = {
  customs_locked: { code: 'CUSTOMS_LOCKED', message: '车辆存在海关锁，不可自提' },
  under_maintenance: { code: 'UNDER_MAINTENANCE', message: '车辆正在维护，不可自提' },
  sold: { code: 'VEHICLE_SOLD', message: '车辆已售出，不可自提' }
}

export class VehiclePickupDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: unknown = null
  ) {
    super(message)
  }
}

@Injectable()
export class VehiclePickupService {
  constructor(
    @InjectRepository(VehiclePickupRequest)
    private readonly requestRepository: Repository<VehiclePickupRequest>,
    @InjectRepository(VehiclePickupRequestLog)
    private readonly logRepository: Repository<VehiclePickupRequestLog>,
    private readonly catalog: VehiclePickupMockCatalogService
  ) {}

  async validateVehicles(
    actor: PickupActor,
    vehicleNos: string[],
    options: { purpose?: 'general' | 'create' | 'approval'; excludeRequestId?: string } = {}
  ): Promise<PickupValidationResult> {
    const normalized = normalizeVehicleNos(vehicleNos)
    const errors: PickupValidationError[] = []
    const vehicles: PickupVehicleSnapshot[] = []
    const validatedAt = new Date().toISOString()

    if (!normalized.length) {
      errors.push({ code: 'NO_VEHICLE_NUMBERS', message: '请提供需要自提的车架号。' })
    }

    if (actor.role === 'carrier') {
      errors.push({ code: 'ROLE_FORBIDDEN', message: '当前账号无权校验自提申请。' })
    }

    const activeRequests =
      normalized.length > 0
        ? await this.requestRepository.find({
            where: {
              tenantId: actor.tenantId,
              organizationId: actor.organizationId,
              status: In(ACTIVE_STATUSES)
            }
          })
        : []

    for (const vehicleNo of normalized) {
      if (!isValidVehicleNo(vehicleNo)) {
        errors.push({
          vehicleNo,
          code: 'INVALID_VEHICLE_FORMAT',
          message: '车架号格式不正确，请检查后重试。'
        })
        continue
      }

      const vehicle = this.catalog.getVehicle(vehicleNo)
      if (!vehicle) {
        errors.push({ vehicleNo, code: 'VEHICLE_NOT_FOUND', message: '车架号不存在。' })
        continue
      }

      const snapshot: PickupVehicleSnapshot = {
        vehicleNo,
        model: vehicle.model,
        storeId: vehicle.storeId,
        status: vehicle.status,
        eligible: vehicle.status === 'available'
      }
      vehicles.push(snapshot)

      if (actor.role === 'store' && actor.storeId && vehicle.storeId !== actor.storeId) {
        errors.push({
          vehicleNo,
          code: 'VEHICLE_STORE_FORBIDDEN',
          message: '无权操作该车辆，该车辆不属于当前门店。'
        })
      }

      const issue = statusIssue[vehicle.status]
      if (issue) {
        errors.push({ vehicleNo, code: issue.code, message: issue.message })
      }

      const activeConflict = activeRequests.find(
        (request) =>
          request.id !== options.excludeRequestId &&
          (request.vehicles ?? []).some((item) => item.vehicleNo === vehicleNo)
      )
      if (activeConflict) {
        errors.push({
          vehicleNo,
          code: 'VEHICLE_IN_ACTIVE_REQUEST',
          message: `该车辆已在自提申请 ${activeConflict.requestNo} 中。`
        })
      }
    }

    return {
      canPickup: errors.length === 0,
      vehicles,
      errors,
      validatedAt
    }
  }

  async createRequest(actor: PickupActor, input: VehiclePickupCreateInput): Promise<PickupRequestDto> {
    this.requireRole(actor, 'store')
    const vehicleNos = normalizeVehicleNos(input.vehicleNos ?? [])
    const validation = await this.validateVehicles(actor, vehicleNos, { purpose: 'create' })
    if (!validation.canPickup) {
      throw new VehiclePickupDomainError(
        'VALIDATION_FAILED',
        '本次申请未创建，请修正车辆或权限问题后重试。',
        validation.errors
      )
    }

    const fingerprint = requestFingerprint(actor.userId, vehicleNos)
    const existing = await this.requestRepository.findOne({
      where: {
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        applicantId: actor.userId,
        requestFingerprint: fingerprint,
        status: In(ACTIVE_STATUSES)
      },
      order: { createdAt: 'DESC' }
    })
    if (existing) return this.toDto(await this.loadRequest(existing.id, actor))

    const request = this.requestRepository.create({
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      requestNo: this.createRequestNo(),
      status: 'applied',
      storeId: actor.storeId,
      applicantId: actor.userId,
      applicantName: actor.userId,
      vehicles: validation.vehicles,
      sourceText: input.sourceText,
      requestFingerprint: fingerprint,
      validationSnapshot: validation,
      validatedAt: new Date(validation.validatedAt),
      carrierId: readVehiclePickupRuntimeConfig().defaultCarrierId,
      executionAttempts: 0,
      version: 1
    })
    const saved = await this.requestRepository.save(request)
    await this.saveLog(saved, {
      action: 'created',
      actor,
      toStatus: 'applied',
      metadata: { validation }
    })
    return this.toDto(await this.loadRequest(saved.id, actor))
  }

  async queryRequests(actor: PickupActor, input: VehiclePickupQueryInput = {}): Promise<PickupRequestDto[]> {
    let requests = await this.requestRepository.find({
      where: {
        tenantId: actor.tenantId,
        organizationId: actor.organizationId
      },
      order: { createdAt: 'DESC' },
      take: 100
    })

    if (actor.role === 'store') {
      requests = requests.filter((request) => request.storeId === actor.storeId)
    } else if (actor.role === 'carrier') {
      requests = requests.filter(
        (request) =>
          (request.status === 'approved' || request.status === 'executed') &&
          (!request.carrierId || request.carrierId === actor.carrierId)
      )
    }

    if (input.status) requests = requests.filter((request) => request.status === input.status)
    if (input.requestId) requests = requests.filter((request) => request.id === input.requestId)
    if (input.requestNo) {
      const requestNo = input.requestNo.toUpperCase()
      requests = requests.filter((request) => request.requestNo?.toUpperCase() === requestNo)
    }
    if (input.keyword) {
      const keyword = input.keyword.trim().toUpperCase()
      requests = requests.filter(
        (request) =>
          request.requestNo?.toUpperCase().includes(keyword) ||
          (request.vehicles ?? []).some((vehicle) => vehicle.vehicleNo.includes(keyword))
      )
    }

    const logs = requests.length
      ? await this.logRepository.find({
          where: { requestId: In(requests.map((request) => request.id)) },
          order: { createdAt: 'DESC' }
        })
      : []
    return requests.map((request) => this.toDto(request, logs.filter((log) => log.requestId === request.id)))
  }

  async getViewData(actor: PickupActor, query: VehiclePickupViewQuery = {}): Promise<PickupViewData> {
    const requests = await this.queryRequests(actor, query)
    const selectedRequest =
      requests.find((request) => request.id === query.requestId) ??
      requests.find((request) => request.requestNo === query.requestNo) ??
      requests[0] ??
      null
    const roles: VehiclePickupRole[] = ['store', 'approver', 'carrier']
    return {
      viewer: {
        role: actor.role,
        storeId: actor.storeId,
        carrierId: actor.carrierId,
        canSwitchRole: actor.canSwitchRole,
        availableRoles: actor.canSwitchRole ? roles : [actor.role]
      },
      requests,
      selectedRequest,
      total: requests.length,
      statusOptions: (Object.keys(STATUS_LABELS) as VehiclePickupStatus[]).map((value) => ({
        value,
        label: STATUS_LABELS[value]
      })),
      demo: {
        executionFailureEnabled: readVehiclePickupRuntimeConfig().simulateExecutionFailureOnce,
        vehicleIssueSimulationEnabled: actor.canSwitchRole
      }
    }
  }

  async approve(
    actor: PickupActor,
    requestId: string,
    expectedVersion: number
  ): Promise<PickupRequestDto> {
    this.requireRole(actor, 'approver')
    const request = await this.loadRequest(requestId, actor)
    this.assertTransition(request, 'approve', expectedVersion)
    const validation = await this.validateVehicles(
      actor,
      (request.vehicles ?? []).map((vehicle) => vehicle.vehicleNo),
      { purpose: 'approval', excludeRequestId: request.id }
    )
    const fromStatus = request.status
    request.approverId = actor.userId
    request.approverName = actor.userId
    request.validationSnapshot = validation
    request.validatedAt = new Date(validation.validatedAt)
    request.version = (request.version ?? 1) + 1

    if (!validation.canPickup) {
      request.status = 'rejected'
      request.rejectionSource = 'system'
      request.approvalReason = formatSystemRejection(validation.errors)
      request.rejectedAt = new Date()
      const saved = await this.requestRepository.save(request)
      await this.saveLog(saved, {
        action: 'system_rejected',
        actorRole: 'system',
        fromStatus,
        toStatus: 'rejected',
        reason: request.approvalReason,
        metadata: { validation }
      })
      return this.toDto(saved)
    }

    request.status = 'approved'
    request.rejectionSource = undefined
    request.approvedAt = new Date()
    const saved = await this.requestRepository.save(request)
    await this.saveLog(saved, { action: 'approved', actor, fromStatus, toStatus: 'approved' })
    return this.toDto(saved)
  }

  async reject(
    actor: PickupActor,
    requestId: string,
    expectedVersion: number,
    reason: string
  ): Promise<PickupRequestDto> {
    this.requireRole(actor, 'approver')
    if (!reason.trim()) throw new BadRequestException('驳回理由不能为空。')
    const request = await this.loadRequest(requestId, actor)
    this.assertTransition(request, 'reject', expectedVersion)
    const fromStatus = request.status
    request.status = 'rejected'
    request.rejectionSource = 'manual'
    request.approvalReason = reason.trim()
    request.approverId = actor.userId
    request.approverName = actor.userId
    request.rejectedAt = new Date()
    request.version = (request.version ?? 1) + 1
    const saved = await this.requestRepository.save(request)
    await this.saveLog(saved, {
      action: 'rejected',
      actor,
      fromStatus,
      toStatus: 'rejected',
      reason: reason.trim()
    })
    return this.toDto(saved)
  }

  async cancel(
    actor: PickupActor,
    requestId: string,
    expectedVersion: number,
    reason = '审批人取消'
  ): Promise<PickupRequestDto> {
    this.requireRole(actor, 'approver')
    const request = await this.loadRequest(requestId, actor)
    this.assertTransition(request, 'cancel', expectedVersion)
    const fromStatus = request.status
    request.status = 'cancelled'
    request.cancelReason = reason.trim() || '审批人取消'
    request.cancelledAt = new Date()
    request.version = (request.version ?? 1) + 1
    const saved = await this.requestRepository.save(request)
    await this.saveLog(saved, {
      action: 'cancelled',
      actor,
      fromStatus,
      toStatus: 'cancelled',
      reason: request.cancelReason
    })
    return this.toDto(saved)
  }

  async execute(
    actor: PickupActor,
    requestId: string,
    expectedVersion: number
  ): Promise<{ success: boolean; message: string; request: PickupRequestDto }> {
    this.requireRole(actor, 'carrier')
    const request = await this.loadRequest(requestId, actor)
    this.assertTransition(request, 'execute', expectedVersion)
    const config = readVehiclePickupRuntimeConfig()
    request.carrierId = actor.carrierId
    request.executionAttempts = (request.executionAttempts ?? 0) + 1
    request.version = (request.version ?? 1) + 1

    if (config.simulateExecutionFailureOnce && request.executionAttempts === 1) {
      request.executionFailureReason = '模拟承运商接口暂时不可用'
      const saved = await this.requestRepository.save(request)
      await this.saveLog(saved, {
        action: 'execution_failed',
        actor,
        fromStatus: 'approved',
        toStatus: 'approved',
        reason: request.executionFailureReason
      })
      return {
        success: false,
        message: '模拟运输指令执行失败，请重试。',
        request: this.toDto(saved)
      }
    }

    request.status = 'executed'
    request.executedAt = new Date()
    request.executionFailureReason = null
    const saved = await this.requestRepository.save(request)
    await this.saveLog(saved, {
      action: 'executed',
      actor,
      fromStatus: 'approved',
      toStatus: 'executed'
    })
    return {
      success: true,
      message: '模拟运输指令已执行。',
      request: this.toDto(saved)
    }
  }

  simulateVehicleIssue(actor: PickupActor, vehicleNo: string, status: 'customs_locked' | 'under_maintenance') {
    if (!actor.canSwitchRole) throw new ForbiddenException('当前账号不能使用演示状态切换。')
    const vehicle = this.catalog.setVehicleStatus(vehicleNo, status)
    if (!vehicle) throw new NotFoundException('车辆不存在。')
    return vehicle
  }

  resolveActor(
    userId: string,
    tenantId: string,
    organizationId: string | null | undefined,
    requestedRole?: VehiclePickupRole
  ): PickupActor {
    const actor = resolveActor(userId, tenantId, organizationId, requestedRole, readVehiclePickupRuntimeConfig())
    if (!actor) throw new ForbiddenException('当前账号未配置车辆自提业务角色。')
    return actor
  }

  private requireRole(actor: PickupActor, role: VehiclePickupRole) {
    if (actor.role !== role) throw new ForbiddenException('当前业务角色无权执行该操作。')
  }

  private assertTransition(
    request: VehiclePickupRequest,
    action: 'approve' | 'reject' | 'cancel' | 'execute',
    expectedVersion: number
  ) {
    if (!request.status || !canTransition(request.status, action)) {
      throw new ConflictException(`当前申请状态不允许执行该操作。`)
    }
    if (expectedVersion && request.version !== expectedVersion) {
      throw new ConflictException('申请状态已变化，请刷新后重试。')
    }
  }

  private async loadRequest(requestId: string, actor: PickupActor) {
    const request = await this.requestRepository.findOne({
      where: {
        id: requestId,
        tenantId: actor.tenantId,
        organizationId: actor.organizationId
      }
    })
    if (!request) throw new NotFoundException('未找到该申请，或当前账号无权查看。')
    if (actor.role === 'store' && request.storeId !== actor.storeId) {
      throw new ForbiddenException('无权查看其他门店的自提申请。')
    }
    if (
      actor.role === 'carrier' &&
      (request.status === 'applied' ||
        request.status === 'rejected' ||
        request.status === 'cancelled' ||
        (request.carrierId && request.carrierId !== actor.carrierId))
    ) {
      throw new ForbiddenException('承运商无权查看该申请。')
    }
    const logs = await this.logRepository.find({
      where: { requestId: request.id },
      order: { createdAt: 'DESC' }
    })
    request.logs = logs
    return request
  }

  private async saveLog(
    request: VehiclePickupRequest,
    input: {
      action: string
      actor?: PickupActor
      actorRole?: VehiclePickupRole | 'system'
      fromStatus?: VehiclePickupStatus
      toStatus?: VehiclePickupStatus
      reason?: string
      metadata?: unknown
    }
  ) {
    await this.logRepository.save(
      this.logRepository.create({
        tenantId: request.tenantId,
        organizationId: request.organizationId,
        requestId: request.id,
        action: input.action,
        actorId: input.actor?.userId,
        actorName: input.actor?.userId,
        actorRole: input.actor?.role ?? input.actorRole,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        metadata: input.metadata
      })
    )
  }

  private toDto(request: VehiclePickupRequest, logs?: VehiclePickupRequestLog[]): PickupRequestDto {
    return {
      id: request.id,
      requestNo: request.requestNo,
      status: request.status,
      storeId: request.storeId,
      applicantId: request.applicantId,
      applicantName: request.applicantName,
      vehicles: request.vehicles ?? [],
      sourceText: request.sourceText,
      approvalReason: request.approvalReason,
      rejectionSource: request.rejectionSource,
      approvedAt: request.approvedAt?.toISOString(),
      rejectedAt: request.rejectedAt?.toISOString(),
      cancelledAt: request.cancelledAt?.toISOString(),
      cancelReason: request.cancelReason,
      carrierId: request.carrierId,
      executionAttempts: request.executionAttempts ?? 0,
      executedAt: request.executedAt?.toISOString(),
      executionFailureReason: request.executionFailureReason,
      validationSnapshot: request.validationSnapshot,
      validatedAt: request.validatedAt?.toISOString(),
      version: request.version ?? 1,
      createdAt: request.createdAt?.toISOString(),
      updatedAt: request.updatedAt?.toISOString(),
      logs: (logs ?? request.logs ?? []).map((log) => this.logToDto(log))
    }
  }

  private logToDto(log: VehiclePickupRequestLog): PickupLogDto {
    return {
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      actorName: log.actorName,
      actorRole: log.actorRole,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      reason: log.reason,
      metadata: log.metadata,
      createdAt: log.createdAt?.toISOString()
    }
  }

  private createRequestNo() {
    const date = new Date()
    const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    return `VP${day}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`
  }
}
