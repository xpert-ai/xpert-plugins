import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ProcurementComparisonCase,
  ProcurementItemMatch,
  ProcurementParseJob,
  ProcurementQuoteItem,
  ProcurementRecommendation,
  ProcurementRequirementItem,
  ProcurementRiskItem,
  ProcurementSourceDocument,
  ProcurementSupplierQuote
} from './entities/index.js'
import type {
  CreateComparisonCaseInput,
  CreateCaseFromRequirementDocumentInput,
  FinalizeRecommendationInput,
  ProcurementDocumentRole,
  ProcurementFieldConflict,
  ProcurementParseJobStatus,
  ProcurementAssistantChatCommand,
  ProcurementScope,
  ProcurementWorkbenchQuery,
  PreparedSupplierQuoteParseMessages,
  RegisterSourceDocumentInput,
  ReportParseFailureInput,
  SaveItemMatchesInput,
  SaveRequirementExtractionInput,
  SaveRiskItemsInput,
  SaveSupplierQuoteExtractionInput,
  StartParseInput,
  StartParseOptions
} from './types.js'

type ScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

type ScopedQueryFields = {
  id?: string
  caseId?: string
  documentId?: string
  role?: ProcurementDocumentRole
  supplierQuoteId?: string
}

type AssistantTaskStarter = NonNullable<StartParseOptions['assistantTask']>

const PROJECT_FILLABLE_FIELDS: Array<keyof CreateComparisonCaseInput> = [
  'title',
  'purchaseNo',
  'applicant',
  'department',
  'budgetAmount',
  'expectedDeliveryDate',
  'description'
]

@Injectable()
export class ProcurementQuoteComparisonService {
  constructor(
    @InjectRepository(ProcurementComparisonCase)
    private readonly caseRepository: Repository<ProcurementComparisonCase>,
    @InjectRepository(ProcurementSourceDocument)
    private readonly documentRepository: Repository<ProcurementSourceDocument>,
    @InjectRepository(ProcurementParseJob)
    private readonly parseJobRepository: Repository<ProcurementParseJob>,
    @InjectRepository(ProcurementRequirementItem)
    private readonly requirementRepository: Repository<ProcurementRequirementItem>,
    @InjectRepository(ProcurementSupplierQuote)
    private readonly supplierQuoteRepository: Repository<ProcurementSupplierQuote>,
    @InjectRepository(ProcurementQuoteItem)
    private readonly quoteItemRepository: Repository<ProcurementQuoteItem>,
    @InjectRepository(ProcurementItemMatch)
    private readonly matchRepository: Repository<ProcurementItemMatch>,
    @InjectRepository(ProcurementRiskItem)
    private readonly riskRepository: Repository<ProcurementRiskItem>,
    @InjectRepository(ProcurementRecommendation)
    private readonly recommendationRepository: Repository<ProcurementRecommendation>
  ) {}

  async createComparisonCase(scope: ProcurementScope, input: CreateComparisonCaseInput) {
    const title = normalizeRequired(input.title, 'Project title is required.')
    const purchaseNo = normalizeRequired(input.purchaseNo, 'Purchase number is required.')

    return this.caseRepository.save(
      this.caseRepository.create({
        ...scopedCreate(scope),
        title,
        purchaseNo,
        applicant: normalizeOptional(input.applicant),
        department: normalizeOptional(input.department),
        budgetAmount: normalizeOptional(input.budgetAmount),
        expectedDeliveryDate: normalizeOptional(input.expectedDeliveryDate),
        description: normalizeOptional(input.description),
        xpertId: normalizeOptional(input.xpertId),
        agentKey: normalizeOptional(input.agentKey),
        status: 'draft',
        supplierCount: 0,
        riskCount: 0
      })
    )
  }

