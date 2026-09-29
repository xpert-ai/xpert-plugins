import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TestCaseEntity, TestCaseProjectEntity } from './entities'
import type {
  TestCase,
  TestCaseGranularity,
  TestCaseProject,
  TestCaseProjectSummary,
  TestCaseSaveProjectInput,
  TestCaseScope,
  TestCaseUpdateInput
} from './types'
import { normalizeTestCaseSteps, validateGeneratedTestCase } from './types'

@Injectable()
export class TestCaseGeneratorService {
  constructor(
    @InjectRepository(TestCaseProjectEntity)
    private readonly projectRepository: Repository<TestCaseProjectEntity>,
    @InjectRepository(TestCaseEntity)
    private readonly testCaseRepository: Repository<TestCaseEntity>
  ) {}

  async saveProject(input: TestCaseSaveProjectInput, scope: TestCaseScope): Promise<TestCaseProject> {
    const requirementText = input.requirementText?.trim()
    if (!requirementText) {
      throw new BadRequestException('requirementText is required')
    }
    const validCases = (input.testCases ?? []).filter(validateGeneratedTestCase)
    if (!validCases.length) {
      throw new BadRequestException('At least one valid test case is required')
    }

    const granularity: TestCaseGranularity = input.granularity === 'detailed' ? 'detailed' : 'basic'

    return this.projectRepository.manager.transaction(async (manager) => {
      const projectRepo = manager.getRepository(TestCaseProjectEntity)
      const testCaseRepo = manager.getRepository(TestCaseEntity)

      const project = await projectRepo.save(
        projectRepo.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          createdBy: scope.userId ?? undefined,
          requirementText,
          granularity
        })
      )

      for (const caseItem of validCases) {
        await testCaseRepo.save(
          testCaseRepo.create({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId ?? undefined,
            projectId: project.id,
            name: caseItem.name.trim(),
            precondition: caseItem.precondition?.trim() ?? '',
            steps: normalizeTestCaseSteps(caseItem.steps),
            expectedResult: caseItem.expectedResult?.trim() ?? '',
            priority: caseItem.priority
          })
        )
      }

      const saved = await projectRepo.findOne({
        where: { id: project.id },
        relations: { testCases: true }
      })
      return saved as TestCaseProject
    })
  }

  async getProjectById(scope: TestCaseScope, projectId: string): Promise<TestCaseProject> {
    const project = await this.projectRepository.findOne({
      where: { ...this.scopeWhere(scope), id: projectId },
      relations: { testCases: true },
      order: { testCases: { priority: 'ASC', createdAt: 'ASC' } }
    })
    if (!project) {
      throw new NotFoundException(`Test case project '${projectId}' was not found`)
    }
    return project as TestCaseProject
  }

  async listProjects(
    scope: TestCaseScope,
    input: { search?: string; page?: number; pageSize?: number } = {}
  ): Promise<{ items: TestCaseProjectSummary[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
    const search = input.search?.trim().toLowerCase()

    const queryBuilder = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.testCases', 'testCase')
      .where('project.tenantId = :tenantId', { tenantId: scope.tenantId })

    if (scope.organizationId) {
      queryBuilder.andWhere('project.organizationId = :organizationId', { organizationId: scope.organizationId })
    }
    if (search) {
      queryBuilder.andWhere('LOWER(project.requirementText) LIKE :search', { search: `%${search}%` })
    }

    queryBuilder.orderBy('project.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize)

    const [projects, total] = await queryBuilder.getManyAndCount()

    const items: TestCaseProjectSummary[] = projects.map((project) => ({
      id: project.id as string,
      requirementText: project.requirementText ?? '',
      granularity: project.granularity ?? 'basic',
      testCaseCount: project.testCases?.length ?? 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }))

    return { items, total, page, pageSize }
  }

  async deleteProject(scope: TestCaseScope, projectId: string): Promise<void> {
    const project = await this.getScopedProject(scope, projectId)
    await this.projectRepository.remove(project)
  }

  async updateTestCase(
    scope: TestCaseScope,
    projectId: string,
    testCaseId: string,
    input: TestCaseUpdateInput
  ): Promise<TestCase> {
    await this.getScopedProject(scope, projectId)
    const testCase = await this.testCaseRepository.findOne({
      where: { ...this.scopeWhere(scope), id: testCaseId, projectId }
    })
    if (!testCase) {
      throw new NotFoundException(`Test case '${testCaseId}' was not found in project '${projectId}'`)
    }

    const updated = await this.testCaseRepository.save({
      ...testCase,
      name: input.name?.trim() ?? testCase.name,
      precondition: input.precondition ?? testCase.precondition,
      steps: input.steps ? normalizeTestCaseSteps(input.steps) : testCase.steps,
      expectedResult: input.expectedResult ?? testCase.expectedResult,
      priority: input.priority ?? testCase.priority
    })
    return updated as TestCase
  }

  async deleteTestCase(scope: TestCaseScope, projectId: string, testCaseId: string): Promise<void> {
    await this.getScopedProject(scope, projectId)
    const testCase = await this.testCaseRepository.findOne({
      where: { ...this.scopeWhere(scope), id: testCaseId, projectId }
    })
    if (!testCase) {
      throw new NotFoundException(`Test case '${testCaseId}' was not found in project '${projectId}'`)
    }
    await this.testCaseRepository.remove(testCase)
  }

  async getViewData(
    scope: TestCaseScope,
    input: { projectId?: string; search?: string; page?: number; pageSize?: number } = {}
  ) {
    const list = await this.listProjects(scope, {
      search: input.search,
      page: input.page,
      pageSize: input.pageSize
    })
    if (input.projectId) {
      const project = await this.getProjectById(scope, input.projectId)
      return {
        items: list.items,
        total: list.total,
        item: this.toProjectDetail(project),
        summary: { mode: 'detail' as const },
        meta: {}
      }
    }
    return {
      items: list.items,
      total: list.total,
      item: undefined,
      summary: { mode: 'list' as const },
      meta: {}
    }
  }

  private async getScopedProject(scope: TestCaseScope, projectId: string): Promise<TestCaseProjectEntity> {
    const project = await this.projectRepository.findOne({
      where: { ...this.scopeWhere(scope), id: projectId }
    })
    if (!project) {
      throw new NotFoundException(`Test case project '${projectId}' was not found`)
    }
    return project
  }

  private scopeWhere(scope: TestCaseScope) {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined
    }
  }

  private toProjectDetail(project: TestCaseProject) {
    return {
      id: project.id,
      requirementText: project.requirementText,
      granularity: project.granularity,
      testCases: (project.testCases ?? []).map((tc) => ({
        id: tc.id,
        name: tc.name,
        precondition: tc.precondition,
        steps: tc.steps ?? [],
        expectedResult: tc.expectedResult,
        priority: tc.priority,
        createdAt: tc.createdAt,
        updatedAt: tc.updatedAt
      })),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }
  }
}
