import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  AutomationScriptEntity,
  BugEntity,
  TestCaseEntity,
  TestCaseProjectEntity,
  TestCaseReviewEntity
} from './entities'
import type {
  AutomationFramework,
  AutomationScript,
  Bug,
  BugSeverity,
  ReviewIssue,
  RequirementPoint,
  TestCase,
  TestCaseData,
  TestCaseGranularity,
  TestCaseProject,
  TestCaseProjectSummary,
  TestCaseReview,
  TestCaseSaveProjectInput,
  TestCaseScope,
  TestCaseUpdateInput
} from './types'
import {
  normalizeTestCaseSteps,
  validateBugSeverity,
  validateGeneratedTestCase,
  validateRequirementPoint,
  validateReviewIssue,
  validateTestCaseData
} from './types'

@Injectable()
export class TestCaseGeneratorService {
  constructor(
    @InjectRepository(TestCaseProjectEntity)
    private readonly projectRepository: Repository<TestCaseProjectEntity>,
    @InjectRepository(TestCaseEntity)
    private readonly testCaseRepository: Repository<TestCaseEntity>,
    @InjectRepository(TestCaseReviewEntity)
    private readonly reviewRepository: Repository<TestCaseReviewEntity>,
    @InjectRepository(AutomationScriptEntity)
    private readonly scriptRepository: Repository<AutomationScriptEntity>,
    @InjectRepository(BugEntity)
    private readonly bugRepository: Repository<BugEntity>
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

  async saveReview(
    scope: TestCaseScope,
    input: {
      projectId?: string
      requirementText: string
      requirementPoints: RequirementPoint[]
      issues: ReviewIssue[]
      suggestedCases: TestCase[]
      coverageScore: number
      summary: string
    }
  ): Promise<TestCaseReview> {
    const requirementText = input.requirementText?.trim()
    if (!requirementText) {
      throw new BadRequestException('requirementText is required')
    }
    const points = (input.requirementPoints ?? [])
      .map(validateRequirementPoint)
      .filter((p): p is RequirementPoint => p !== null)
    const issues = (input.issues ?? [])
      .map(validateReviewIssue)
      .filter((p): p is ReviewIssue => p !== null)
    const suggestedCases = (input.suggestedCases ?? []).filter(validateGeneratedTestCase)

    const totalPoints = points.length
    const coveredPoints = points.filter((p) => p.covered).length
    const computedScore = totalPoints
      ? Math.round((coveredPoints / totalPoints) * 100)
      : Math.min(100, Math.max(0, Math.round(input.coverageScore ?? 0)))
    const coverageScore = totalPoints ? computedScore : Math.min(100, Math.max(0, Math.round(input.coverageScore ?? 0)))

    let projectId = input.projectId?.trim()
    if (projectId) {
      await this.getScopedProject(scope, projectId)
    }

    const review = await this.reviewRepository.save(
      this.reviewRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        projectId: projectId ?? undefined,
        requirementText,
        totalPoints,
        coveredPoints,
        coverageScore,
        requirementPoints: points,
        issues,
        suggestedCases: suggestedCases.map((c) => ({
          name: c.name,
          precondition: c.precondition,
          steps: c.steps,
          expectedResult: c.expectedResult,
          priority: c.priority
        })),
        summary: input.summary?.trim() ?? ''
      })
    )
    return review as TestCaseReview
  }

  async applyTestData(
    scope: TestCaseScope,
    projectId: string,
    cases: Array<{ name: string; testData: TestCaseData }>
  ): Promise<{ projectId: string; updatedCount: number }> {
    await this.getScopedProject(scope, projectId)
    const valid = cases
      .map((c) => ({ name: c.name?.trim(), testData: validateTestCaseData(c.testData) }))
      .filter((c): c is { name: string; testData: TestCaseData } => Boolean(c.name && c.testData))
    if (!valid.length) {
      throw new BadRequestException('No valid test data to apply')
    }

    const casesInProject = await this.testCaseRepository.find({
      where: { ...this.scopeWhere(scope), projectId }
    })
    const byName = new Map(casesInProject.map((c) => [c.name?.trim(), c]))

    let updatedCount = 0
    for (const item of valid) {
      const target = byName.get(item.name)
      if (!target) continue
      await this.testCaseRepository.save({ ...target, testData: item.testData })
      updatedCount++
    }
    return { projectId, updatedCount }
  }

  async saveScripts(
    scope: TestCaseScope,
    input: {
      projectId?: string
      framework: AutomationFramework
      scripts: Array<{
        testCaseId?: string | null
        testCaseName?: string
        language?: string
        filename: string
        content: string
      }>
    }
  ): Promise<{ items: AutomationScript[]; count: number }> {
    const framework = input.framework
    const valid = (input.scripts ?? []).filter(
      (s) => s && s.filename?.trim() && s.content?.trim()
    )
    if (!valid.length) {
      throw new BadRequestException('No valid scripts to save')
    }

    let projectId = input.projectId?.trim()
    if (projectId) {
      await this.getScopedProject(scope, projectId)
    }

    const entities = valid.map((s) =>
      this.scriptRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        projectId: projectId ?? undefined,
        testCaseId: s.testCaseId?.trim() ?? undefined,
        testCaseName: s.testCaseName?.trim() ?? undefined,
        framework,
        language: s.language?.trim() || (framework === 'pytest' ? 'python' : 'typescript'),
        filename: s.filename.trim(),
        content: s.content
      })
    )
    const saved = await this.scriptRepository.save(entities)
    return { items: saved as AutomationScript[], count: saved.length }
  }

  async createBug(
    scope: TestCaseScope,
    input: {
      projectId?: string
      title: string
      description: string
      severity: BugSeverity
      rootCause: string
      regressionCases: TestCase[]
    }
  ): Promise<Bug> {
    const title = input.title?.trim()
    const description = input.description?.trim()
    if (!title || !description) {
      throw new BadRequestException('Bug title and description are required')
    }
    const regressionCases = (input.regressionCases ?? []).filter(validateGeneratedTestCase)

    let projectId = input.projectId?.trim()
    if (projectId) {
      await this.getScopedProject(scope, projectId)
    }

    const bug = await this.bugRepository.save(
      this.bugRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        projectId: projectId ?? undefined,
        title,
        description,
        severity: validateBugSeverity(input.severity),
        status: 'analyzed',
        rootCause: input.rootCause?.trim() ?? '',
        regressionCases: regressionCases.map((c) => ({
          name: c.name,
          precondition: c.precondition,
          steps: c.steps,
          expectedResult: c.expectedResult,
          priority: c.priority
        }))
      })
    )
    return bug as Bug
  }

  async listBugs(
    scope: TestCaseScope,
    input: { projectId?: string; page?: number; pageSize?: number } = {}
  ): Promise<{ items: Bug[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
    const where: Record<string, unknown> = { tenantId: scope.tenantId }
    if (scope.organizationId) where.organizationId = scope.organizationId
    if (input.projectId?.trim()) where.projectId = input.projectId.trim()

    const [bugs, total] = await this.bugRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return { items: bugs as Bug[], total, page, pageSize }
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