  async createCaseFromRequirementDocument(scope: ProcurementScope, input: CreateCaseFromRequirementDocumentInput) {
    const documentName = repairUtf8Mojibake(normalizeRequired(input.name, 'Document name is required.'))
    const sourceMaterial = requireSourceDocumentMaterial(input)
    const comparisonCase = await this.caseRepository.save(
      this.caseRepository.create({
        ...scopedCreate(scope),
        title: createTitleFromDocumentName(documentName),
        purchaseNo: createRequirementPurchaseNo(),
        xpertId: normalizeOptional(input.xpertId),
        agentKey: normalizeOptional(input.agentKey),
        status: 'files_uploaded',
        supplierCount: 0,
        riskCount: 0
      })
    )

    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        caseId: comparisonCase.id,
        role: 'requirement',
        name: documentName,
        fileAssetId: sourceMaterial.fileAssetId,
        fileId: sourceMaterial.fileId,
        storageFileId: sourceMaterial.storageFileId,
        mimeType: normalizeOptional(input.mimeType),
        size: input.size,
        extractedContent: sourceMaterial.extractedContent,
        extractionStatus: input.extractionStatus,
        extractionErrorMessage: normalizeOptional(input.extractionErrorMessage),
        status: 'uploaded'
      })
    )

    return {
      case: comparisonCase,
      document
    }
  }

  async registerSourceDocument(scope: ProcurementScope, input: RegisterSourceDocumentInput) {
    await this.requireCase(scope, input.caseId)
    const name = repairUtf8Mojibake(normalizeRequired(input.name, 'Document name is required.'))
    const sourceMaterial = requireSourceDocumentMaterial(input)

    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        caseId: input.caseId,
        role: input.role,
        supplierName: normalizeOptional(input.supplierName),
        name,
        fileAssetId: sourceMaterial.fileAssetId,
        fileId: sourceMaterial.fileId,
        storageFileId: sourceMaterial.storageFileId,
        mimeType: normalizeOptional(input.mimeType),
        size: input.size,
        extractedContent: sourceMaterial.extractedContent,
        extractionStatus: input.extractionStatus,
        extractionErrorMessage: normalizeOptional(input.extractionErrorMessage),
        status: 'uploaded'
      })
    )

    await this.updateCaseCounts(scope, input.caseId)
    return document
  }

  async deleteComparisonCase(scope: ProcurementScope, caseId: string) {
    await this.requireCase(scope, caseId)
    const where = scopedWhere(scope, { caseId })

    await this.matchRepository.delete(where)
    await this.riskRepository.delete(where)
    await this.recommendationRepository.delete(where)
    await this.quoteItemRepository.delete(where)
    await this.supplierQuoteRepository.delete(where)
    await this.requirementRepository.delete(where)
    await this.parseJobRepository.delete(where)
    await this.documentRepository.delete(where)
    await this.caseRepository.delete(scopedWhere(scope, { id: caseId }))

    return {
      deleted: true,
      caseId
    }
  }

  async saveRequirementExtraction(scope: ProcurementScope, input: SaveRequirementExtractionInput) {
    const comparisonCase = await this.requireCase(scope, input.caseId)
    const conflicts = mergeProjectFieldsWithoutOverwriting(comparisonCase, input.project)

    await this.caseRepository.save({
      ...comparisonCase,
      fieldConflicts: conflicts,
      status: 'parsed'
    })

    await this.requirementRepository.delete(scopedWhere(scope, { caseId: input.caseId }))

    const items = await this.requirementRepository.save(
      input.items.map((item) =>
        this.requirementRepository.create({
          ...scopedCreate(scope),
          caseId: input.caseId,
          name: item.name,
          specification: normalizeOptional(item.specification),
          quantity: item.quantity,
          unit: normalizeOptional(item.unit),
          budgetAmount: normalizeOptional(item.budgetAmount),
          expectedDeliveryDate: normalizeOptional(item.expectedDeliveryDate),
          requirements: normalizeOptional(item.requirements),
          rawText: normalizeOptional(item.rawText)
        })
      )
    )

    return {
      case: comparisonCase,
      fieldConflicts: conflicts,
      items
    }
  }

  async saveSupplierQuoteExtraction(scope: ProcurementScope, input: SaveSupplierQuoteExtractionInput) {
    await this.requireCase(scope, input.caseId)
    const supplierName = normalizeRequired(input.supplierName, 'Supplier name is required.')

    const existing =
      input.documentId != null
        ? await this.supplierQuoteRepository.findOne({
            where: scopedWhere(scope, { caseId: input.caseId, documentId: input.documentId })
          })
        : null

    const supplierQuote = await this.supplierQuoteRepository.save(
      this.supplierQuoteRepository.create({
        ...existing,
        ...scopedCreate(scope),
        caseId: input.caseId,
        documentId: normalizeOptional(input.documentId),
        supplierName,
        supplierContact: normalizeOptional(input.supplierContact),
        taxIncluded: input.taxIncluded,
        deliveryTime: normalizeOptional(input.deliveryTime),
        paymentTerms: normalizeOptional(input.paymentTerms),
        warranty: normalizeOptional(input.warranty),
        remarks: normalizeOptional(input.remarks)
      })
    )

    if (supplierQuote.id) {
      await this.quoteItemRepository.delete(scopedWhere(scope, { caseId: input.caseId, supplierQuoteId: supplierQuote.id }))
    }

    const items =
      supplierQuote.id == null
        ? []
        : await this.quoteItemRepository.save(
            input.items.map((item) =>
              this.quoteItemRepository.create({
                ...scopedCreate(scope),
                caseId: input.caseId,
                supplierQuoteId: supplierQuote.id,
                requirementItemId: normalizeOptional(item.requirementItemId),
                productName: item.productName,
                brand: normalizeOptional(item.brand),
                model: normalizeOptional(item.model),
                specification: normalizeOptional(item.specification),
                quantity: item.quantity,
                unit: normalizeOptional(item.unit),
                unitPrice: normalizeOptional(item.unitPrice),
                totalPrice: normalizeOptional(item.totalPrice),
                taxIncluded: item.taxIncluded,
                taxRate: normalizeOptional(item.taxRate),
                deliveryTime: normalizeOptional(item.deliveryTime),
                paymentTerms: normalizeOptional(item.paymentTerms),
                warranty: normalizeOptional(item.warranty),
                remarks: normalizeOptional(item.remarks),
                rawText: normalizeOptional(item.rawText)
              })
            )
          )

    if (input.documentId) {
      const document = await this.documentRepository.findOne({
        where: scopedWhere(scope, { id: input.documentId, caseId: input.caseId })
      })
      if (document) {
        await this.documentRepository.save({
          ...document,
          supplierQuoteId: supplierQuote.id,
          supplierName,
          status: 'parsed'
        })
      }
    }

    await this.updateCaseCounts(scope, input.caseId)

    return {
      supplierQuote,
      items
    }
  }

  async saveItemMatches(scope: ProcurementScope, input: SaveItemMatchesInput) {
    await this.requireCase(scope, input.caseId)
    await this.matchRepository.delete(scopedWhere(scope, { caseId: input.caseId }))
    const matches = await this.matchRepository.save(
      input.matches.map((match) =>
        this.matchRepository.create({
          ...scopedCreate(scope),
          caseId: input.caseId,
          requirementItemId: normalizeOptional(match.requirementItemId),
          quoteItemId: normalizeOptional(match.quoteItemId),
          supplierQuoteId: normalizeOptional(match.supplierQuoteId),
          status: match.status,
          confidence: match.confidence,
          explanation: normalizeOptional(match.explanation)
        })
      )
    )

    return { matches }
  }

  async saveRiskItems(scope: ProcurementScope, input: SaveRiskItemsInput) {
    await this.requireCase(scope, input.caseId)
    await this.riskRepository.delete(scopedWhere(scope, { caseId: input.caseId }))
    const risks = await this.riskRepository.save(
      input.risks.map((risk) =>
        this.riskRepository.create({
          ...scopedCreate(scope),
          caseId: input.caseId,
          supplierQuoteId: normalizeOptional(risk.supplierQuoteId),
          requirementItemId: normalizeOptional(risk.requirementItemId),
          quoteItemId: normalizeOptional(risk.quoteItemId),
          type: risk.type,
          severity: risk.severity,
          title: risk.title,
          description: risk.description,
          suggestion: normalizeOptional(risk.suggestion),
          status: 'pending'
        })
      )
    )

    await this.updateCaseCounts(scope, input.caseId)
    return { risks }
  }

  async finalizeRecommendation(scope: ProcurementScope, input: FinalizeRecommendationInput) {
    const comparisonCase = await this.requireCase(scope, input.caseId)
    await this.recommendationRepository.delete(scopedWhere(scope, { caseId: input.caseId }))

    const recommendation = await this.recommendationRepository.save(
      this.recommendationRepository.create({
        ...scopedCreate(scope),
        caseId: input.caseId,
        summary: input.summary,
        recommendedSupplier: normalizeOptional(input.recommendedSupplier),
        recommendedPlan: normalizeOptional(input.recommendedPlan),
        explanation: normalizeOptional(input.explanation),
        reportDraft: normalizeOptional(input.reportDraft),
        pendingQuestions: input.pendingQuestions
      })
    )

    await this.caseRepository.save({
      ...comparisonCase,
      status: 'reviewing',
      recommendationSummary: input.summary,
      recommendedSupplier: normalizeOptional(input.recommendedSupplier)
    })

    return { recommendation }
  }

  async reportParseFailure(scope: ProcurementScope, input: ReportParseFailureInput) {
    await this.requireCase(scope, input.caseId)
    const errorMessage = normalizeRequired(input.errorMessage, 'Parse error message is required.')

    if (input.parseJobId) {
      const job = await this.parseJobRepository.findOne({
        where: scopedWhere(scope, { id: input.parseJobId, caseId: input.caseId })
      })
      if (job) {
        await this.parseJobRepository.save({
          ...job,
          status: 'failed',
          errorMessage
        })
      }
    }

    if (input.documentId) {
      const document = await this.documentRepository.findOne({
        where: scopedWhere(scope, { id: input.documentId, caseId: input.caseId })
      })
      if (document) {
        await this.documentRepository.save({
          ...document,
          status: 'failed',
          errorMessage
        })
      }
    }

    return { status: 'failed', errorMessage }
  }

  async prepareRequirementParseChatMessage(
    scope: ProcurementScope,
    input: StartParseInput
  ): Promise<ProcurementAssistantChatCommand> {
    const comparisonCase = await this.requireCase(scope, input.caseId)
    const document = await this.findRequirementDocumentForParse(scope, input.caseId)

    const files = [documentToAssistantFile(document, 'requirement')].filter(hasAssistantFileHandle)
    const job = await this.createParseJob(scope, input.caseId, 'requirement', document.id)
    const clientMessageId = `procurement-requirement-parse:${job.id}`
    const savedJob = await this.parseJobRepository.save({
      ...job,
      taskId: job.id,
      clientMessageId,
      status: 'running'
    })

    await this.documentRepository.save({ ...document, status: 'parsing', errorMessage: undefined })
    await this.caseRepository.save({ ...comparisonCase, xpertId: input.xpertId, agentKey: input.agentKey, status: 'parsing' })

    return {
      commandKey: 'assistant.chat.send_message',
      payload: buildAssistantChatPayload({
        action: 'parse_requirement',
        caseId: input.caseId,
        document,
        parseJobId: savedJob.id ?? '',
        clientMessageId,
        files,
        text: buildRequirementParseChatPrompt(input.caseId, document, savedJob.id ?? '')
      }),
      caseId: input.caseId,
      documentId: document.id,
      parseJobId: savedJob.id,
      role: 'requirement'
    }
  }

  async prepareSupplierQuoteParseMessages(
    scope: ProcurementScope,
    input: StartParseInput
  ): Promise<PreparedSupplierQuoteParseMessages> {
    const comparisonCase = await this.requireCase(scope, input.caseId)
    const documents = await this.documentRepository.find({
      where: scopedWhere(scope, { caseId: input.caseId, role: 'supplier_quote' })
    })
    const maxConcurrency = clampConcurrency(input.maxConcurrency)
    const messages: ProcurementAssistantChatCommand[] = []
    let skipped = 0

    await this.caseRepository.save({ ...comparisonCase, xpertId: input.xpertId, agentKey: input.agentKey, status: 'parsing' })

    for (const document of documents) {
      const files = [documentToAssistantFile(document, 'supplier_quote')].filter(hasAssistantFileHandle)
      if (!files.length && !hasExtractedSourceDocumentContent(document)) {
        skipped += 1
        await this.documentRepository.save({
          ...document,
          status: 'failed',
          errorMessage: missingFileHandleMessage(document, 'supplier_quote')
        })
        continue
      }

      const job = await this.createParseJob(scope, input.caseId, 'supplier_quote', document.id)
      const clientMessageId = `procurement-quote-parse:${job.id}`
      const savedJob = await this.parseJobRepository.save({
        ...job,
        taskId: job.id,
        clientMessageId,
        status: 'running'
      })

      await this.documentRepository.save({ ...document, status: 'parsing', errorMessage: undefined })

      messages.push({
        commandKey: 'assistant.chat.send_message',
        payload: buildAssistantChatPayload({
          action: 'parse_supplier_quote',
          caseId: input.caseId,
          document,
          parseJobId: savedJob.id ?? '',
          clientMessageId,
          files,
          text: buildSupplierQuoteParseChatPrompt(input.caseId, document, savedJob.id ?? '')
        }),
        caseId: input.caseId,
        documentId: document.id,
        parseJobId: savedJob.id,
        role: 'supplier_quote'
      })
    }

    return {
      total: documents.length,
      prepared: messages.length,
      skipped,
      maxConcurrency,
      messages
    }
  }

  async markParseMessageDispatched(
    scope: ProcurementScope,
    input: {
      caseId: string
      parseJobId: string
      clientMessageId?: string
      conversationId?: string
      threadId?: string
    }
  ) {
    const job = await this.parseJobRepository.findOne({
      where: scopedWhere(scope, { id: input.parseJobId, caseId: input.caseId })
    })
    if (!job) {
      throw new NotFoundException('Parse job not found.')
    }

    const savedJob = await this.parseJobRepository.save({
      ...job,
      status: 'running',
      clientMessageId: normalizeOptional(input.clientMessageId) ?? job.clientMessageId,
      conversationId: normalizeOptional(input.conversationId) ?? job.conversationId,
      threadId: normalizeOptional(input.threadId) ?? job.threadId
    })

    return {
      id: savedJob.id,
      caseId: savedJob.caseId,
      documentId: savedJob.documentId,
      type: savedJob.type,
      status: savedJob.status,
      clientMessageId: savedJob.clientMessageId,
      conversationId: savedJob.conversationId,
      threadId: savedJob.threadId
    }
  }

  async startRequirementParse(scope: ProcurementScope, input: StartParseInput, options: StartParseOptions = {}) {
    const assistantTask = resolveAssistantTask(options)
    if (!assistantTask) {
      throw new BadRequestException('Assistant task runtime is not available.')
    }
    const comparisonCase = await this.requireCase(scope, input.caseId)
    const document = await this.findRequirementDocumentForParse(scope, input.caseId)

    const job = await this.createParseJob(scope, input.caseId, 'requirement', document.id)
    await this.documentRepository.save({ ...document, status: 'parsing' })
    await this.caseRepository.save({ ...comparisonCase, xpertId: input.xpertId, agentKey: input.agentKey, status: 'parsing' })

    const result = await assistantTask.startTask({
      xpertId: input.xpertId,
      agentKey: input.agentKey,
      conversationId: null,
      projectId: scope.projectId,
      taskId: job.id,
      clientMessageId: `procurement-requirement-parse:${job.id}`,
      prompt: buildRequirementParsePrompt(input.caseId, document.id ?? '', job.id ?? ''),
      files: [documentToAssistantFile(document, 'requirement')],
      context: {
        plugin: 'procurement_quote_comparison',
        caseId: input.caseId,
        documentId: document.id ?? null,
        parseJobId: job.id ?? null
      }
    })

    const savedJob = await this.parseJobRepository.save({
      ...job,
      taskId: result.taskId ?? job.id,
      executionId: result.executionId,
      conversationId: result.conversationId,
      threadId: result.threadId,
      clientMessageId: `procurement-requirement-parse:${job.id}`,
      status: normalizeParseJobStatus(result.status),
      errorMessage: result.errorMessage
    })

    return savedJob
  }

  async startSupplierQuoteParseBatch(scope: ProcurementScope, input: StartParseInput, options: StartParseOptions = {}) {
    const assistantTask = resolveAssistantTask(options)
    if (!assistantTask) {
      throw new BadRequestException('Assistant task runtime is not available.')
    }
    const comparisonCase = await this.requireCase(scope, input.caseId)
    const documents = await this.documentRepository.find({
      where: scopedWhere(scope, { caseId: input.caseId, role: 'supplier_quote' })
    })
    const maxConcurrency = clampConcurrency(input.maxConcurrency)
    let started = 0
    let failed = 0

    await this.caseRepository.save({ ...comparisonCase, xpertId: input.xpertId, agentKey: input.agentKey, status: 'parsing' })

    await runLimited(documents, maxConcurrency, async (document) => {
      const job = await this.createParseJob(scope, input.caseId, 'supplier_quote', document.id)
      await this.documentRepository.save({ ...document, status: 'parsing' })

      try {
        const result = await assistantTask.startTask({
          xpertId: input.xpertId,
          agentKey: input.agentKey,
          conversationId: null,
          projectId: scope.projectId,
          taskId: job.id,
          clientMessageId: `procurement-quote-parse:${job.id}`,
          prompt: buildSupplierQuoteParsePrompt(input.caseId, document.id ?? '', job.id ?? ''),
          files: [documentToAssistantFile(document, 'supplier_quote')],
          context: {
            plugin: 'procurement_quote_comparison',
            caseId: input.caseId,
            documentId: document.id ?? null,
            parseJobId: job.id ?? null
          }
        })

        await this.parseJobRepository.save({
          ...job,
          taskId: result.taskId ?? job.id,
          executionId: result.executionId,
          conversationId: result.conversationId,
          threadId: result.threadId,
          clientMessageId: `procurement-quote-parse:${job.id}`,
          status: normalizeParseJobStatus(result.status),
          errorMessage: result.errorMessage
        })
        started += 1
      } catch (error) {
        failed += 1
        await this.parseJobRepository.save({
          ...job,
          status: 'failed',
          errorMessage: getErrorMessage(error)
        })
        await this.documentRepository.save({
          ...document,
          status: 'failed',
          errorMessage: getErrorMessage(error)
        })
      }
    })

    return {
      total: documents.length,
      started,
      failed,
      maxConcurrency
    }
  }

  async getWorkbenchData(scope: ProcurementScope, query: ProcurementWorkbenchQuery = {}) {
    if (query.caseId) {
      return this.getCaseDetail(scope, query.caseId)
    }

    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const search = query.search?.trim().toLowerCase() ?? ''
    const cases = await this.caseRepository.find({ where: scopedWhere(scope) })
    const filteredCases = search
      ? cases.filter((item) =>
          [item.title, item.purchaseNo, item.applicant, item.department, item.recommendedSupplier]
            .filter(isString)
            .some((value) => value.toLowerCase().includes(search))
        )
      : cases
    const start = (page - 1) * pageSize

    return {
      items: filteredCases.slice(start, start + pageSize),
      total: filteredCases.length,
      summary: {
        page,
        pageSize,
        search,
        xpertConfigured: filteredCases.some((item) => isNonEmptyString(item.xpertId))
      }
    }
  }

  private async getCaseDetail(scope: ProcurementScope, caseId: string) {
    const comparisonCase = await this.requireCase(scope, caseId)
    const [documents, parseJobs, requirementItems, supplierQuotes, quoteItems, itemMatches, risks, recommendations] =
      await Promise.all([
        this.documentRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.parseJobRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.requirementRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.supplierQuoteRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.quoteItemRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.matchRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.riskRepository.find({ where: scopedWhere(scope, { caseId }) }),
        this.recommendationRepository.find({ where: scopedWhere(scope, { caseId }) })
      ])

    return {
      item: {
        case: comparisonCase,
        documents,
        parseJobs,
        requirementItems,
        supplierQuotes,
        quoteItems,
        itemMatches,
        risks,
        recommendation: recommendations[0] ?? null
      },
      total: 1,
      summary: {
        supplierCount: supplierQuotes.length,
        riskCount: risks.length,
        requirementItemCount: requirementItems.length,
        xpertConfigured: isNonEmptyString(comparisonCase.xpertId)
      }
    }
  }

  private async requireCase(scope: ProcurementScope, caseId: string) {
    const comparisonCase = await this.caseRepository.findOne({
      where: scopedWhere(scope, { id: caseId })
    })
    if (!comparisonCase) {
      throw new NotFoundException('Procurement comparison case was not found.')
    }
    return comparisonCase
  }

  private async createParseJob(
    scope: ProcurementScope,
    caseId: string,
    type: ProcurementParseJob['type'],
    documentId?: string
  ) {
    return this.parseJobRepository.save(
      this.parseJobRepository.create({
        ...scopedCreate(scope),
        caseId,
        documentId,
        type,
        status: 'queued'
      })
    )
  }

  private async updateCaseCounts(scope: ProcurementScope, caseId: string) {
    const comparisonCase = await this.requireCase(scope, caseId)
    const [supplierQuotes, risks] = await Promise.all([
      this.supplierQuoteRepository.find({ where: scopedWhere(scope, { caseId }) }),
      this.riskRepository.find({ where: scopedWhere(scope, { caseId }) })
    ])

    await this.caseRepository.save({
      ...comparisonCase,
      supplierCount: supplierQuotes.length,
      riskCount: risks.length
    })
  }

  private async findRequirementDocumentForParse(scope: ProcurementScope, caseId: string) {
    const documents = await this.documentRepository.find({
      where: scopedWhere(scope, { caseId, role: 'requirement' })
    })
    if (!documents.length) {
      throw new BadRequestException('No procurement requirement document has been uploaded.')
    }

    const document = [...documents].sort(compareRequirementDocumentsForParse)[0]
    if (!hasSourceDocumentMaterial(document)) {
      throw new BadRequestException(missingFileHandleMessage(document, 'requirement'))
    }
    return document
  }
}

function scopedCreate(scope: ProcurementScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function scopedWhere<T extends ScopedEntity>(
  scope: ProcurementScope,
  extra?: (Partial<T> & ScopedQueryFields) | ScopedQueryFields
): Partial<T> & ScopedQueryFields {
  const where = {
    tenantId: scope.tenantId
  } as Partial<T> & ScopedQueryFields

  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }

  return {
    ...where,
    ...extra
  }
}

function normalizeRequired(value: string | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function requireSourceDocumentMaterial(input: {
  fileAssetId?: string
  fileId?: string
  storageFileId?: string
  extractedContent?: string
  extractionErrorMessage?: string
}) {
  const fileAssetId = normalizeOptional(input.fileAssetId)
  const fileId = normalizeOptional(input.fileId)
  const storageFileId = normalizeOptional(input.storageFileId)
  const extractedContent = normalizeOptional(input.extractedContent)
  if (!fileAssetId && !fileId && !storageFileId && !extractedContent) {
    throw new BadRequestException(
      normalizeOptional(input.extractionErrorMessage) ?? 'Uploaded source document was not persisted to platform storage.'
    )
  }
  return {
    fileAssetId,
    fileId,
    storageFileId,
    extractedContent
  }
}

function repairUtf8Mojibake(value: string) {
  if (!looksLikeUtf8Mojibake(value)) {
    return value
  }

  const repaired = Buffer.from(value, 'latin1').toString('utf8')
  return repaired.includes('\uFFFD') ? value : repaired
}

function looksLikeUtf8Mojibake(value: string) {
  return /[ÃÂ][\x80-\xBF]?|[äåæçèéêëìíîïðñòóôõöøùúûüýþ][\x80-\xBF]/i.test(value)
}

function createTitleFromDocumentName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || '采购需求单'
}

function createRequirementPurchaseNo() {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('')
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `REQ-${date}-${suffix}`
}

function mergeProjectFieldsWithoutOverwriting(
  comparisonCase: ProcurementComparisonCase,
  project: SaveRequirementExtractionInput['project']
) {
  const nextConflicts: ProcurementFieldConflict[] = [...(comparisonCase.fieldConflicts ?? [])]
  if (!project) {
    return nextConflicts
  }

  for (const field of PROJECT_FILLABLE_FIELDS) {
    const parsedValue = normalizeOptional(project[field])
    if (!parsedValue) {
      continue
    }

    const manualValue = normalizeOptional(comparisonCase[field])
    if (!manualValue) {
      comparisonCase[field] = parsedValue
      continue
    }

    if (manualValue !== parsedValue) {
      nextConflicts.push({
        field,
        manualValue,
        parsedValue
      })
    }
  }

  return nextConflicts
}

function resolveAssistantTask(options: StartParseOptions): AssistantTaskStarter | null {
  if (options.assistantTask) {
    return options.assistantTask
  }
  if (options.startTask) {
    return {
      startTask: options.startTask
    }
  }
  return null
}

function clampConcurrency(value: number | undefined) {
  if (value == null || Number.isNaN(value)) {
    return 2
  }
  return Math.min(3, Math.max(1, Math.floor(value)))
}

async function runLimited<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor]
      cursor += 1
      await worker(current)
    }
  })
  await Promise.all(workers)
}

function documentToAssistantFile(document: ProcurementSourceDocument, role: string) {
  const fileAssetId = normalizeOptional(document.fileAssetId) ?? normalizeOptional(document.fileId)
  const storageFileId = normalizeOptional(document.storageFileId)
  return {
    id: fileAssetId ?? storageFileId,
    fileId: fileAssetId,
    fileAssetId,
    storageFileId,
    name: document.name,
    originalName: document.name,
    mimeType: document.mimeType,
    mimetype: document.mimeType,
    size: document.size,
    role
  }
}

function compareRequirementDocumentsForParse(left: ProcurementSourceDocument, right: ProcurementSourceDocument) {
  const leftHasHandle = hasSourceDocumentFileHandle(left)
  const rightHasHandle = hasSourceDocumentFileHandle(right)
  if (leftHasHandle !== rightHasHandle) {
    return leftHasHandle ? -1 : 1
  }

  const leftHasExtractedContent = hasExtractedSourceDocumentContent(left)
  const rightHasExtractedContent = hasExtractedSourceDocumentContent(right)
  if (leftHasExtractedContent !== rightHasExtractedContent) {
    return leftHasExtractedContent ? -1 : 1
  }

  return getDocumentTimestamp(right) - getDocumentTimestamp(left)
}

function getDocumentTimestamp(document: ProcurementSourceDocument) {
  const value = document.updatedAt ?? document.createdAt
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }
  return 0
}

function hasSourceDocumentFileHandle(document: ProcurementSourceDocument) {
  return (
    isNonEmptyString(document.fileAssetId) ||
    isNonEmptyString(document.fileId) ||
    isNonEmptyString(document.storageFileId)
  )
}

function hasExtractedSourceDocumentContent(document: ProcurementSourceDocument) {
  return isNonEmptyString(document.extractedContent)
}

function hasSourceDocumentMaterial(document: ProcurementSourceDocument) {
  return hasSourceDocumentFileHandle(document) || hasExtractedSourceDocumentContent(document)
}

function normalizeParseJobStatus(status: string | undefined): ProcurementParseJobStatus {
  if (status === 'queued' || status === 'running' || status === 'succeeded' || status === 'failed' || status === 'interrupted') {
    return status
  }
  return 'running'
}

function buildRequirementParsePrompt(caseId: string, documentId: string, parseJobId: string) {
  return [
    'Parse the procurement requirement document for the procurement quote comparison workbench.',
    `caseId: ${caseId}`,
    `documentId: ${documentId}`,
    `parseJobId: ${parseJobId}`,
    'Extract project fields and requirement line items.',
    'After extraction, call procurement_save_requirement with the caseId and structured result.',
    'Do not overwrite manually entered fields. The plugin service preserves manual values and records conflicts.'
  ].join('\n')
}

function buildSupplierQuoteParsePrompt(caseId: string, documentId: string, parseJobId: string) {
  return [
    'Parse one supplier quote document for the procurement quote comparison workbench.',
    `caseId: ${caseId}`,
    `documentId: ${documentId}`,
    `parseJobId: ${parseJobId}`,
    'Extract supplier information, commercial terms, and quote line items.',
    'After extraction, call procurement_save_supplier_quote with the documentId and structured result.',
    'This task is independent. Do not reuse context from other supplier quote documents.'
  ].join('\n')
}

function buildRequirementParseChatPrompt(
  caseId: string,
  document: ProcurementSourceDocument,
  parseJobId: string
) {
  const sourceSummary = buildSourceSummary([document])
  const instruction = hasSourceDocumentFileHandle(document)
    ? '你必须读取本消息附带的采购需求单文件，不要只根据文件名或来源文件摘要猜测内容。'
    : '本消息没有可用的平台文件附件；你必须根据下方“插件提取内容”解析，不要只根据文件名或来源文件摘要猜测内容。'
  return [
    '你正在解析一个采购需求单，用于“采购比价助手”工作台。',
    instruction,
    '',
    `caseId: ${caseId}`,
    `documentId: ${document.id ?? ''}`,
    `parseJobId: ${parseJobId}`,
    `文件名: ${document.name}`,
    '',
    '请完成以下工作：',
    '1. 识别采购项目字段：项目名称、采购编号、申请人、部门、预算、期望交期、需求说明。',
    '2. 识别采购需求明细：名称、规格、数量、单位、预算、交期、验收或商务要求。',
    '3. 调用 procurement_save_requirement 保存结构化结果，必须带上 caseId。',
    '4. 如果内容不足以解析，请调用 procurement_report_parse_failure，并带上 caseId、documentId、parseJobId 和失败原因。',
    '5. 人工已填写字段由插件服务保留并记录冲突，你只需要按抽取结果提交。',
    '',
    '来源文件：',
    sourceSummary,
    ...buildExtractedContentSection(document)
  ].join('\n')
}

function buildSupplierQuoteParseChatPrompt(
  caseId: string,
  document: ProcurementSourceDocument,
  parseJobId: string
) {
  const sourceSummary = buildSourceSummary([document])
  const instruction = hasSourceDocumentFileHandle(document)
    ? '你必须只读取本消息附带的这一份报价单文件，不要混入其他供应商报价，也不要只根据文件名或来源文件摘要猜测内容。'
    : '本消息没有可用的平台文件附件；你必须只根据下方“插件提取内容”解析这一份报价单，不要混入其他供应商报价。'
  return [
    '你正在解析一份供应商报价单，用于“采购比价助手”工作台。',
    instruction,
    '',
    `caseId: ${caseId}`,
    `documentId: ${document.id ?? ''}`,
    `parseJobId: ${parseJobId}`,
    `文件名: ${document.name}`,
    '',
    '请完成以下工作：',
    '1. 识别供应商名称、联系人、是否含税、交期、付款条款、质保、备注。',
    '2. 识别报价明细：商品名称、品牌、型号、规格、数量、单位、单价、合计、税率、交期、付款条款、质保、备注。',
    '3. 调用 procurement_save_supplier_quote 保存结构化结果，必须带上 caseId 和 documentId。',
    '4. 如果内容不足以解析，请调用 procurement_report_parse_failure，并带上 caseId、documentId、parseJobId 和失败原因。',
    '',
    '来源文件：',
    sourceSummary,
    ...buildExtractedContentSection(document)
  ].join('\n')
}

function buildExtractedContentSection(document: ProcurementSourceDocument) {
  const extractedContent = normalizeOptional(document.extractedContent)
  if (!extractedContent) {
    return []
  }

  return [
    '',
    '插件提取内容：',
    '以下是插件从上传文件中提取的文本内容，请优先基于这些内容解析：',
    truncateExtractedContentForPrompt(extractedContent)
  ]
}

function truncateExtractedContentForPrompt(content: string) {
  const limit = 60000
  if (content.length <= limit) {
    return content
  }
  return `${content.slice(0, limit)}\n...内容过长，已截断。`
}

function buildAssistantChatPayload(input: {
  action: string
  caseId: string
  document: ProcurementSourceDocument
  parseJobId: string
  clientMessageId: string
  files: Array<ReturnType<typeof documentToAssistantFile>>
  text: string
}): ProcurementAssistantChatCommand['payload'] {
  return {
    text: input.text,
    clientMessageId: input.clientMessageId,
    files: input.files,
    attachments: input.files.map(toChatAttachment).filter((item): item is ProcurementAssistantChatCommand['payload']['attachments'][number] => Boolean(item)),
    references: input.files.map((file, index) => toChatFileReference(file, index)),
    followUpMode: 'queue',
    state: {
      procurementQuoteComparison: {
        action: input.action,
        caseId: input.caseId,
        documentId: input.document.id,
        parseJobId: input.parseJobId
      }
    }
  }
}

function toChatAttachment(
  file: ReturnType<typeof documentToAssistantFile>
): ProcurementAssistantChatCommand['payload']['attachments'][number] | null {
  const id = normalizeOptional(file.fileAssetId) ?? normalizeOptional(file.fileId) ?? normalizeOptional(file.id) ?? normalizeOptional(file.storageFileId)
  if (!id) {
    return null
  }
  return {
    type: 'file',
    id,
    name: normalizeOptional(file.name) ?? normalizeOptional(file.originalName) ?? 'source-document',
    mime_type: normalizeOptional(file.mimeType) ?? normalizeOptional(file.mimetype) ?? 'application/octet-stream'
  }
}

function toChatFileReference(
  file: ReturnType<typeof documentToAssistantFile>,
  index: number
): ProcurementAssistantChatCommand['payload']['references'][number] {
  const fileId = normalizeOptional(file.fileAssetId) ?? normalizeOptional(file.fileId) ?? normalizeOptional(file.storageFileId) ?? '-'
  const name = normalizeOptional(file.name) ?? normalizeOptional(file.originalName) ?? `source-document-${index + 1}`
  const role = normalizeOptional(file.role) ?? 'other'
  return {
    type: 'quote',
    label: name,
    source: 'Procurement quote comparison source document',
    text: [
      `Source document ${index + 1}`,
      `role=${role}`,
      `name=${name}`,
      `fileId=${fileId}`,
      `mimeType=${normalizeOptional(file.mimeType) ?? normalizeOptional(file.mimetype) ?? '-'}`,
      `size=${file.size ?? '-'}`
    ].join('\n')
  }
}

function hasAssistantFileHandle(file: ReturnType<typeof documentToAssistantFile>) {
  return isNonEmptyString(file.fileAssetId) || isNonEmptyString(file.fileId) || isNonEmptyString(file.storageFileId)
}

function missingFileHandleMessage(document: ProcurementSourceDocument, role: ProcurementDocumentRole) {
  const label = role === 'requirement' ? 'procurement requirement' : 'supplier quote'
  return `The uploaded ${label} document '${repairUtf8Mojibake(document.name)}' has no platform file handle. Re-upload it and try parsing again.`
}

function buildSourceSummary(documents: ProcurementSourceDocument[]) {
  return (
    documents
      .map((document, index) => {
        const fileId = normalizeOptional(document.fileAssetId) ?? normalizeOptional(document.fileId) ?? normalizeOptional(document.storageFileId) ?? '-'
        return `${index + 1}. role=${document.role}; name=${document.name}; fileId=${fileId}; mimeType=${document.mimeType ?? '-'}; size=${document.size ?? '-'}`
      })
      .join('\n') || '-'
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unknown parse task error.'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
