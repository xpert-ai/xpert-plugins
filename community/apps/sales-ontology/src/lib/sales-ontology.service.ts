import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import { Repository } from 'typeorm'
import {
  SalesOntologyActionProposal,
  SalesOntologyDecisionEffect,
  SalesOntologyDecisionRun,
  SalesOntologyExecutionLog,
  SalesOntologyMemory,
  SalesOntologyNotification,
  SalesOntologyPerceptionResult,
  SalesOntologyReminder,
  SalesOntologyScenario,
  SalesOntologySuggestion
} from './entities/index.js'
import {
  SALES_ONTOLOGY_DEMO_INFERENCE_RULES,
  SALES_ONTOLOGY_DEMO_NOTIFICATIONS,
  SALES_ONTOLOGY_DEMO_OBJECT_ACTIONS,
  SALES_ONTOLOGY_DEMO_OBJECTS,
  SALES_ONTOLOGY_DEMO_PROPOSALS,
  SALES_ONTOLOGY_DEMO_RELATIONS,
  SALES_ONTOLOGY_DEMO_REMINDERS,
  SALES_ONTOLOGY_DEMO_SCENARIOS,
  SALES_ONTOLOGY_DEMO_SEED_SOURCE,
  SalesOntologyDemoObject,
  SalesOntologyDemoProposal,
  SalesOntologyDemoRelation
} from './sales-ontology-demo-seed.js'
import {
  SalesOntologyClientService,
  type SalesOntologyBusinessOntologyNeighborhoodResponse,
  type SalesOntologyBusinessOntologyPublishResponse
} from './sales-ontology-client.service.js'
import {
  SalesOntologyObjectSummary,
  SalesOntologyActionInput,
  SalesOntologyAttribute,
  SalesOntologyEntityInput,
  SalesOntologyManifest,
  SalesOntologyPublishInput,
  SalesOntologyRelationInput,
  SalesOntologyPriority,
  SalesOntologyRunType,
  SalesOntologyScope
} from './types.js'

const SALES_ONTOLOGY_MANIFEST: SalesOntologyManifest = {
  adapterId: 'sales-ontology',
  version: {
    semanticVersion: '1.0.0',
    notes: 'Sales Ontology business decision ontology for data-xpert business_ontology resources.'
  },
  entityTypes: [
    {
      code: 'sales_ontology_object',
      name: 'Business Object',
      description: 'Customer, doctor, hospital, target, compliance alert, or other sales-domain business object.',
      defaultStateCode: 'active',
      attributes: [
        attr('object_type', 'Object Type'),
        attr('domain', 'Domain'),
        attr('status', 'Status'),
        attr('lifecycle_stage', 'Lifecycle Stage'),
        attr('sentiment', 'Sentiment'),
        attr('compliance_risk_level', 'Compliance Risk Level'),
        attr('owner_id', 'Owner'),
        attr('stakeholders', 'Stakeholders', 'json'),
        attr('properties', 'Properties', 'json'),
        attr('source_system', 'Source System'),
        attr('source_record_id', 'Source Record ID')
      ]
    },
    {
      code: 'sales_ontology_event',
      name: 'Business Event',
      defaultStateCode: 'active',
      attributes: [
        attr('event_type', 'Event Type'),
        attr('timestamp', 'Timestamp', 'datetime'),
        attr('description', 'Description'),
        attr('related_object_id', 'Related Object ID'),
        attr('properties', 'Properties', 'json')
      ]
    },
    {
      code: 'sales_ontology_time_series',
      name: 'Time Series Point',
      defaultStateCode: 'active',
      attributes: [
        attr('series_name', 'Series'),
        attr('timestamp', 'Timestamp', 'datetime'),
        attr('value', 'Value', 'number'),
        attr('properties', 'Properties', 'json')
      ]
    },
    {
      code: 'sales_ontology_action_definition',
      name: 'Action Definition',
      defaultStateCode: 'active',
      attributes: [
        attr('name', 'Name'),
        attr('description', 'Description'),
        attr('requires_approval', 'Requires Approval', 'boolean'),
        attr('preconditions', 'Preconditions', 'json'),
        attr('side_effects', 'Side Effects', 'json'),
        attr('write_back_targets', 'Write Back Targets', 'json'),
        attr('parameters', 'Parameters', 'json')
      ]
    },
    {
      code: 'sales_ontology_insight',
      name: 'Insight',
      defaultStateCode: 'active',
      attributes: jsonDecisionAttributes()
    },
    {
      code: 'sales_ontology_suggestion',
      name: 'Suggestion',
      defaultStateCode: 'active',
      attributes: jsonDecisionAttributes()
    },
    {
      code: 'sales_ontology_action_proposal',
      name: 'Action Proposal',
      defaultStateCode: 'pending',
      attributes: jsonDecisionAttributes()
    }
  ],
  relationTypes: [
    {
      code: 'sales_ontology_object_link',
      name: 'Object Link',
      sourceEntityTypeCode: 'sales_ontology_object',
      targetEntityTypeCode: 'sales_ontology_object',
      cardinality: 'many_to_many',
      attributes: [
        attr('link_type', 'Link Type'),
        attr('strength', 'Strength', 'number'),
        attr('frequency', 'Frequency', 'number'),
        attr('volume', 'Volume', 'number'),
        attr('confidence', 'Confidence', 'number'),
        attr('valid_from', 'Valid From', 'datetime'),
        attr('valid_to', 'Valid To', 'datetime'),
        attr('inverse_relation', 'Inverse Relation')
      ]
    },
    {
      code: 'sales_ontology_object_has_event',
      name: 'Object Has Event',
      sourceEntityTypeCode: 'sales_ontology_object',
      targetEntityTypeCode: 'sales_ontology_event',
      cardinality: 'one_to_many',
      attributes: []
    },
    {
      code: 'sales_ontology_object_has_time_series',
      name: 'Object Has Time Series',
      sourceEntityTypeCode: 'sales_ontology_object',
      targetEntityTypeCode: 'sales_ontology_time_series',
      cardinality: 'one_to_many',
      attributes: []
    },
    {
      code: 'sales_ontology_object_supports_action',
      name: 'Object Supports Action',
      sourceEntityTypeCode: 'sales_ontology_object',
      targetEntityTypeCode: 'sales_ontology_action_definition',
      cardinality: 'many_to_many',
      attributes: []
    },
    {
      code: 'sales_ontology_suggestion_targets_object',
      name: 'Suggestion Targets Object',
      sourceEntityTypeCode: 'sales_ontology_suggestion',
      targetEntityTypeCode: 'sales_ontology_object',
      cardinality: 'many_to_many',
      attributes: [attr('confidence', 'Confidence', 'number')]
    },
    {
      code: 'sales_ontology_insight_mentions_object',
      name: 'Insight Mentions Object',
      sourceEntityTypeCode: 'sales_ontology_insight',
      targetEntityTypeCode: 'sales_ontology_object',
      cardinality: 'many_to_many',
      attributes: [attr('confidence', 'Confidence', 'number')]
    },
    {
      code: 'sales_ontology_proposal_targets_object',
      name: 'Proposal Targets Object',
      sourceEntityTypeCode: 'sales_ontology_action_proposal',
      targetEntityTypeCode: 'sales_ontology_object',
      cardinality: 'many_to_many',
      attributes: [attr('confidence', 'Confidence', 'number')]
    }
  ],
  actionTypes: [
    {
      code: 'sales_ontology.schedule_visit',
      name: 'Schedule Visit',
      targetEntityTypeCodes: ['sales_ontology_object'],
      riskLevel: 'LOW',
      requiresApproval: false,
      discoveryMode: 'suggestable',
      attributes: []
    },
    {
      code: 'sales_ontology.update_sentiment',
      name: 'Update Sentiment',
      targetEntityTypeCodes: ['sales_ontology_object'],
      riskLevel: 'MEDIUM',
      requiresApproval: true,
      discoveryMode: 'suggestable',
      attributes: []
    },
    {
      code: 'sales_ontology.flag_compliance_risk',
      name: 'Flag Compliance Risk',
      targetEntityTypeCodes: ['sales_ontology_object'],
      riskLevel: 'HIGH',
      requiresApproval: true,
      discoveryMode: 'manual_only',
      attributes: []
    },
    {
      code: 'sales_ontology.send_notification',
      name: 'Send Notification',
      targetEntityTypeCodes: ['sales_ontology_object'],
      riskLevel: 'MEDIUM',
      requiresApproval: true,
      discoveryMode: 'suggestable',
      attributes: []
    },
    {
      code: 'sales_ontology.propose_action',
      name: 'Propose Action',
      targetEntityTypeCodes: ['sales_ontology_object'],
      riskLevel: 'LOW',
      requiresApproval: false,
      discoveryMode: 'auto_plannable',
      attributes: []
    },
    ...[
      ['sales_ontology.mark_as_at_risk', 'Mark As At Risk', 'MEDIUM', true],
      ['sales_ontology.generate_visit_brief', 'Generate Visit Brief', 'LOW', false],
      ['sales_ontology.update_access_status', 'Update Access Status', 'MEDIUM', true],
      ['sales_ontology.dismiss_alert', 'Dismiss Alert', 'MEDIUM', true],
      ['sales_ontology.escalate_alert', 'Escalate Alert', 'HIGH', true],
      ['sales_ontology.approve_plan', 'Approve Plan', 'MEDIUM', true],
      ['sales_ontology.reject_plan', 'Reject Plan', 'MEDIUM', true],
      ['sales_ontology.update_actual_value', 'Update Actual Value', 'MEDIUM', true],
      ['sales_ontology.allocate_budget', 'Allocate Budget', 'HIGH', true],
      ['sales_ontology.advance_cycle', 'Advance Cycle', 'MEDIUM', true],
      ['sales_ontology.update_status', 'Update Status', 'MEDIUM', true],
      ['sales_ontology.invite_to_event', 'Invite To Event', 'LOW', false]
    ].map(([code, name, riskLevel, requiresApproval]) => ({
      code: code as string,
      name: name as string,
      targetEntityTypeCodes: ['sales_ontology_object'],
      riskLevel: riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
      requiresApproval: Boolean(requiresApproval),
      discoveryMode: 'suggestable' as const,
      attributes: []
    }))
  ],
  states: [
    { code: 'active', name: 'Active' },
    { code: 'pending', name: 'Pending' },
    { code: 'approved', name: 'Approved' },
    { code: 'rejected', name: 'Rejected' },
    { code: 'executed', name: 'Executed' },
    { code: 'failed', name: 'Failed' }
  ],
  rules: [],
  metrics: [],
  policies: []
}

const SALES_ONTOLOGY_DOMAIN_ONTOLOGY = {
  RevenueManagement: {
    description: 'Revenue target management: sales flow, market potential, hospital development, territory performance.',
    objectTypes: ['SalesFlow', 'MarketPotential', 'HospitalDevelopment', 'TerritoryPerformance', 'ProductFlow', 'SalesTarget'],
    relations: ['FLOWS_TO', 'POTENTIAL_OF', 'ACHIEVES', 'CONTAINS'],
    rules: ['revenue.aggregation', 'flow.balance', 'achievement.calculation']
  },
  CustomerManagement: {
    description: 'Customer management: categorization, visit feedback, PDCA plans, one-hospital-one-strategy.',
    objectTypes: ['CustomerCategory', 'VisitFeedback', 'PDCAPlan', 'HospitalStrategy', 'DepartmentResearch', 'Doctor', 'Hospital'],
    relations: ['CATEGORIZED_AS', 'FEEDS_BACK', 'FOLLOWS', 'STRATEGY_FOR', 'WORKS_AT', 'MANAGED_BY'],
    rules: ['customer.category.scoring', 'visit.feedback.followup', 'pdca.lifecycle']
  },
  ExpenseManagement: {
    description: 'Expense governance: budgets, classifications, labor payments, ROI and utilization.',
    objectTypes: ['BudgetCategory', 'ExpenseClassification', 'LaborPayment', 'ExpenseROI', 'ResourceAllocation'],
    relations: ['ALLOCATED_TO', 'CLASSIFIED_AS', 'GENERATES_ROI', 'PAID_TO'],
    rules: ['budget.execution.rate', 'roi.calculation', 'expense.compliance']
  },
  MedicalAffairs: {
    description: 'Medical affairs: real-world studies, academic events, publications and medical evidence.',
    objectTypes: ['RWSProject', 'AcademicEvent', 'Publication', 'MedicalEvidence'],
    relations: ['SUPPORTS', 'INVITED_TO', 'PUBLISHED_BY', 'EVIDENCES'],
    rules: ['medical.evidence.traceability', 'event.alignment', 'rws.lifecycle']
  },
  ComplianceManagement: {
    description: 'Compliance management: risk alerts, audit findings, policy controls and remediation plans.',
    objectTypes: ['ComplianceAlert', 'AuditFinding', 'PolicyRule', 'RecoveryPlan'],
    relations: ['VIOLATES', 'COMPLIES_WITH', 'HAS_ALERT', 'MITIGATED_BY'],
    rules: ['compliance.risk.escalation', 'policy.violation.detection', 'recovery.approval']
  }
}

const LIFECYCLE_TRANSITIONS: Record<string, Record<string, string[]>> = {
  Doctor: {
    new: ['active', 'at_risk'],
    active: ['at_risk', 'churned', 'loyal'],
    at_risk: ['active', 'churned'],
    loyal: ['at_risk', 'churned'],
    churned: ['reactivated'],
    reactivated: ['active', 'at_risk']
  },
  Hospital: {
    new: ['active', 'at_risk'],
    active: ['at_risk', 'churned', 'loyal'],
    at_risk: ['active', 'churned'],
    loyal: ['at_risk'],
    churned: ['reactivated'],
    reactivated: ['active', 'at_risk']
  },
  Product: {
    new: ['active', 'discontinued'],
    active: ['declining', 'discontinued'],
    declining: ['active', 'discontinued'],
    discontinued: []
  },
  SalesTarget: {
    new: ['in_progress', 'at_risk'],
    in_progress: ['completed', 'at_risk'],
    at_risk: ['in_progress', 'failed'],
    completed: [],
    failed: ['in_progress']
  },
  ComplianceAlert: {
    pending: ['investigating', 'dismissed', 'escalated'],
    investigating: ['resolved', 'escalated'],
    escalated: ['resolved', 'dismissed'],
    resolved: [],
    dismissed: ['pending']
  },
  PDCAPlan: {
    new: ['planning', 'at_risk'],
    planning: ['executing', 'at_risk'],
    executing: ['checking', 'at_risk'],
    checking: ['acting', 'at_risk'],
    acting: ['completed', 'at_risk'],
    at_risk: ['planning'],
    completed: []
  }
}

@Injectable()
export class SalesOntologyService {
  constructor(
    @InjectRepository(SalesOntologyDecisionRun)
    private readonly decisionRunRepository: Repository<SalesOntologyDecisionRun>,
    @InjectRepository(SalesOntologyPerceptionResult)
    private readonly perceptionRepository: Repository<SalesOntologyPerceptionResult>,
    @InjectRepository(SalesOntologySuggestion)
    private readonly suggestionRepository: Repository<SalesOntologySuggestion>,
    @InjectRepository(SalesOntologyActionProposal)
    private readonly proposalRepository: Repository<SalesOntologyActionProposal>,
    @InjectRepository(SalesOntologyExecutionLog)
    private readonly executionLogRepository: Repository<SalesOntologyExecutionLog>,
    @InjectRepository(SalesOntologyDecisionEffect)
    private readonly decisionEffectRepository: Repository<SalesOntologyDecisionEffect>,
    @InjectRepository(SalesOntologyNotification)
    private readonly notificationRepository: Repository<SalesOntologyNotification>,
    @InjectRepository(SalesOntologyReminder)
    private readonly reminderRepository: Repository<SalesOntologyReminder>,
    @InjectRepository(SalesOntologyScenario)
    private readonly scenarioRepository: Repository<SalesOntologyScenario>,
    @InjectRepository(SalesOntologyMemory)
    private readonly memoryRepository: Repository<SalesOntologyMemory>,
    private readonly ontologyClient: SalesOntologyClientService
  ) {}

  getDefaultManifest(): SalesOntologyManifest {
    return SALES_ONTOLOGY_MANIFEST
  }

  getDomainOntology() {
    return {
      manifest: SALES_ONTOLOGY_MANIFEST,
      domains: SALES_ONTOLOGY_DOMAIN_ONTOLOGY,
      lifecycleTransitions: LIFECYCLE_TRANSITIONS,
      implementedReasoningTypes: [
        'consistency',
        'causal',
        'temporal',
        'implicit_relations',
        'abductive',
        'attribution',
        'attribution_dimensions',
        'attribution_validate',
        'attribution_report',
        'analogy',
        'counterfactual',
        'hierarchical',
        'multi_step',
        'constraint_check',
        'coordination'
      ],
      executableActions: SALES_ONTOLOGY_MANIFEST.actionTypes.map((item) => ({
        code: item.code,
        name: item.name,
        riskLevel: item.riskLevel,
        requiresApproval: item.requiresApproval
      }))
    }
  }

  async seedDatabase(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const resourceId = this.resourceId(readString(input['resourceId']))
    const publishOntology = input['publishOntology'] !== false
    const includeInternalRecords = input['includeInternalRecords'] !== false
    const syncMode = readString(input['syncMode']) === 'replace_snapshot' ? 'replace_snapshot' : 'merge'
    const seedObjects = SALES_ONTOLOGY_DEMO_OBJECTS.map(demoObjectToSummary)
    const seedRunId = stableSeedId(scope, 'run', 'seed_database')
    const sourceEvidence = [SALES_ONTOLOGY_DEMO_SEED_SOURCE]
    const ontologyEntities = [
      ...SALES_ONTOLOGY_DEMO_OBJECTS.map(demoObjectToEntity),
      ...SALES_ONTOLOGY_DEMO_OBJECT_ACTIONS.map(demoObjectActionToEntity),
      ...SALES_ONTOLOGY_DEMO_PROPOSALS.map(demoProposalToOntologyEntity)
    ]
    const ontologyRelations = [
      ...SALES_ONTOLOGY_DEMO_RELATIONS.map(demoRelationToOntologyRelation),
      ...SALES_ONTOLOGY_DEMO_OBJECT_ACTIONS.map(demoObjectActionToRelation),
      ...SALES_ONTOLOGY_DEMO_PROPOSALS.map(demoProposalToOntologyRelation)
    ].filter(Boolean) as SalesOntologyRelationInput[]
    const ontologyActions = SALES_ONTOLOGY_DEMO_PROPOSALS.map(demoProposalToOntologyAction)
    const ontology = {
      resourceId,
      syncMode,
      published: false,
      skipped: !publishOntology,
      reason: publishOntology ? undefined : 'disabled',
      counts: {
        entities: ontologyEntities.length,
        relations: ontologyRelations.length,
        actions: ontologyActions.length
      },
      result: undefined as SalesOntologyBusinessOntologyPublishResponse | undefined
    }

    if (publishOntology) {
      if (this.ontologyClient.isConfigured()) {
        ontology.result = await this.ontologyClient.publish(resourceId, {
          manifest: SALES_ONTOLOGY_MANIFEST,
          entities: normalizePublishEntities(ontologyEntities),
          relations: normalizePublishRelations(ontologyRelations),
          actions: normalizePublishActions(ontologyActions),
          syncMode,
          sourcePlugin: 'sales-ontology',
          domainKey: 'sales-ontology',
          sourceVersion: 'demo-seed-v1'
        })
        ontology.published = true
        ontology.skipped = false
      } else {
        ontology.skipped = true
        ontology.reason = 'data-xpert API base URL is not configured'
      }
    }

    const internalRecords = {
      skipped: !includeInternalRecords,
      runs: 0,
      perceptions: 0,
      suggestions: 0,
      proposals: 0,
      notifications: 0,
      reminders: 0,
      scenarios: 0,
      effects: 0,
      memories: 0
    }

    if (includeInternalRecords) {
      const scoped = {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId
      }
      const perceptions = seedObjects.map((object) => {
        const perception = analyzeObject(object)
        return this.perceptionRepository.create({
          id: stableSeedId(scope, 'perception', perception.entityExternalKey),
          ...scoped,
          runId: seedRunId,
          entityTypeCode: perception.entityTypeCode,
          entityExternalKey: perception.entityExternalKey,
          entityName: perception.entityName,
          entityObjectType: perception.entityObjectType,
          state: perception.state,
          riskScore: perception.riskScore,
          churnProbability: perception.churnProbability,
          loyaltyScore: perception.loyaltyScore,
          anomalies: perception.anomalies,
          patterns: perception.patterns,
          alerts: perception.alerts,
          attribution: perception.attribution,
          evidence: perception.evidence
        })
      })
      const savedPerceptions = await this.perceptionRepository.save(perceptions)
      internalRecords.perceptions = savedPerceptions.length

      const suggestions = buildSuggestions(seedObjects).map((suggestion, index) =>
        this.suggestionRepository.create({
          id: stableSeedId(scope, 'suggestion', seedSuggestionKey(suggestion, index)),
          ...scoped,
          type: suggestion.type,
          priority: suggestion.priority,
          title: suggestion.title,
          description: suggestion.description,
          targetEntities: suggestion.targetEntities,
          reasoningChain: suggestion.reasoningChain,
          suggestedActions: suggestion.suggestedActions,
          expectedImpact: suggestion.expectedImpact,
          status: 'active',
          confidence: suggestion.confidence,
          evidence: suggestion.evidence
        })
      )
      const savedSuggestions = await this.suggestionRepository.save(suggestions)
      internalRecords.suggestions = savedSuggestions.length

      const proposals = SALES_ONTOLOGY_DEMO_PROPOSALS.map((proposal) =>
        this.proposalRepository.create({
          id: stableSeedId(scope, 'proposal', proposal.key),
          ...scoped,
          title: proposal.title,
          description: proposal.description,
          actionType: normalizeActionName(proposal.actionType),
          entityTypeCode: 'sales_ontology_object',
          entityExternalKey: proposal.entityExternalKey,
          entityName: proposal.entityName,
          entityObjectType: proposal.entityObjectType,
          priority: proposal.priority,
          confidence: proposal.confidence,
          status: proposal.status,
          proposedBy: proposal.proposedBy,
          reasoningChain: demoProposalReasoningChain(proposal),
          actionDefinition: {
            ...proposal.actionDefinition,
            actionType: normalizeActionName(proposal.actionType),
            sourceActionName: proposal.actionType
          },
          evidence: seedTextEvidence(proposal.evidence)
        })
      )
      const savedProposals = await this.proposalRepository.save(proposals)
      internalRecords.proposals = savedProposals.length

      const notifications = SALES_ONTOLOGY_DEMO_NOTIFICATIONS.map((notification) =>
        this.notificationRepository.create({
          id: stableSeedId(scope, 'notification', notification.key),
          ...scoped,
          userId: scope.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          read: false,
          entityExternalKey: notification.entityExternalKey,
          entityTypeCode: notification.entityExternalKey ? 'sales_ontology_object' : undefined,
          payload: { seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE }
        })
      )
      const savedNotifications = await this.notificationRepository.save(notifications)
      internalRecords.notifications = savedNotifications.length

      const reminders = SALES_ONTOLOGY_DEMO_REMINDERS.map((reminder, index) =>
        this.reminderRepository.create({
          id: stableSeedId(scope, 'reminder', reminder.key),
          ...scoped,
          userId: scope.userId,
          reminderType: reminder.reminderType,
          title: reminder.title,
          description: reminder.description,
          dueDate: futureDate(index + 2),
          priority: reminder.priority,
          status: reminder.status,
          entityExternalKey: reminder.entityExternalKey,
          entityTypeCode: reminder.entityExternalKey ? 'sales_ontology_object' : undefined,
          payload: { seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE }
        })
      )
      const savedReminders = await this.reminderRepository.save(reminders)
      internalRecords.reminders = savedReminders.length

      const scenarios = SALES_ONTOLOGY_DEMO_SCENARIOS.map((scenario) =>
        this.scenarioRepository.create({
          id: stableSeedId(scope, 'scenario', scenario.key),
          ...scoped,
          scenarioType: scenario.scenarioType,
          name: scenario.name,
          description: scenario.description,
          category: scenario.category,
          targetValue: scenario.targetValue,
          baselineForecastValue: scenario.baselineForecastValue,
          forecastValue: scenario.forecastValue,
          achievementRate: scenario.achievementRate,
          riskLevel: scenario.riskLevel,
          delta: scenario.delta,
          parameters: scenario.parameters,
          result: {
            impactAnalysis: scenario.impactAnalysis,
            baselineTargetValue: scenario.baselineTargetValue,
            baselineForecastValue: scenario.baselineForecastValue,
            baselineAchievementRate: scenario.baselineAchievementRate,
            baselineRiskLevel: scenario.baselineRiskLevel,
            confidenceInterval: [
              Math.round(scenario.forecastValue * 0.9),
              Math.round(scenario.forecastValue * 1.1)
            ],
            seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE
          },
          createdById: scope.userId
        })
      )
      const savedScenarios = await this.scenarioRepository.save(scenarios)
      internalRecords.scenarios = savedScenarios.length

      const effects = SALES_ONTOLOGY_DEMO_SCENARIOS.map((scenario) =>
        this.decisionEffectRepository.create({
          id: stableSeedId(scope, 'effect', scenario.key),
          ...scoped,
          decisionId: scenario.key,
          decisionType: scenario.scenarioType,
          metricName: 'forecast_achievement',
          expectedValue: scenario.baselineAchievementRate,
          actualValue: scenario.achievementRate,
          unit: '%',
          status: computeMetricStatus(scenario.baselineAchievementRate, scenario.achievementRate),
          evidence: {
            scenarioKey: scenario.key,
            impactAnalysis: scenario.impactAnalysis,
            seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE
          }
        })
      )
      const savedEffects = await this.decisionEffectRepository.save(effects)
      internalRecords.effects = savedEffects.length

      const memories = [
        ...SALES_ONTOLOGY_DEMO_INFERENCE_RULES.map((rule) =>
          this.memoryRepository.create({
            id: stableSeedId(scope, 'memory', rule.id),
            ...scoped,
            memoryType: 'semantic',
            contentText: `${rule.id} ${rule.name}: ${rule.description}`,
            metadata: {
              ...rule,
              seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE
            },
            confidence: rule.confidenceBase,
            sourceRunId: seedRunId
          })
        ),
        this.memoryRepository.create({
          id: stableSeedId(scope, 'memory', 'agent-status'),
          ...scoped,
          memoryType: 'episodic',
          contentText: 'Sales Ontology demo agents are initialized for perception, reasoning, compliance, action governance, scenario simulation, and learning.',
          metadata: {
            agents: ['InsightAgent', 'ComplianceAgent', 'KnowledgeAgent', 'ScenarioAgent'],
            status: 'demo_ready',
            seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE
          },
          confidence: 1,
          sourceRunId: seedRunId
        })
      ]
      const savedMemories = await this.memoryRepository.save(memories)
      internalRecords.memories = savedMemories.length

      await this.decisionRunRepository.save(
        this.decisionRunRepository.create({
          id: seedRunId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          createdById: scope.userId,
          assistantId: scope.assistantId,
          conversationId: scope.conversationId,
          runType: 'learning',
          status: 'completed',
          input: {
            action: 'seed_database',
            publishOntology,
            includeInternalRecords,
            syncMode,
            resourceId
          },
          output: {
            ontology,
            internalRecords,
            source: SALES_ONTOLOGY_DEMO_SEED_SOURCE
          },
          evidence: sourceEvidence,
          confidence: 1
        })
      )
      internalRecords.runs = 1
    }

    return {
      resourceId,
      source: SALES_ONTOLOGY_DEMO_SEED_SOURCE,
      ontology,
      internalRecords,
      message: 'Sales Ontology demo database seed completed.'
    }
  }

  async publishSnapshot(scope: SalesOntologyScope, input: SalesOntologyPublishInput = {}) {
    const resourceId = this.resourceId(input.resourceId)
    const manifest = input.manifest ?? SALES_ONTOLOGY_MANIFEST
    const payload = {
      manifest,
      entities: normalizePublishEntities(input.entities ?? []),
      relations: normalizePublishRelations(input.relations ?? []),
      actions: normalizePublishActions(input.actions ?? []),
      sourcePlugin: 'sales-ontology',
      domainKey: 'sales-ontology',
      sourceVersion: scope.conversationId
    } as const
    const result = await this.ontologyClient.publish(resourceId, payload)
    return {
      resourceId,
      manifestVersion: manifest.version.semanticVersion,
      published: result
    }
  }

  async getCustomerContext(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const keyword = readString(input['keyword'])
    const objectType = readString(input['objectType'])
    const limit = readLimit(input['limit'], 100)
    const objects = await this.queryObjects(input, keyword, limit)
    const filtered = objects.filter((item) => {
      if (objectType && item.objectType !== objectType) {
        return false
      }
      if (!keyword) {
        return true
      }
      return JSON.stringify(item).toLowerCase().includes(keyword.toLowerCase())
    })
    return {
      scope: summarizeScope(scope),
      total: filtered.length,
      items: filtered.slice(0, limit),
      objectTypes: countBy(filtered, (item) => item.objectType ?? 'Unknown')
    }
  }

  async getComplianceRisks(_scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const limit = readLimit(input['limit'], 100)
    const objects = await this.queryObjects(input, readString(input['keyword']), limit)
    const risky = objects
      .map((object) => ({
        ...object,
        riskLevel: readString(object.attributes['compliance_risk_level']) ?? readString(object.properties['complianceRiskLevel']),
        riskScore: readNumber(object.properties['risk_score']) ?? readNumber(object.properties['riskScore'])
      }))
      .filter(
        (object) =>
          object.objectType === 'ComplianceAlert' ||
          ['high', 'critical'].includes((object.riskLevel ?? '').toLowerCase()) ||
          (object.riskScore ?? 0) >= 0.65
      )
    return {
      total: risky.length,
      items: risky.slice(0, limit),
      byRiskLevel: countBy(risky, (item) => item.riskLevel ?? 'unknown')
    }
  }

  async getSalesTargetStatus(_scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const objects = await this.queryObjects(input, readString(input['keyword']), readLimit(input['limit'], 200))
    const targets = objects.filter((item) => item.objectType === 'SalesTarget' || item.domain === 'sales_target')
    const rows = targets.map((target) => {
      const actual = readNumber(target.properties['actual']) ?? readNumber(target.properties['actual_amount']) ?? 0
      const targetValue = readNumber(target.properties['target']) ?? readNumber(target.properties['target_amount']) ?? 0
      const achievementRate =
        readNumber(target.properties['achievement_rate']) ??
        readNumber(target.properties['achievementRate']) ??
        (targetValue > 0 ? actual / targetValue : undefined)
      return {
        ...target,
        actual,
        target: targetValue,
        achievementRate
      }
    })
    const rates = rows.map((item) => item.achievementRate).filter((value): value is number => typeof value === 'number')
    return {
      total: rows.length,
      averageAchievementRate: average(rates),
      underperformingCount: rows.filter((item) => (item.achievementRate ?? 1) < 0.8).length,
      items: rows
    }
  }

  async runPerception(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const run = await this.createRun(scope, 'perception', input)
    const objects = await this.queryObjects(input, readString(input['keyword']), readLimit(input['limit'], 100))
    const perceptions = objects.map((object) => analyzeObject(object))
    const saved = await this.perceptionRepository.save(
      perceptions.map((perception) =>
        this.perceptionRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          assistantId: scope.assistantId,
          runId: run.id,
          entityTypeCode: perception.entityTypeCode,
          entityExternalKey: perception.entityExternalKey,
          entityName: perception.entityName,
          entityObjectType: perception.entityObjectType,
          state: perception.state,
          riskScore: perception.riskScore,
          churnProbability: perception.churnProbability,
          loyaltyScore: perception.loyaltyScore,
          anomalies: perception.anomalies,
          patterns: perception.patterns,
          alerts: perception.alerts,
          attribution: perception.attribution,
          evidence: perception.evidence
        })
      )
    )
    run.output = {
      total: saved.length,
      alertCount: saved.filter((item) => (item.alerts?.length ?? 0) > 0).length,
      highRiskCount: saved.filter((item) => (item.riskScore ?? 0) >= 0.7).length,
      items: saved
    }
    await this.decisionRunRepository.save(run)
    return run.output
  }

  async runReasoning(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const run = await this.createRun(scope, 'reasoning', input)
    const reasoningType = normalizeReasoningType(readString(input['reasoningType']) ?? 'causal')
    const objects = await this.queryObjects(input, readString(input['keyword']), readLimit(input['limit'], 200))
    const conclusion = buildAdvancedReasoning(reasoningType, objects, input)
    run.output = {
      reasoningType,
      conclusion,
      chain: conclusion.chain,
      findings: conclusion.findings,
      recommendations: conclusion.recommendations
    }
    run.confidence = conclusion.confidence
    await this.decisionRunRepository.save(run)
    await this.memoryRepository.save(
      this.memoryRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        memoryType: 'semantic',
        contentText: `${reasoningType}: ${conclusion.hypothesis}`,
        metadata: run.output,
        confidence: conclusion.confidence,
        sourceRunId: run.id
      })
    )
    return run.output
  }

  async generateInsights(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const run = await this.createRun(scope, 'insight', input)
    const objects = await this.queryObjects(input, readString(input['keyword']), readLimit(input['limit'], 200))
    const insights = buildInsights(objects)
    run.output = { total: insights.length, items: insights }
    run.confidence = average(insights.map((item) => item.confidence).filter((value): value is number => typeof value === 'number'))
    await this.decisionRunRepository.save(run)
    await this.publishDecisionArtifacts(input, insights.map(insightToEntity), insights.map(insightToRelation).filter(Boolean))
    return run.output
  }

  async generateSuggestions(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const objects = await this.queryObjects(input, readString(input['keyword']), readLimit(input['limit'], 200))
    const suggestions = buildSuggestions(objects)
    const saved = await this.suggestionRepository.save(
      suggestions.map((suggestion) =>
        this.suggestionRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          assistantId: scope.assistantId,
          type: suggestion.type,
          priority: suggestion.priority,
          title: suggestion.title,
          description: suggestion.description,
          targetEntities: suggestion.targetEntities,
          reasoningChain: suggestion.reasoningChain,
          suggestedActions: suggestion.suggestedActions,
          expectedImpact: suggestion.expectedImpact,
          status: 'active',
          confidence: suggestion.confidence,
          evidence: suggestion.evidence
        })
      )
    )
    await this.createRun(scope, 'suggestion', input, {
      total: saved.length,
      items: saved
    })
    await this.publishDecisionArtifacts(input, saved.map(suggestionToEntity), saved.map(suggestionToRelation).filter(Boolean))
    return {
      total: saved.length,
      items: saved
    }
  }

  async proposeAction(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const target = readRecord(input['target'])
    const proposal = await this.proposalRepository.save(
      this.proposalRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        title: readString(input['title']) ?? 'Sales Ontology action proposal',
        description: readString(input['description']),
        actionType: readString(input['actionType']) ?? 'sales_ontology.propose_action',
        entityTypeCode: readString(target?.['entityTypeCode']) ?? readString(input['entityTypeCode']),
        entityExternalKey: readString(target?.['externalKey']) ?? readString(input['entityExternalKey']),
        entityName: readString(target?.['label']) ?? readString(input['entityName']),
        entityObjectType: readString(target?.['objectType']) ?? readString(input['entityObjectType']),
        priority: readPriority(input['priority']),
        confidence: readNumber(input['confidence']) ?? 0.72,
        status: 'pending',
        proposedBy: scope.userId,
        reasoningChain: readArrayOfRecords(input['reasoningChain']),
        actionDefinition: readRecord(input['actionDefinition']) ?? inputToRecord(input),
        evidence: readArrayOfRecords(input['evidence'])
      })
    )
    await this.createRun(scope, 'action', input, { proposal })
    await this.publishDecisionArtifacts(input, [proposalToEntity(proposal)], [proposalToRelation(proposal)].filter(Boolean), [
      {
        actionTypeCode: proposal.actionType ?? 'sales_ontology.propose_action',
        target: proposal.entityTypeCode && proposal.entityExternalKey
          ? { entityTypeCode: proposal.entityTypeCode, externalKey: proposal.entityExternalKey }
          : undefined,
        status: proposal.status,
        payload: proposal.actionDefinition,
        provenance: proposal.evidence
      }
    ])
    return proposal
  }

  async recordActionResult(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const proposalId = readString(input['proposalId'])
    const status = readString(input['status']) ?? 'completed'
    const log = await this.executionLogRepository.save(
      this.executionLogRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        proposalId,
        actionName: readString(input['actionName']),
        toolName: readString(input['toolName']),
        parameters: readRecord(input['parameters']),
        status,
        result: readRecord(input['result']),
        userId: scope.userId
      })
    )
    if (proposalId) {
      const proposal = await this.proposalRepository.findOne({ where: scopedWhere(scope, { id: proposalId }) })
      if (proposal) {
        proposal.status = status === 'failed' ? 'failed' : 'executed'
        proposal.executionLogs = [...(proposal.executionLogs ?? []), log as unknown as Record<string, unknown>]
        proposal.completedAt = new Date()
        proposal.errorMessage = readString(input['errorMessage'])
        await this.proposalRepository.save(proposal)
      }
    }
    return log
  }

  async executeObjectAction(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const actionName = normalizeActionName(readString(input['actionName']) ?? readString(input['actionType']) ?? 'sales_ontology.propose_action')
    const targetExternalKey = readString(input['targetExternalKey']) ?? readString(input['entityExternalKey'])
    const targetLabel = readString(input['targetLabel']) ?? readString(input['entityName'])
    const params = readRecord(input['params']) ?? readRecord(input['parameters']) ?? {}
    const actionDefinition = getActionDefinition(actionName)

    if (actionDefinition?.requiresApproval && input['approved'] !== true && input['forceExecute'] !== true) {
      const proposal = await this.proposeAction(scope, {
        title: readString(input['title']) ?? actionDefinition.name,
        description: readString(input['description']) ?? `Approval required before executing ${actionDefinition.name}.`,
        actionType: actionName,
        priority: actionDefinition.riskLevel === 'HIGH' || actionDefinition.riskLevel === 'CRITICAL' ? 'high' : 'medium',
        confidence: readNumber(input['confidence']) ?? 0.78,
        target: {
          entityTypeCode: readString(input['targetEntityTypeCode']) ?? 'sales_ontology_object',
          externalKey: targetExternalKey,
          label: targetLabel,
          objectType: readString(input['targetObjectType'])
        },
        actionDefinition: {
          params,
          preconditions: readArrayOfStrings(input['preconditions']),
          sideEffects: readArrayOfStrings(input['sideEffects']),
          writeBackTargets: readArrayOfStrings(input['writeBackTargets'])
        },
        reasoningChain: readArrayOfRecords(input['reasoningChain']),
        evidence: readArrayOfRecords(input['evidence'])
      })
      return {
        status: 'pending_approval',
        message: 'Action requires approval; a governed proposal was created.',
        proposal
      }
    }

    const target = await this.resolveTargetObject(input, targetExternalKey)
    const preconditionResult = evaluatePreconditions(target, readArrayOfStrings(input['preconditions']))
    if (!preconditionResult.valid) {
      const log = await this.saveExecutionLog(scope, {
        actionName,
        toolName: 'sales_ontology_action_executor',
        parameters: { targetExternalKey, params },
        status: 'failed',
        result: preconditionResult
      })
      return {
        success: false,
        status: 'failed',
        message: `Precondition failed: ${preconditionResult.reason}`,
        log
      }
    }

    const main = executeActionLogic(actionName, target, params)
    const sideEffects = await this.executeSideEffects(scope, target, actionName, params, readArrayOfStrings(input['sideEffects']))
    const writeBackTargets = readArrayOfStrings(input['writeBackTargets'])
    const writeBackLogs = await Promise.all(
      writeBackTargets.map((targetSystem) =>
        this.saveExecutionLog(scope, {
          actionName: `writeback:${targetSystem}`,
          toolName: 'write_back',
          parameters: { targetExternalKey, actionName, params },
          status: 'logged',
          result: { targetSystem, message: `Write-back intent to ${targetSystem} logged.` }
        })
      )
    )
    const log = await this.saveExecutionLog(scope, {
      actionName,
      toolName: 'sales_ontology_action_executor',
      parameters: { targetExternalKey, params },
      status: main['success'] === false ? 'failed' : 'success',
      result: { main, sideEffects, writeBackLogs }
    })

    await this.publishDecisionArtifacts(input, buildActionExecutionEntities(target, actionName, main), [], [
      {
        actionTypeCode: actionName,
        actionRef: log.id,
        entity: targetExternalKey ? { entityTypeCode: 'sales_ontology_object', externalKey: targetExternalKey } : undefined,
        status: main['success'] === false ? 'failed' : 'succeeded',
        inputPayload: params,
        resultPayload: { main, sideEffects },
        occurredAt: new Date().toISOString()
      }
    ])

    return {
      success: main['success'] !== false,
      executionId: log.id,
      actionName,
      target,
      result: main,
      sideEffects,
      writeBackIntentCount: writeBackLogs.length
    }
  }

  async createVisitRecord(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    return this.executeObjectAction(scope, {
      ...input,
      actionName: 'sales_ontology.schedule_visit',
      sideEffects: ['create VisitRecord', 'notify managedBy']
    })
  }

  async updateDoctorSentiment(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    return this.executeObjectAction(scope, {
      ...input,
      actionName: 'sales_ontology.update_sentiment',
      approved: input['approved'] ?? true,
      sideEffects: ['update doctor.sentiment']
    })
  }

  async flagComplianceRisk(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    return this.executeObjectAction(scope, {
      ...input,
      actionName: 'sales_ontology.flag_compliance_risk',
      sideEffects: ['create ComplianceAlert', 'notify compliance'],
      writeBackTargets: readArrayOfStrings(input['writeBackTargets']) ?? ['ComplianceSystem']
    })
  }

  async sendNotification(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        userId: readString(input['userId']) ?? scope.userId,
        type: readString(input['type']) ?? 'action_notification',
        title: readString(input['title']) ?? 'Sales Ontology notification',
        message: readString(input['message']),
        priority: readPriority(input['priority']),
        entityExternalKey: readString(input['entityExternalKey']) ?? readString(input['targetExternalKey']),
        entityTypeCode: readString(input['entityTypeCode']) ?? 'sales_ontology_object',
        payload: readRecord(input['payload']) ?? inputToRecord(input)
      })
    )
    await this.saveExecutionLog(scope, {
      actionName: 'sales_ontology.send_notification',
      toolName: 'sales_ontology_notification',
      parameters: inputToRecord(input),
      status: 'success',
      result: { notificationId: notification.id }
    })
    return notification
  }

  async createReminder(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    return this.reminderRepository.save(
      this.reminderRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        userId: readString(input['userId']) ?? scope.userId,
        reminderType: readString(input['reminderType']) ?? 'follow_up',
        title: readString(input['title']) ?? 'Sales Ontology follow-up',
        description: readString(input['description']),
        dueDate: readDate(input['dueDate']),
        priority: readPriority(input['priority']),
        status: readString(input['status']) ?? 'active',
        entityExternalKey: readString(input['entityExternalKey']),
        entityTypeCode: readString(input['entityTypeCode']) ?? 'sales_ontology_object',
        payload: readRecord(input['payload']) ?? inputToRecord(input)
      })
    )
  }

  async recordDecisionEffect(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const decisionId = readString(input['decisionId']) ?? readString(input['proposalId']) ?? readString(input['entityExternalKey'])
    if (!decisionId) {
      throw new Error('decisionId is required')
    }
    const effect = await this.decisionEffectRepository.save(
      this.decisionEffectRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        decisionId,
        decisionType: readString(input['decisionType']) ?? readString(input['actionType']),
        metricName: readString(input['metricName']) ?? 'execution_efficiency',
        expectedValue: readNumber(input['expectedValue']),
        actualValue: readNumber(input['actualValue']),
        unit: readString(input['unit']) ?? '%',
        status: readString(input['status']) ?? computeMetricStatus(readNumber(input['expectedValue']), readNumber(input['actualValue'])),
        evidence: readRecord(input['evidence']) ?? inputToRecord(input)
      })
    )
    await this.createRun(scope, 'effect', input, { effect })
    return effect
  }

  async getDecisionEffects(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const decisionId = readString(input['decisionId']) ?? readString(input['proposalId'])
    const where = decisionId ? scopedWhere(scope, { decisionId }) : scopedWhere(scope)
    const effects = await this.decisionEffectRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: readLimit(input['limit'], 50)
    })
    return {
      decisionId,
      total: effects.length,
      metrics: effects,
      computedAt: new Date().toISOString(),
      rollup: summarizeEffects(effects)
    }
  }

  async simulateScenario(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const params = readRecord(input['params']) ?? readRecord(input['parameters']) ?? {}
    const baselineForecast = readNumber(input['baselineForecastValue']) ?? readNumber(input['forecastValue']) ?? 0
    const targetValue = readNumber(input['targetValue']) ?? baselineForecast
    const baseDelta = readNumber(input['delta']) ?? 0
    const adjustmentFactor = Object.values(params).reduce<number>((factor, value) => {
      const numeric = readNumber(value)
      return numeric === undefined ? factor : factor * (1 + (numeric / 100) * 0.08)
    }, 1)
    const forecastValue = Math.round(baselineForecast * (1 + (baseDelta / 100) * adjustmentFactor))
    const achievementRate = targetValue > 0 ? Math.round((forecastValue / targetValue) * 1000) / 10 : 0
    const riskLevel = achievementRate >= 100 ? 'on_track' : achievementRate >= 90 ? 'at_risk' : 'critical'
    const result = {
      targetValue,
      forecastValue,
      achievementRate,
      riskLevel,
      confidenceInterval: [Math.round(forecastValue * 0.9), Math.round(forecastValue * 1.1)],
      appliedParams: params,
      delta: Math.round(((forecastValue - baselineForecast) / Math.max(1, baselineForecast)) * 1000) / 10
    }
    const scenario = await this.scenarioRepository.save(
      this.scenarioRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        scenarioType: readString(input['scenarioType']) ?? 'forecast',
        name: readString(input['name']) ?? 'Sales Ontology scenario',
        description: readString(input['description']),
        category: readString(input['category']) ?? 'sales',
        targetValue,
        baselineForecastValue: baselineForecast,
        forecastValue,
        achievementRate,
        riskLevel,
        delta: result.delta,
        parameters: Object.entries(params).map(([name, value]) => ({ name, value })),
        result,
        createdById: scope.userId
      })
    )
    await this.createRun(scope, 'scenario', input, { scenario })
    return scenario
  }

  async recordMemory(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    return this.memoryRepository.save(
      this.memoryRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        memoryType: readString(input['memoryType']) ?? 'episodic',
        contentText: readString(input['contentText']) ?? readString(input['content']) ?? JSON.stringify(input),
        metadata: readRecord(input['metadata']) ?? inputToRecord(input),
        confidence: readNumber(input['confidence']),
        sourceRunId: readString(input['sourceRunId'])
      })
    )
  }

  async getLearningSummary(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const [runs, effects, memories] = await Promise.all([
      this.decisionRunRepository.find({ where: scopedWhere(scope), order: { createdAt: 'DESC' }, take: readLimit(input['limit'], 30) }),
      this.decisionEffectRepository.find({ where: scopedWhere(scope), order: { createdAt: 'DESC' }, take: 50 }),
      this.memoryRepository.find({ where: scopedWhere(scope), order: { createdAt: 'DESC' }, take: 50 })
    ])
    const effectRollup = summarizeEffects(effects)
    return {
      runCount: runs.length,
      memoryCount: memories.length,
      effectRollup,
      recentMemories: memories.slice(0, 10),
      recommendations: buildLearningRecommendations(effectRollup, runs)
    }
  }

  async getViewData(scope: SalesOntologyScope, input: Record<string, unknown> = {}) {
    const page = readPage(input['page'])
    const pageSize = readLimit(input['pageSize'] ?? input['limit'], 30)
    const search = readString(input['search'])
    const viewTab = normalizeViewTab(readString(input['viewTab']))
    const insightType = readString(input['insightType']) ?? 'all'
    const graphObjectType = readString(input['graphObjectType'])
    const selectionId = readString(input['selectionId'])
    const metaLimit = Math.max(pageSize, 100)
    const [runs, perceptions, suggestions, proposals, logs, effects, notifications, reminders, scenarios, memories] = await Promise.all([
      this.decisionRunRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.perceptionRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.suggestionRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.proposalRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.executionLogRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.decisionEffectRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.notificationRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.reminderRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.scenarioRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      }),
      this.memoryRepository.find({
        where: scopedWhere(scope),
        order: { createdAt: 'DESC' },
        take: metaLimit
      })
    ])
    const runRecords = runs as unknown as Array<Record<string, unknown>>
    const perceptionRecords = perceptions as unknown as Array<Record<string, unknown>>
    const suggestionRecords = suggestions as unknown as Array<Record<string, unknown>>
    const proposalRecords = proposals as unknown as Array<Record<string, unknown>>
    const logRecords = logs as unknown as Array<Record<string, unknown>>
    const effectRecords = effects as unknown as Array<Record<string, unknown>>
    const notificationRecords = notifications as unknown as Array<Record<string, unknown>>
    const reminderRecords = reminders as unknown as Array<Record<string, unknown>>
    const scenarioRecords = scenarios as unknown as Array<Record<string, unknown>>

    let ontologyObjects: SalesOntologyObjectSummary[] = []
    let ontologyRelations: SalesOntologyRelationInput[] = []
    let neighborhood: SalesOntologyBusinessOntologyNeighborhoodResponse | undefined
    let graphError: string | undefined
    const ontologyConfigured = this.ontologyClient.isConfigured()
    if (ontologyConfigured) {
      try {
        ontologyObjects = await this.queryObjects(input, search, 120)
        if (graphObjectType) {
          ontologyObjects = ontologyObjects.filter((object) => object.objectType === graphObjectType)
        }
      } catch (error) {
        graphError = getErrorMessage(error)
      }

      try {
        ontologyRelations = await this.queryRelations(input, 300)
      } catch (error) {
        graphError = graphError ?? getErrorMessage(error)
      }

      const selected = parseSelectionId(selectionId)
      if (selected) {
        try {
          neighborhood = await this.ontologyClient.getNeighborhood(this.resourceId(readString(input['resourceId'])), selected.entityTypeCode, selected.externalKey)
          ontologyRelations = mergeRelations(ontologyRelations, extractNeighborhoodRelations(neighborhood))
        } catch (error) {
          graphError = getErrorMessage(error)
        }
      }
    }

    const insightItems = buildWorkbenchInsightItems(perceptionRecords, suggestionRecords, effectRecords)
    const filteredInsightItems = filterInsightItems(insightItems, insightType)
    const graph = buildWorkbenchGraph({
      ontologyConfigured,
      ontologyObjects,
      ontologyRelations,
      perceptions: perceptionRecords,
      suggestions: suggestionRecords,
      proposals: proposalRecords,
      scenarios: scenarioRecords,
      selectionId,
      neighborhood,
      graphError
    })
    const ruleItems = buildWorkbenchRuleItems(runRecords)
    const assistantItems = buildAssistantItems(runRecords, logRecords, notificationRecords, reminderRecords)
    const toolStatus = buildToolStatus(this.getDomainOntology(), ontologyConfigured, logRecords)
    const currentItems = selectWorkbenchItems(viewTab, {
      workspace: buildWorkspaceItems(perceptionRecords, suggestionRecords, proposalRecords, notificationRecords, reminderRecords, effectRecords),
      graph: graph.nodes,
      insights: filteredInsightItems,
      rules: ruleItems,
      scenarios: scenarioRecords,
      assistant: assistantItems,
      tools: toolStatus.items,
      actions: proposalRecords
    })
    const searchedItems = searchItems(currentItems, search)
    const paged = paginateItems(searchedItems, page, pageSize)

    return {
      items: paged.items,
      total: searchedItems.length,
      summary: {
        runs: runs.length,
        perceptions: perceptions.length,
        suggestions: suggestions.length,
        proposals: proposals.length,
        pendingProposals: proposals.filter((item) => item.status === 'pending').length,
        highRiskPerceptions: perceptions.filter((item) => (item.riskScore ?? 0) >= 0.7).length,
        effects: effects.length,
        notifications: notifications.filter((item) => !item.read).length,
        reminders: reminders.filter((item) => item.status === 'active').length,
        scenarios: scenarios.length,
        memories: memories.length
      },
      meta: {
        currentTab: viewTab,
        pagination: {
          page,
          pageSize,
          total: searchedItems.length
        },
        runs,
        perceptions,
        suggestions,
        proposals,
        logs,
        effects,
        effectRollup: summarizeEffects(effects),
        notifications,
        reminders,
        scenarios,
        memories,
        insightItems,
        filteredInsightItems,
        ruleItems,
        assistantItems,
        graph,
        neighborhood,
        toolStatus,
        domainOntology: SALES_ONTOLOGY_DOMAIN_ONTOLOGY,
        ontologyConfigured,
        defaultResourceId: this.ontologyClient.defaultResourceId()
      }
    }
  }

  async approveProposal(scope: SalesOntologyScope, proposalId: string, input: Record<string, unknown> = {}) {
    const proposal = await this.requireProposal(scope, proposalId)
    proposal.status = 'approved'
    proposal.approvedBy = scope.userId
    proposal.approvedAt = new Date()
    proposal.reviewComment = readString(input['reviewComment'])
    return this.proposalRepository.save(proposal)
  }

  async rejectProposal(scope: SalesOntologyScope, proposalId: string, input: Record<string, unknown> = {}) {
    const proposal = await this.requireProposal(scope, proposalId)
    proposal.status = 'rejected'
    proposal.reviewComment = readString(input['reviewComment'])
    return this.proposalRepository.save(proposal)
  }

  async executeProposal(scope: SalesOntologyScope, proposalId: string, input: Record<string, unknown> = {}) {
    const proposal = await this.requireProposal(scope, proposalId)
    if (proposal.status !== 'approved' && input['forceExecute'] !== true) {
      return {
        proposal,
        status: proposal.status,
        message: 'Action must be approved before execution.'
      }
    }
    proposal.status = 'executed'
    proposal.startedAt = proposal.startedAt ?? new Date()
    proposal.completedAt = new Date()
    const actionDefinition = readRecord(proposal.actionDefinition)
    const execution = await this.executeObjectAction(scope, {
      ...input,
      actionName: proposal.actionType,
      targetExternalKey: proposal.entityExternalKey,
      targetEntityTypeCode: proposal.entityTypeCode,
      targetLabel: proposal.entityName,
      params: readRecord(actionDefinition?.['params']) ?? actionDefinition ?? {},
      approved: true,
      sideEffects: readArrayOfStrings(actionDefinition?.['sideEffects']),
      writeBackTargets: readArrayOfStrings(actionDefinition?.['writeBackTargets'])
    })
    const log = await this.saveExecutionLog(scope, {
      proposalId,
      actionName: proposal.actionType,
      toolName: 'sales_ontology_proposal_executor',
      parameters: proposal.actionDefinition,
      status: execution['success'] === false ? 'failed' : 'executed',
      result: readRecord(input['result']) ?? (execution as unknown as Record<string, unknown>)
    })
    if (execution['success'] === false) {
      proposal.status = 'failed'
      proposal.errorMessage = readString((execution as Record<string, unknown>)['message'])
    }
    proposal.executionLogs = [...(proposal.executionLogs ?? []), log as unknown as Record<string, unknown>]
    await this.proposalRepository.save(proposal)
    return { proposal, log, execution }
  }

  private async requireProposal(scope: SalesOntologyScope, proposalId: string) {
    const proposal = await this.proposalRepository.findOne({ where: scopedWhere(scope, { id: proposalId }) })
    if (!proposal) {
      throw new Error('Sales Ontology action proposal is not found')
    }
    return proposal
  }

  private async createRun(
    scope: SalesOntologyScope,
    runType: SalesOntologyRunType,
    input: Record<string, unknown>,
    output?: Record<string, unknown>
  ) {
    return this.decisionRunRepository.save(
      this.decisionRunRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        createdById: scope.userId,
        assistantId: scope.assistantId,
        conversationId: scope.conversationId,
        runType,
        status: 'completed',
        input: inputToRecord(input),
        output
      })
    )
  }

  private async saveExecutionLog(
    scope: SalesOntologyScope,
    input: {
      proposalId?: string
      actionName?: string
      toolName: string
      parameters?: Record<string, unknown>
      status?: string
      result?: Record<string, unknown>
    }
  ) {
    return this.executionLogRepository.save(
      this.executionLogRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId,
        proposalId: input.proposalId,
        actionName: input.actionName,
        toolName: input.toolName,
        parameters: input.parameters,
        status: input.status ?? 'success',
        result: input.result,
        userId: scope.userId
      })
    )
  }

  private async queryObjects(input: Record<string, unknown>, query: string | undefined, limit: number) {
    const response = await this.ontologyClient.queryEntities(this.resourceId(readString(input['resourceId'])), {
      entityTypeCode: 'sales_ontology_object',
      query,
      limit
    })
    const items = response.items ?? []
    return items.map(normalizeObjectSummary)
  }

  private async queryRelations(input: Record<string, unknown>, limit: number) {
    const response = await this.ontologyClient.queryRelations(this.resourceId(readString(input['resourceId'])), {
      relationTypeCode: 'sales_ontology_object_link',
      limit
    })
    const items = response.items ?? []
    return normalizeRelations(items)
  }

  private async resolveTargetObject(input: Record<string, unknown>, targetExternalKey: string | undefined) {
    if (!targetExternalKey) {
      return {
        externalKey: readString(input['targetExternalKey']) ?? 'unknown',
        label: readString(input['targetLabel']) ?? readString(input['entityName']) ?? 'Unknown target',
        state: readString(input['targetState']),
        objectType: readString(input['targetObjectType']),
        domain: readString(input['targetDomain']),
        properties: readRecord(input['targetProperties']) ?? {},
        attributes: readRecord(input['targetAttributes']) ?? {},
        provenance: readArrayOfRecords(input['evidence'])
      } satisfies SalesOntologyObjectSummary
    }
    const objects = await this.queryObjects(input, targetExternalKey, 50)
    return (
      objects.find((object) => object.externalKey === targetExternalKey) ??
      objects[0] ?? {
        externalKey: targetExternalKey,
        label: readString(input['targetLabel']) ?? targetExternalKey,
        state: readString(input['targetState']),
        objectType: readString(input['targetObjectType']),
        domain: readString(input['targetDomain']),
        properties: readRecord(input['targetProperties']) ?? {},
        attributes: readRecord(input['targetAttributes']) ?? {},
        provenance: readArrayOfRecords(input['evidence'])
      }
    )
  }

  private async executeSideEffects(
    scope: SalesOntologyScope,
    target: SalesOntologyObjectSummary,
    actionName: string,
    params: Record<string, unknown>,
    sideEffects: string[] | undefined
  ) {
    const effects = sideEffects?.length ? sideEffects : defaultSideEffectsForAction(actionName)
    const results = []
    for (const effect of effects) {
      if (effect.startsWith('notify ')) {
        const notification = await this.sendNotification(scope, {
          title: `Sales Ontology action: ${actionLabel(actionName)}`,
          message: `${actionLabel(actionName)} executed for ${target.label ?? target.externalKey}.`,
          priority: actionName.includes('compliance') || actionName.includes('risk') ? 'high' : 'medium',
          entityExternalKey: target.externalKey,
          entityTypeCode: 'sales_ontology_object',
          payload: { effect, params }
        })
        results.push({ effect, status: 'success', notificationId: notification.id })
      } else if (effect.startsWith('create ')) {
        const entityType = effect.replace('create ', '').trim()
        const entity = actionSideEffectEntity(target, entityType, params)
        await this.publishDecisionArtifacts({ resourceId: params['resourceId'] }, [entity])
        results.push({ effect, status: 'success', entity })
      } else if (effect.startsWith('update ')) {
        results.push({ effect, status: 'logged', field: effect.replace('update ', '').trim() })
      } else if (effect.startsWith('trigger ')) {
        results.push({ effect, status: 'logged', engine: effect.replace('trigger ', '').trim() })
      } else {
        results.push({ effect, status: 'skipped' })
      }
    }
    return results
  }

  private async publishDecisionArtifacts(
    input: Record<string, unknown>,
    entities: Array<SalesOntologyEntityInput | undefined>,
    relations: Array<SalesOntologyRelationInput | undefined> = [],
    actions: SalesOntologyActionInput[] = []
  ) {
    if (!this.ontologyClient.isConfigured()) {
      return { skipped: true }
    }
    return this.ontologyClient.publish(this.resourceId(readString(input['resourceId'])), {
      manifest: SALES_ONTOLOGY_MANIFEST,
      entities: normalizePublishEntities(entities.filter(Boolean) as SalesOntologyEntityInput[]),
      relations: normalizePublishRelations(relations.filter(Boolean) as SalesOntologyRelationInput[]),
      actions: normalizePublishActions(actions),
      sourcePlugin: 'sales-ontology',
      domainKey: 'sales-ontology'
    })
  }

  private resourceId(input?: string) {
    return input?.trim() || this.ontologyClient.defaultResourceId()
  }
}

function demoObjectToSummary(object: SalesOntologyDemoObject): SalesOntologyObjectSummary {
  return {
    externalKey: object.externalKey,
    label: object.label,
    state: object.status ?? object.lifecycleStage ?? 'active',
    objectType: object.objectType,
    domain: object.domain,
    properties: object.properties ?? {},
    attributes: demoObjectAttributes(object),
    provenance: [SALES_ONTOLOGY_DEMO_SEED_SOURCE]
  }
}

function demoObjectToEntity(object: SalesOntologyDemoObject): SalesOntologyEntityInput {
  return {
    entityTypeCode: 'sales_ontology_object',
    externalKey: object.externalKey,
    displayName: object.label,
    currentStateCode: 'active',
    attributes: demoObjectAttributes(object),
    provenance: [SALES_ONTOLOGY_DEMO_SEED_SOURCE]
  }
}

function demoObjectAttributes(object: SalesOntologyDemoObject) {
  return {
    object_type: object.objectType,
    domain: object.domain,
    status: object.status,
    lifecycle_stage: object.lifecycleStage,
    sentiment: object.sentiment,
    compliance_risk_level: object.complianceRiskLevel,
    owner_id: object.ownerId,
    properties: {
      ...(object.properties ?? {}),
      objectType: object.objectType,
      domain: object.domain
    },
    source_system: 'sales_ontology_demo_seed',
    source_record_id: object.externalKey
  }
}

function demoRelationToOntologyRelation(relation: SalesOntologyDemoRelation): SalesOntologyRelationInput {
  return {
    relationTypeCode: 'sales_ontology_object_link',
    source: { entityTypeCode: 'sales_ontology_object', externalKey: relation.source },
    target: { entityTypeCode: 'sales_ontology_object', externalKey: relation.target },
    attributes: {
      link_type: relation.relationType,
      target_label: relation.targetLabel,
      target_object_type: relation.targetObjectType,
      strength: relation.strength,
      frequency: relation.frequency,
      volume: relation.volume,
      confidence: relationConfidence(relation)
    },
    provenance: [SALES_ONTOLOGY_DEMO_SEED_SOURCE]
  }
}

function demoObjectActionToEntity(action: (typeof SALES_ONTOLOGY_DEMO_OBJECT_ACTIONS)[number]): SalesOntologyEntityInput {
  return {
    entityTypeCode: 'sales_ontology_action_definition',
    externalKey: action.id,
    displayName: action.description || action.name,
    currentStateCode: 'active',
    attributes: {
      name: normalizeActionName(action.name),
      source_action_name: action.name,
      description: action.description,
      requires_approval: action.requiresApproval,
      preconditions: action.preconditions,
      side_effects: action.sideEffects,
      write_back_targets: action.writeBackTargets
    },
    provenance: [SALES_ONTOLOGY_DEMO_SEED_SOURCE]
  }
}

function demoObjectActionToRelation(action: (typeof SALES_ONTOLOGY_DEMO_OBJECT_ACTIONS)[number]): SalesOntologyRelationInput {
  return {
    relationTypeCode: 'sales_ontology_object_supports_action',
    source: { entityTypeCode: 'sales_ontology_object', externalKey: action.objectId },
    target: { entityTypeCode: 'sales_ontology_action_definition', externalKey: action.id },
    attributes: {},
    provenance: [SALES_ONTOLOGY_DEMO_SEED_SOURCE]
  }
}

function demoProposalToOntologyEntity(proposal: SalesOntologyDemoProposal): SalesOntologyEntityInput {
  return {
    entityTypeCode: 'sales_ontology_action_proposal',
    externalKey: proposal.key,
    displayName: proposal.title,
    currentStateCode: proposal.status,
    attributes: {
      title: proposal.title,
      description: proposal.description,
      priority: proposal.priority,
      confidence: proposal.confidence,
      status: proposal.status,
      payload: {
        actionType: normalizeActionName(proposal.actionType),
        target: proposal.entityExternalKey,
        actionDefinition: proposal.actionDefinition,
        reasoningConclusion: proposal.reasoningConclusion,
        reasoningConfidence: proposal.reasoningConfidence,
        suggestedActions: proposal.suggestedActions
      },
      evidence: seedTextEvidence(proposal.evidence)
    },
    provenance: seedTextEvidence(proposal.evidence)
  }
}

function demoProposalToOntologyRelation(proposal: SalesOntologyDemoProposal): SalesOntologyRelationInput {
  return {
    relationTypeCode: 'sales_ontology_proposal_targets_object',
    source: { entityTypeCode: 'sales_ontology_action_proposal', externalKey: proposal.key },
    target: { entityTypeCode: 'sales_ontology_object', externalKey: proposal.entityExternalKey },
    attributes: { confidence: proposal.confidence },
    provenance: seedTextEvidence(proposal.evidence)
  }
}

function demoProposalToOntologyAction(proposal: SalesOntologyDemoProposal): SalesOntologyActionInput {
  return {
    actionTypeCode: normalizeActionName(proposal.actionType),
    actionRef: proposal.key,
    entity: { entityTypeCode: 'sales_ontology_object', externalKey: proposal.entityExternalKey },
    status: proposal.status,
    inputPayload: {
      title: proposal.title,
      description: proposal.description,
      actionDefinition: proposal.actionDefinition
    },
    evidence: {
      seedSource: SALES_ONTOLOGY_DEMO_SEED_SOURCE,
      reasoningConclusion: proposal.reasoningConclusion,
      evidence: proposal.evidence
    },
    provenance: seedTextEvidence(proposal.evidence)
  }
}

function demoProposalReasoningChain(proposal: SalesOntologyDemoProposal) {
  return [
    {
      step: 'reasoning_conclusion',
      value: proposal.reasoningConclusion,
      confidence: proposal.reasoningConfidence ?? proposal.confidence
    },
    {
      step: 'source_evidence',
      value: proposal.evidence ?? []
    },
    {
      step: 'alternative_hypotheses',
      value: proposal.alternativeHypotheses ?? []
    },
    {
      step: 'suggested_actions',
      value: proposal.suggestedActions ?? []
    }
  ]
}

function seedTextEvidence(texts: string[] | undefined) {
  const entries = texts?.length ? texts : [SALES_ONTOLOGY_DEMO_SEED_SOURCE.title]
  return entries.map((text, index) => ({
    ...SALES_ONTOLOGY_DEMO_SEED_SOURCE,
    text,
    metadata: {
      index: index + 1,
      sourceRecord: 'demo_seed'
    }
  }))
}

function seedSuggestionKey(suggestion: ReturnType<typeof buildSuggestions>[number], index: number) {
  const target = readRecord(suggestion.targetEntities?.[0])
  return readString(target?.['externalKey']) ?? `${suggestion.type}:${suggestion.title}:${index}`
}

function relationConfidence(relation: SalesOntologyDemoRelation) {
  if (typeof relation.strength === 'number') {
    return relation.strength > 1 ? relation.strength / 100 : relation.strength
  }
  if (relation.frequency === 'high') return 0.9
  if (relation.frequency === 'medium') return 0.65
  if (relation.frequency === 'low') return 0.35
  return 0.72
}

function futureDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(9, 0, 0, 0)
  return date
}

function stableSeedId(scope: SalesOntologyScope, kind: string, key: string | undefined) {
  const hex = createHash('sha1')
    .update(['sales-ontology-demo', scope.tenantId ?? '', scope.organizationId ?? '', scope.assistantId ?? '', kind, key ?? ''].join(':'))
    .digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function attr(
  code: string,
  name: string,
  valueType: SalesOntologyAttribute['valueType'] = 'string'
) {
  return {
    code,
    name,
    valueType,
    required: false,
    repeated: false
  }
}

function normalizePublishRelations(relations: SalesOntologyRelationInput[]) {
  return relations.map((relation) => {
    const provenance = normalizeProvenanceEntries(relation.provenance)
    return {
      ...relation,
      evidence: relation.attributes?.['evidence']
        ? readRecord(relation.attributes['evidence'])
        : relation.provenance?.length
          ? { provenance: relation.provenance }
          : undefined,
      provenance
    }
  })
}

function jsonDecisionAttributes() {
  return [
    attr('title', 'Title'),
    attr('description', 'Description'),
    attr('priority', 'Priority'),
    attr('confidence', 'Confidence', 'number'),
    attr('status', 'Status'),
    attr('payload', 'Payload', 'json'),
    attr('evidence', 'Evidence', 'json')
  ]
}

function normalizePublishEntities(entities: SalesOntologyEntityInput[]) {
  return entities.map((entity) => {
    const provenance = normalizeProvenanceEntries(entity.provenance)
    return {
      ...entity,
      displayName: entity.displayName ?? entity.label ?? null,
      evidence: entity.evidence ?? (entity.provenance?.length ? { provenance: entity.provenance } : undefined),
      provenance,
      label: undefined
    }
  })
}

function normalizePublishActions(actions: SalesOntologyActionInput[]) {
  return actions.map((action) => ({
    actionTypeCode: action.actionTypeCode,
    actionRef: action.actionRef,
    status: normalizeActionStatusForPublish(action.status),
    entity: action.entity ?? action.target,
    inputPayload: action.inputPayload ?? action.payload,
    resultPayload: action.resultPayload ?? action.result,
    evidence: action.evidence ?? (action.provenance?.length ? { provenance: action.provenance } : undefined),
    occurredAt: action.occurredAt
  }))
}

function normalizeActionStatusForPublish(status: string | undefined) {
  if (status === 'pending' || status === 'running' || status === 'succeeded' || status === 'failed' || status === 'canceled') {
    return status
  }
  if (status === 'completed' || status === 'executed' || status === 'approved') {
    return 'succeeded'
  }
  if (status === 'rejected') {
    return 'canceled'
  }
  return status
}

type SalesOntologyWorkbenchTab = 'workspace' | 'graph' | 'insights' | 'rules' | 'scenarios' | 'assistant' | 'tools' | 'actions'

function normalizeViewTab(value: string | undefined): SalesOntologyWorkbenchTab {
  if (
    value === 'workspace' ||
    value === 'graph' ||
    value === 'insights' ||
    value === 'rules' ||
    value === 'scenarios' ||
    value === 'assistant' ||
    value === 'tools' ||
    value === 'actions'
  ) {
    return value
  }
  return 'workspace'
}

function readPage(value: unknown) {
  return readLimit(value, 1)
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length
  }
}

function selectWorkbenchItems(
  viewTab: SalesOntologyWorkbenchTab,
  groups: Record<SalesOntologyWorkbenchTab, unknown[]>
) {
  return groups[viewTab] ?? groups.workspace
}

function searchItems<T>(items: T[], search: string | undefined) {
  if (!search) {
    return items
  }
  const keyword = search.toLowerCase()
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword))
}

function buildWorkspaceItems(
  perceptions: Array<Record<string, unknown>>,
  suggestions: Array<Record<string, unknown>>,
  proposals: Array<Record<string, unknown>>,
  notifications: Array<Record<string, unknown>>,
  reminders: Array<Record<string, unknown>>,
  effects: Array<Record<string, unknown>>
) {
  return [
    ...proposals.map((item) => ({ kind: 'action_proposal', ...item })),
    ...perceptions
      .filter((item) => (readNumber(item['riskScore']) ?? 0) >= 0.55)
      .map((item) => ({ kind: 'risk_perception', ...item })),
    ...suggestions.map((item) => ({ kind: 'suggestion', ...item })),
    ...notifications.map((item) => ({ kind: 'notification', ...item })),
    ...reminders.map((item) => ({ kind: 'reminder', ...item })),
    ...effects.map((item) => ({ kind: 'effect', ...item }))
  ].sort(compareCreatedAtDesc)
}

function buildWorkbenchInsightItems(
  perceptions: Array<Record<string, unknown>>,
  suggestions: Array<Record<string, unknown>>,
  effects: Array<Record<string, unknown>>
) {
  const perceptionItems = perceptions.map((item) => {
    const riskScore = readNumber(item['riskScore']) ?? 0
    const alerts = Array.isArray(item['alerts']) ? item['alerts'] : []
    return {
      id: readString(item['id']) ?? readString(item['entityExternalKey']) ?? `perception:${Math.random()}`,
      kind: 'perception',
      category: riskScore >= 0.55 || alerts.length ? 'risk' : 'trend',
      title: readString(item['entityName']) ?? readString(item['entityExternalKey']) ?? 'Sales Ontology perception',
      description: readString(readRecord(alerts[0])?.['message']) ?? readString(item['state']) ?? 'Sales Ontology perception result',
      priority: riskScore >= 0.75 ? 'high' : riskScore >= 0.55 ? 'medium' : 'low',
      confidence: riskScore,
      source: item
    }
  })
  const suggestionItems = suggestions.map((item) => {
    const type = readString(item['type']) ?? 'suggestion'
    const title = readString(item['title']) ?? 'Sales Ontology suggestion'
    return {
      id: readString(item['id']) ?? title,
      kind: 'suggestion',
      category: inferInsightCategory(`${type} ${title} ${readString(item['description']) ?? ''}`),
      title,
      description: readString(item['description']) ?? type,
      priority: readString(item['priority']) ?? 'medium',
      confidence: readNumber(item['confidence']) ?? 0,
      source: item
    }
  })
  const effectItems = effects.map((item) => ({
    id: readString(item['id']) ?? readString(item['decisionId']) ?? readString(item['metricName']) ?? `effect:${Math.random()}`,
    kind: 'effect',
    category: 'decision',
    title: readString(item['metricName']) ?? 'Decision effect',
    description: `${readString(item['status']) ?? 'unknown'} ${readNumber(item['actualValue']) ?? '-'} / ${readNumber(item['expectedValue']) ?? '-'}`,
    priority: readString(item['status']) === 'missed' ? 'high' : 'medium',
    confidence: 1,
    source: item
  }))
  return [...perceptionItems, ...suggestionItems, ...effectItems]
}

function filterInsightItems(items: Array<Record<string, unknown>>, insightType: string) {
  if (!insightType || insightType === 'all') {
    return items
  }
  return items.filter((item) => item['category'] === insightType)
}

function inferInsightCategory(text: string) {
  const normalized = text.toLowerCase()
  if (/risk|alert|churn|compliance|warning/.test(normalized)) return 'risk'
  if (/opportunity|growth|potential|next_best|action/.test(normalized)) return 'opportunity'
  if (/trend|temporal|trajectory/.test(normalized)) return 'trend'
  if (/relation|influence|network|link/.test(normalized)) return 'relation'
  return 'decision'
}

function buildWorkbenchGraph(input: {
  ontologyConfigured: boolean
  ontologyObjects: SalesOntologyObjectSummary[]
  ontologyRelations: SalesOntologyRelationInput[]
  perceptions: Array<Record<string, unknown>>
  suggestions: Array<Record<string, unknown>>
  proposals: Array<Record<string, unknown>>
  scenarios: Array<Record<string, unknown>>
  selectionId?: string
  neighborhood?: SalesOntologyBusinessOntologyNeighborhoodResponse
  graphError?: string
}) {
  if (!input.ontologyConfigured) {
    return {
      configured: false,
      nodes: [],
      edges: [],
      selectedId: input.selectionId,
      neighborhood: input.neighborhood,
      error: input.graphError,
      domainGroups: Object.entries(SALES_ONTOLOGY_DOMAIN_ONTOLOGY).map(([key, value]) => ({
        key,
        description: value.description,
        objectTypes: value.objectTypes,
        relations: value.relations,
        rules: value.rules
      }))
    }
  }

  const nodes = new Map<string, Record<string, unknown>>()
  const edges = new Map<string, Record<string, unknown>>()
  const addNode = (node: Record<string, unknown>) => {
    const id = readString(node['id'])
    if (!id || nodes.has(id)) return
    nodes.set(id, node)
  }
  const addEdge = (edge: Record<string, unknown>) => {
    const id = readString(edge['id'])
    if (!id || edges.has(id)) return
    edges.set(id, edge)
  }

  for (const object of input.ontologyObjects) {
    const id = graphNodeId('sales_ontology_object', object.externalKey)
    addNode({
      id,
      entityTypeCode: 'sales_ontology_object',
      externalKey: object.externalKey,
      label: object.label ?? object.externalKey,
      objectType: object.objectType ?? 'Unknown',
      domain: object.domain,
      state: object.state,
      attributes: object.attributes,
      properties: object.properties,
      riskScore: objectRiskScore(object),
      source: 'ontology'
    })
  }

  const objectExternalKeys = new Set(input.ontologyObjects.map((object) => object.externalKey).filter(Boolean))
  const ontologyRelations = input.ontologyRelations.filter(
    (relation) =>
      !objectExternalKeys.size ||
      objectExternalKeys.has(relation.source.externalKey) ||
      objectExternalKeys.has(relation.target.externalKey)
  )
  const relations = mergeRelations(ontologyRelations, demoRelationsForObjects(objectExternalKeys))
  relations.forEach((relation, index) => {
    const sourceId = graphNodeId(relation.source.entityTypeCode, relation.source.externalKey)
    const targetId = graphNodeId(relation.target.entityTypeCode, relation.target.externalKey)
    addNode({
      id: sourceId,
      entityTypeCode: relation.source.entityTypeCode,
      externalKey: relation.source.externalKey,
      label: relation.source.externalKey,
      objectType: relation.source.entityTypeCode,
      source: 'ontology_relation_endpoint'
    })
    addNode({
      id: targetId,
      entityTypeCode: relation.target.entityTypeCode,
      externalKey: relation.target.externalKey,
      label: readString(relation.attributes?.['target_label']) ?? relation.target.externalKey,
      objectType: readString(relation.attributes?.['target_object_type']) ?? relation.target.entityTypeCode,
      source: 'ontology_relation_endpoint'
    })
    addEdge({
      id: relationEdgeId(relation, index),
      source: sourceId,
      target: targetId,
      relationType: readString(relation.attributes?.['link_type']) ?? relation.relationTypeCode,
      confidence:
        readNumber(relation.attributes?.['confidence']) ??
        readNumber(relation.attributes?.['strength']) ??
        readNumber(readRecord(relation.provenance?.[0])?.['confidence']) ??
        1,
      attributes: relation.attributes,
      provenance: relation.provenance,
      edgeOrigin: 'ontology'
    })
  })

  for (const perception of input.perceptions) {
    const externalKey = readString(perception['entityExternalKey'])
    const entityTypeCode = readString(perception['entityTypeCode']) ?? 'sales_ontology_object'
    if (!externalKey) continue
    addNode({
      id: graphNodeId(entityTypeCode, externalKey),
      entityTypeCode,
      externalKey,
      label: readString(perception['entityName']) ?? externalKey,
      objectType: readString(perception['entityObjectType']) ?? 'Unknown',
      state: readString(perception['state']),
      riskScore: readNumber(perception['riskScore']) ?? 0,
      source: 'perception',
      perception
    })
  }

  for (const suggestion of input.suggestions) {
    const suggestionId = readString(suggestion['id'])
    const targets = Array.isArray(suggestion['targetEntities']) ? suggestion['targetEntities'] : []
    if (!suggestionId) continue
    addNode({
      id: graphNodeId('sales_ontology_suggestion', suggestionId),
      entityTypeCode: 'sales_ontology_suggestion',
      externalKey: suggestionId,
      label: readString(suggestion['title']) ?? 'Suggestion',
      objectType: 'Suggestion',
      source: 'suggestion',
      suggestion
    })
    for (const target of targets) {
      const record = readRecord(target)
      const externalKey = readString(record?.['externalKey'])
      const entityTypeCode = readString(record?.['entityTypeCode']) ?? 'sales_ontology_object'
      if (!externalKey) continue
      const targetId = graphNodeId(entityTypeCode, externalKey)
      addNode({
        id: targetId,
        entityTypeCode,
        externalKey,
        label: readString(record?.['label']) ?? externalKey,
        objectType: readString(record?.['objectType']) ?? 'BusinessObject',
        source: 'suggestion_target'
      })
      addEdge({
        id: `${suggestionId}:${externalKey}:targets`,
        source: graphNodeId('sales_ontology_suggestion', suggestionId),
        target: targetId,
        relationType: 'TARGETS',
        confidence: readNumber(suggestion['confidence']) ?? 0
      })
    }
  }

  for (const proposal of input.proposals) {
    const proposalId = readString(proposal['id'])
    const externalKey = readString(proposal['entityExternalKey'])
    const entityTypeCode = readString(proposal['entityTypeCode']) ?? 'sales_ontology_object'
    if (!proposalId) continue
    addNode({
      id: graphNodeId('sales_ontology_action_proposal', proposalId),
      entityTypeCode: 'sales_ontology_action_proposal',
      externalKey: proposalId,
      label: readString(proposal['title']) ?? 'Action proposal',
      objectType: 'ActionProposal',
      source: 'proposal',
      proposal
    })
    if (externalKey) {
      const targetId = graphNodeId(entityTypeCode, externalKey)
      addNode({
        id: targetId,
        entityTypeCode,
        externalKey,
        label: readString(proposal['entityName']) ?? externalKey,
        objectType: readString(proposal['entityObjectType']) ?? 'BusinessObject',
        source: 'proposal_target'
      })
      addEdge({
        id: `${proposalId}:${externalKey}:proposal_targets`,
        source: graphNodeId('sales_ontology_action_proposal', proposalId),
        target: targetId,
        relationType: 'PROPOSES_ACTION_FOR',
        confidence: readNumber(proposal['confidence']) ?? 0
      })
    }
  }

  for (const scenario of input.scenarios) {
    const scenarioId = readString(scenario['id'])
    if (!scenarioId) continue
    addNode({
      id: graphNodeId('sales_ontology_scenario', scenarioId),
      entityTypeCode: 'sales_ontology_scenario',
      externalKey: scenarioId,
      label: readString(scenario['name']) ?? 'Scenario',
      objectType: 'Scenario',
      domain: readString(scenario['category']),
      source: 'scenario',
      scenario
    })
  }

  return {
    configured: input.ontologyConfigured,
    nodes: Array.from(nodes.values()).slice(0, 160),
    edges: Array.from(edges.values()).slice(0, 240),
    selectedId: input.selectionId,
    neighborhood: input.neighborhood,
    error: input.graphError,
    domainGroups: Object.entries(SALES_ONTOLOGY_DOMAIN_ONTOLOGY).map(([key, value]) => ({
      key,
      description: value.description,
      objectTypes: value.objectTypes,
      relations: value.relations,
      rules: value.rules
    }))
  }
}

function graphNodeId(entityTypeCode: string, externalKey: string) {
  return `${entityTypeCode}:${externalKey}`
}

function relationEdgeId(relation: SalesOntologyRelationInput, index = 0) {
  const relationType = readString(relation.attributes?.['link_type']) ?? relation.relationTypeCode
  return `${graphNodeId(relation.source.entityTypeCode, relation.source.externalKey)}:${graphNodeId(
    relation.target.entityTypeCode,
    relation.target.externalKey
  )}:${relationType}:${index}`
}

function mergeRelations(...relationGroups: SalesOntologyRelationInput[][]) {
  const relations = new Map<string, SalesOntologyRelationInput>()
  for (const group of relationGroups) {
    for (const relation of group) {
      const relationType = readString(relation.attributes?.['link_type']) ?? relation.relationTypeCode
      const key = `${relation.source.entityTypeCode}:${relation.source.externalKey}:${relationType}:${relation.target.entityTypeCode}:${relation.target.externalKey}`
      if (!relations.has(key)) {
        relations.set(key, relation)
      }
    }
  }
  return Array.from(relations.values())
}

function demoRelationsForObjects(objectExternalKeys: Set<string>) {
  if (!objectExternalKeys.size) {
    return []
  }
  return SALES_ONTOLOGY_DEMO_RELATIONS.filter(
    (relation) => objectExternalKeys.has(relation.source) || objectExternalKeys.has(relation.target)
  ).map(demoRelationToOntologyRelation)
}

function extractNeighborhoodRelations(neighborhood: SalesOntologyBusinessOntologyNeighborhoodResponse | undefined) {
  if (!neighborhood) {
    return []
  }
  const nested = readRecord(neighborhood['neighborhood'])
  const items = [
    ...(readArrayOfRecords(neighborhood['relations']) ?? []),
    ...(readArrayOfRecords(neighborhood['edges']) ?? []),
    ...(readArrayOfRecords(neighborhood['links']) ?? []),
    ...(readArrayOfRecords(nested?.['relations']) ?? []),
    ...(readArrayOfRecords(nested?.['edges']) ?? []),
    ...(readArrayOfRecords(nested?.['links']) ?? [])
  ]
  return normalizeRelations(items)
}

function normalizeRelations(items: unknown[]) {
  return items
    .map(normalizeRelationSummary)
    .filter((relation): relation is SalesOntologyRelationInput => Boolean(relation))
}

function normalizeRelationSummary(input: unknown): SalesOntologyRelationInput | undefined {
  const record = readRecord(input) ?? {}
  const attributes = {
    ...(readRecord(record['attributes']) ?? readRecord(record['properties']) ?? {})
  }
  const sourceRef = normalizeEntityRef(record, 'source')
  const targetRef = normalizeEntityRef(record, 'target')
  if (!sourceRef || !targetRef) {
    return undefined
  }
  const explicitRelationType =
    readString(record['relationType']) ??
    readString(record['type']) ??
    readString(record['typeCode']) ??
    readString(record['code']) ??
    readString(attributes['link_type'])
  const relationTypeCode = readString(record['relationTypeCode']) ?? explicitRelationType ?? 'sales_ontology_object_link'
  if (!readString(attributes['link_type']) && explicitRelationType) {
    attributes['link_type'] = explicitRelationType
  }
  return {
    relationTypeCode,
    source: sourceRef,
    target: targetRef,
    attributes,
    provenance: readArrayOfRecords(record['provenance']) as SalesOntologyRelationInput['provenance']
  }
}

function normalizeEntityRef(record: Record<string, unknown>, side: 'source' | 'target') {
  const refRecord =
    readRecord(record[side]) ??
    readRecord(record[`${side}Entity`]) ??
    readRecord(record[`${side}Node`]) ??
    readRecord(record[`${side}Ref`])
  const directRef = parseEntityRefValue(record[side]) ?? parseEntityRefValue(record[`${side}Id`])
  const entityTypeCode =
    readString(refRecord?.['entityTypeCode']) ??
    readString(refRecord?.['typeCode']) ??
    readString(refRecord?.['entityType']) ??
    readString(record[`${side}EntityTypeCode`]) ??
    readString(record[`${side}TypeCode`]) ??
    readString(record[`${side}EntityType`]) ??
    directRef?.entityTypeCode ??
    'sales_ontology_object'
  const externalKey =
    readString(refRecord?.['externalKey']) ??
    readString(refRecord?.['externalId']) ??
    readString(refRecord?.['external_key']) ??
    readString(record[`${side}ExternalKey`]) ??
    readString(record[`${side}ExternalId`]) ??
    directRef?.externalKey
  if (!externalKey) {
    return undefined
  }
  return { entityTypeCode, externalKey }
}

function parseEntityRefValue(value: unknown) {
  const text = readString(value)
  if (!text) {
    return undefined
  }
  return parseSelectionId(text) ?? { entityTypeCode: 'sales_ontology_object', externalKey: text }
}

function parseSelectionId(selectionId: string | undefined) {
  if (!selectionId) {
    return undefined
  }
  const splitAt = selectionId.indexOf(':')
  if (splitAt <= 0 || splitAt >= selectionId.length - 1) {
    return undefined
  }
  return {
    entityTypeCode: selectionId.slice(0, splitAt),
    externalKey: selectionId.slice(splitAt + 1)
  }
}

function buildWorkbenchRuleItems(runs: Array<Record<string, unknown>>) {
  const domainRules = Object.entries(SALES_ONTOLOGY_DOMAIN_ONTOLOGY).flatMap(([domain, value]) =>
    value.rules.map((rule) => ({
      id: `rule:${domain}:${rule}`,
      kind: 'domain_rule',
      domain,
      title: rule,
      description: value.description,
      confidence: 1,
      status: 'configured'
    }))
  )
  const reasoningRuns = runs
    .filter((run) => readString(run['runType']) === 'reasoning')
    .map((run) => ({
      id: readString(run['id']) ?? `reasoning:${readString(run['createdAt']) ?? Date.now()}`,
      kind: 'reasoning_run',
      title: readString(readRecord(run['output'])?.['reasoningType']) ?? 'reasoning',
      description: readString(readRecord(run['output'])?.['hypothesis']) ?? readString(run['status']) ?? 'completed',
      confidence: readNumber(run['confidence']) ?? readNumber(readRecord(run['output'])?.['confidence']) ?? 0,
      status: readString(run['status']) ?? 'completed',
      source: run
    }))
  return [...reasoningRuns, ...domainRules]
}

function buildAssistantItems(
  runs: Array<Record<string, unknown>>,
  logs: Array<Record<string, unknown>>,
  notifications: Array<Record<string, unknown>>,
  reminders: Array<Record<string, unknown>>
) {
  return [
    ...runs.slice(0, 12).map((run) => ({ kind: 'run', title: readString(run['runType']) ?? 'run', source: run })),
    ...logs.slice(0, 12).map((log) => ({ kind: 'tool_log', title: readString(log['toolName']) ?? readString(log['actionName']) ?? 'tool', source: log })),
    ...notifications.slice(0, 8).map((item) => ({ kind: 'notification', title: readString(item['title']) ?? 'notification', source: item })),
    ...reminders.slice(0, 8).map((item) => ({ kind: 'reminder', title: readString(item['title']) ?? 'reminder', source: item }))
  ]
}

function buildToolStatus(domain: ReturnType<SalesOntologyService['getDomainOntology']>, ontologyConfigured: boolean, logs: Array<Record<string, unknown>>) {
  const recentTools = new Set(logs.map((log) => readString(log['toolName']) ?? readString(log['actionName'])).filter(Boolean))
  const items = [
    { key: 'sales_ontology_publish_business_snapshot', title: 'Publish ontology snapshot', group: 'ontology' },
    { key: 'sales_ontology_get_customer_context', title: 'Read customer context', group: 'context' },
    { key: 'sales_ontology_run_perception', title: 'Run perception', group: 'perception' },
    { key: 'sales_ontology_run_reasoning', title: 'Run reasoning', group: 'reasoning' },
    { key: 'sales_ontology_generate_suggestions', title: 'Generate suggestions', group: 'planning' },
    { key: 'sales_ontology_propose_action', title: 'Propose governed action', group: 'governance' },
    { key: 'sales_ontology_simulate_scenario', title: 'Simulate scenario', group: 'scenario' },
    { key: 'sales_ontology_record_decision_effect', title: 'Record decision effect', group: 'learning' }
  ].map((item) => ({
    ...item,
    status: recentTools.has(item.key) ? 'recent' : 'available'
  }))
  return {
    ontologyConfigured,
    implementedReasoningTypes: domain.implementedReasoningTypes,
    executableActions: domain.executableActions,
    items
  }
}

function compareCreatedAtDesc(a: Record<string, unknown>, b: Record<string, unknown>) {
  const left = readDate(a['createdAt'])?.getTime() ?? 0
  const right = readDate(b['createdAt'])?.getTime() ?? 0
  return right - left
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error)
}

function normalizeProvenanceEntries(provenance: SalesOntologyEntityInput['provenance']) {
  if (!Array.isArray(provenance) || provenance.length === 0) {
    return undefined
  }
  const normalized = provenance
    .map((entry, index) => {
      const record = readRecord(entry) ?? {}
      const ref = readString(record['ref']) ?? readString(record['source']) ?? `sales-ontology:evidence:${index + 1}`
      return {
        ref,
        source: 'resource_instance' as const,
        evidence: record
      }
    })
    .filter((entry) => entry.ref)
  return normalized.length ? normalized : undefined
}

function normalizeObjectSummary(input: unknown): SalesOntologyObjectSummary {
  const record = readRecord(input) ?? {}
  const attributes = readRecord(record['attributes']) ?? {}
  const properties = readRecord(attributes['properties']) ?? readRecord(record['properties']) ?? {}
  return {
    externalKey: readString(record['externalKey']) ?? readString(record['externalId']) ?? readString(record['id']) ?? '',
    label: readString(record['displayName']) ?? readString(record['label']) ?? readString(record['name']),
    state: readString(record['currentStateCode']) ?? readString(attributes['status']),
    objectType: readString(attributes['object_type']) ?? readString(properties['objectType']),
    domain: readString(attributes['domain']) ?? readString(properties['domain']),
    properties,
    attributes,
    provenance: readArrayOfRecords(record['provenance'])
  }
}

function analyzeObject(object: SalesOntologyObjectSummary) {
  const anomalies: Record<string, unknown>[] = []
  const patterns: Record<string, unknown>[] = []
  const alerts: Record<string, unknown>[] = []
  let riskScore = 0.15
  let churnProbability = 0.1
  let loyaltyScore = 0.75

  const prescriptionVolume =
    readNumber(object.properties['prescription_volume']) ?? readNumber(object.properties['prescriptionVolume'])
  if (object.objectType === 'Doctor' && typeof prescriptionVolume === 'number' && prescriptionVolume < 80) {
    riskScore += 0.28
    churnProbability += 0.22
    loyaltyScore -= 0.18
    anomalies.push({ type: 'low_prescription_volume', value: prescriptionVolume, threshold: 80 })
    alerts.push({ severity: prescriptionVolume < 50 ? 'high' : 'medium', message: 'Prescription volume is below target.' })
  }

  const lastVisit = readDate(object.properties['last_visit_date'] ?? object.properties['lastVisitDate'])
  if (lastVisit && daysBetween(lastVisit, new Date()) > 28) {
    riskScore += 0.2
    churnProbability += 0.15
    anomalies.push({ type: 'visit_gap', days: daysBetween(lastVisit, new Date()), threshold: 28 })
  }

  const accessStatus = readString(object.properties['access_status']) ?? readString(object.properties['accessStatus'])
  if (object.objectType === 'Hospital' && ['pending', 'restricted', 'blocked'].includes((accessStatus ?? '').toLowerCase())) {
    riskScore += 0.25
    alerts.push({ severity: 'high', message: 'Hospital access status blocks field execution.' })
  }

  const complianceRisk =
    readString(object.attributes['compliance_risk_level']) ?? readString(object.properties['complianceRiskLevel'])
  if (['high', 'critical'].includes((complianceRisk ?? '').toLowerCase())) {
    riskScore += complianceRisk === 'critical' ? 0.45 : 0.3
    alerts.push({ severity: complianceRisk, message: 'Compliance risk requires review.' })
  }

  if ((object.state ?? '').toLowerCase() === 'critical') {
    riskScore += 0.2
  }

  patterns.push({ type: 'object_state', state: object.state ?? 'unknown', objectType: object.objectType ?? 'Unknown' })
  return {
    entityTypeCode: 'sales_ontology_object',
    entityExternalKey: object.externalKey,
    entityName: object.label,
    entityObjectType: object.objectType,
    state: object.state,
    riskScore: clamp01(riskScore),
    churnProbability: clamp01(churnProbability),
    loyaltyScore: clamp01(loyaltyScore),
    anomalies,
    patterns,
    alerts,
    attribution: {
      source: 'sales_ontology_rules_v1',
      evaluatedAt: new Date().toISOString()
    },
    evidence: object.provenance
  }
}

function buildReasoningConclusion(reasoningType: string, context: { total: number; objectTypes: Record<string, number> }) {
  const dominantType = Object.entries(context.objectTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'business objects'
  return {
    signal: `${context.total} objects loaded; dominant type is ${dominantType}.`,
    hypothesis:
      reasoningType === 'temporal'
        ? 'Recent activity cadence should be compared against visit and performance windows.'
        : reasoningType === 'attribution'
          ? 'Underperformance is likely caused by a combination of relationship recency, access constraints, and compliance controls.'
          : 'Decision risk is concentrated where commercial signal weakness overlaps with operational or compliance constraints.',
    confidence: context.total > 0 ? 0.72 : 0.35
  }
}

function normalizeReasoningType(value: string) {
  return value.replace(/-/g, '_')
}

function buildAdvancedReasoning(reasoningType: string, objects: SalesOntologyObjectSummary[], input: Record<string, unknown>) {
  const findings: Record<string, unknown>[] = []
  const recommendations: Record<string, unknown>[] = []
  const chain: Record<string, unknown>[] = [
    { step: 'collect_context', result: `Loaded ${objects.length} Sales Ontology ontology objects.` }
  ]
  const riskObjects = objects.filter((object) => objectRiskScore(object) >= 0.55)
  const target = findTargetObject(objects, input)

  if (reasoningType === 'consistency' || reasoningType === 'validate') {
    const issues = objects.flatMap((object) => consistencyIssues(object))
    findings.push(...issues)
    recommendations.push({ action: 'repair_data_quality', priority: issues.length ? 'medium' : 'low', issueCount: issues.length })
    return reasoningResult(reasoningType, chain, findings, recommendations, issues.length ? 0.68 : 0.88, issues.length ? 'Ontology consistency issues were found.' : 'Ontology object data is internally consistent.')
  }

  if (reasoningType === 'temporal') {
    for (const object of objects) {
      const trends = inferTemporalTrends(object)
      if (trends.length) findings.push({ entity: object.externalKey, trends })
    }
    recommendations.push({ action: 'compare_recent_windows', priority: 'medium' })
    return reasoningResult(reasoningType, chain, findings, recommendations, findings.length ? 0.76 : 0.42, 'Recent object properties were inspected for trend direction and cadence risk.')
  }

  if (reasoningType === 'implicit_relations') {
    const grouped = groupBy(objects, (object) => `${object.objectType ?? 'Unknown'}:${object.domain ?? 'global'}`)
    for (const [group, members] of Object.entries(grouped)) {
      if (members.length > 1) {
        findings.push({ group, relation: 'peer_similarity', candidates: members.slice(0, 5).map((item) => item.externalKey), confidence: 0.62 })
      }
    }
    recommendations.push({ action: 'publish_candidate_object_links', priority: findings.length ? 'medium' : 'low' })
    return reasoningResult(reasoningType, chain, findings, recommendations, findings.length ? 0.66 : 0.35, 'Objects sharing type/domain were mined as candidate implicit relations.')
  }

  if (reasoningType === 'abductive') {
    const observation = readString(input['observation']) ?? readString(input['keyword']) ?? 'business anomaly'
    for (const object of riskObjects.slice(0, 10)) {
      findings.push({
        entity: object.externalKey,
        observation,
        explanations: abductiveExplanations(object),
        confidence: 0.7
      })
    }
    recommendations.push({ action: 'collect_missing_evidence', priority: riskObjects.length ? 'high' : 'medium' })
    return reasoningResult(reasoningType, chain, findings, recommendations, riskObjects.length ? 0.7 : 0.35, 'Plausible explanations were generated for observed risk signals.')
  }

  if (reasoningType.startsWith('attribution')) {
    const attribution = buildAttribution(target ?? riskObjects[0] ?? objects[0])
    findings.push(attribution)
    recommendations.push(...attribution.recommendations)
    return reasoningResult(reasoningType, chain, findings, recommendations, 0.74, 'Metric change was attributed across relationship, access, compliance, and execution factors.')
  }

  if (reasoningType === 'analogy') {
    const targetObject = target ?? riskObjects[0]
    const analogs = targetObject ? findAnalogs(targetObject, objects) : []
    findings.push({ target: targetObject?.externalKey, analogs })
    recommendations.push({ action: 'reuse_successful_playbook', priority: analogs.length ? 'medium' : 'low' })
    return reasoningResult(reasoningType, chain, findings, recommendations, analogs.length ? 0.65 : 0.35, 'Similar objects were compared to identify reusable sales playbooks.')
  }

  if (reasoningType === 'counterfactual') {
    const intervention = readRecord(input['intervention']) ?? { visit_frequency: '+1', compliance_risk: 'reduced' }
    const baselineRisk = average(riskObjects.map(objectRiskScore)) ?? 0.3
    const simulatedRisk = clamp01(baselineRisk - 0.18)
    findings.push({ intervention, baselineRisk, simulatedRisk, expectedRiskReduction: baselineRisk - simulatedRisk })
    recommendations.push({ action: 'test_counterfactual_with_scenario', priority: 'medium' })
    return reasoningResult(reasoningType, chain, findings, recommendations, 0.62, 'A counterfactual intervention was simulated against aggregate risk.')
  }

  if (reasoningType === 'hierarchical') {
    const byDomain = countBy(objects, (object) => object.domain ?? 'unknown')
    const byType = countBy(objects, (object) => object.objectType ?? 'Unknown')
    findings.push({ byDomain, byType, levels: ['domain', 'object_type', 'object'] })
    recommendations.push({ action: 'drill_down_largest_risk_domain', priority: 'medium' })
    return reasoningResult(reasoningType, chain, findings, recommendations, 0.7, 'Objects were decomposed by domain and type for hierarchical risk review.')
  }

  if (reasoningType === 'multi_step') {
    chain.push(
      { step: 'perceive', result: `${riskObjects.length} risky objects detected.` },
      { step: 'reason', result: 'Risk drivers were mapped to action candidates.' },
      { step: 'plan', result: 'Actions should be proposed before write-back.' }
    )
    recommendations.push(...riskObjects.slice(0, 5).map((object) => ({ action: objectActionRecommendation(object), target: object.externalKey, priority: 'high' })))
    return reasoningResult(reasoningType, chain, findings, recommendations, 0.72, 'A multi-step perceive-reason-plan chain was constructed.')
  }

  if (reasoningType === 'constraint_check') {
    const constraints = objects.flatMap((object) => businessConstraintIssues(object))
    findings.push(...constraints)
    recommendations.push({ action: 'fix_constraint_violations', priority: constraints.length ? 'high' : 'low' })
    return reasoningResult(reasoningType, chain, findings, recommendations, constraints.length ? 0.76 : 0.88, constraints.length ? 'Business constraints have violations.' : 'No major business constraint violations were detected.')
  }

  if (reasoningType === 'coordination') {
    const owners = countBy(objects, (object) => readString(object.attributes['owner_id']) ?? readString(object.properties['ownerId']) ?? 'unassigned')
    findings.push({ owners, unassignedCount: owners['unassigned'] ?? 0 })
    recommendations.push({ action: 'assign_owner_and_follow_up', priority: (owners['unassigned'] ?? 0) > 0 ? 'high' : 'medium' })
    return reasoningResult(reasoningType, chain, findings, recommendations, 0.68, 'Ownership and coordination gaps were inspected.')
  }

  for (const object of riskObjects.slice(0, 10)) {
    findings.push({ entity: object.externalKey, riskScore: objectRiskScore(object), drivers: abductiveExplanations(object) })
  }
  recommendations.push(...riskObjects.slice(0, 5).map((object) => ({ action: objectActionRecommendation(object), target: object.externalKey, priority: 'high' })))
  return reasoningResult(reasoningType, chain, findings, recommendations, objects.length ? 0.72 : 0.35, 'Decision risk is concentrated where commercial signal weakness overlaps with operational or compliance constraints.')
}

function reasoningResult(
  reasoningType: string,
  chain: Record<string, unknown>[],
  findings: Record<string, unknown>[],
  recommendations: Record<string, unknown>[],
  confidence: number,
  hypothesis: string
) {
  chain.push({ step: 'generate_hypothesis', result: hypothesis })
  return {
    reasoningType,
    signal: `${findings.length} findings, ${recommendations.length} recommendations.`,
    hypothesis,
    confidence,
    findings,
    recommendations,
    chain
  }
}

function consistencyIssues(object: SalesOntologyObjectSummary) {
  const issues: Record<string, unknown>[] = []
  if (!object.externalKey) issues.push({ type: 'missing_external_key', entity: object.label })
  if (!object.objectType) issues.push({ type: 'missing_object_type', entity: object.externalKey })
  for (const [key, value] of Object.entries(object.properties)) {
    if (typeof value === 'number' && value < 0 && /rate|score|achievement|share/i.test(key)) {
      issues.push({ type: 'negative_value', entity: object.externalKey, field: key, value })
    }
  }
  return issues
}

function businessConstraintIssues(object: SalesOntologyObjectSummary) {
  const issues: Record<string, unknown>[] = []
  const achievement = readNumber(object.properties['achievement_rate']) ?? readNumber(object.properties['achievementRate'])
  if (object.objectType === 'SalesTarget' && typeof achievement === 'number' && achievement < 0.7) {
    issues.push({ type: 'target_under_threshold', entity: object.externalKey, achievement })
  }
  const complianceRisk = readString(object.attributes['compliance_risk_level']) ?? readString(object.properties['complianceRiskLevel'])
  if (['high', 'critical'].includes((complianceRisk ?? '').toLowerCase()) && object.state !== 'pending' && object.state !== 'investigating') {
    issues.push({ type: 'compliance_not_under_review', entity: object.externalKey, complianceRisk, state: object.state })
  }
  return issues
}

function inferTemporalTrends(object: SalesOntologyObjectSummary) {
  const trends: Record<string, unknown>[] = []
  for (const key of ['prescription_volume', 'actual', 'achievement_rate', 'market_share']) {
    const current = readNumber(object.properties[key]) ?? readNumber(object.properties[camelCase(key)])
    const previous = readNumber(object.properties[`previous_${key}`]) ?? readNumber(object.properties[`previous${capitalize(camelCase(key))}`])
    if (current !== undefined && previous !== undefined) {
      trends.push({
        metric: key,
        direction: current > previous ? 'increasing' : current < previous ? 'decreasing' : 'stable',
        changePercent: previous === 0 ? 0 : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10,
        current,
        previous
      })
    }
  }
  return trends
}

function abductiveExplanations(object: SalesOntologyObjectSummary) {
  const explanations = []
  const volume = readNumber(object.properties['prescription_volume']) ?? readNumber(object.properties['prescriptionVolume'])
  if (object.objectType === 'Doctor' && typeof volume === 'number' && volume < 80) {
    explanations.push('Prescription volume is low; possible competitor penetration, weak visit cadence, or product perception issue.')
  }
  const lastVisit = readDate(object.properties['last_visit_date'] ?? object.properties['lastVisitDate'])
  if (lastVisit && daysBetween(lastVisit, new Date()) > 28) {
    explanations.push('Visit gap exceeds recommended cadence.')
  }
  const accessStatus = readString(object.properties['access_status']) ?? readString(object.properties['accessStatus'])
  if (['pending', 'restricted', 'blocked'].includes((accessStatus ?? '').toLowerCase())) {
    explanations.push('Hospital access or listing status constrains execution.')
  }
  const riskLevel = readString(object.attributes['compliance_risk_level']) ?? readString(object.properties['complianceRiskLevel'])
  if (['high', 'critical'].includes((riskLevel ?? '').toLowerCase())) {
    explanations.push('Compliance risk is high enough to require governance before action.')
  }
  return explanations.length ? explanations : ['No dominant explanation; collect more visit, event, and time-series evidence.']
}

function buildAttribution(object: SalesOntologyObjectSummary | undefined) {
  const factors = [
    { factor: 'relationship_recency', contribution: object ? (abductiveExplanations(object).some((item) => item.includes('Visit gap')) ? 0.32 : 0.12) : 0.1 },
    { factor: 'commercial_signal', contribution: object ? Math.min(0.42, objectRiskScore(object) * 0.45) : 0.2 },
    { factor: 'access_constraint', contribution: object && abductiveExplanations(object).some((item) => item.includes('access')) ? 0.25 : 0.08 },
    { factor: 'compliance_control', contribution: object && abductiveExplanations(object).some((item) => item.includes('Compliance')) ? 0.28 : 0.05 }
  ]
  const total = factors.reduce((sum, item) => sum + item.contribution, 0) || 1
  const normalized = factors.map((item) => ({
    ...item,
    contributionPercent: Math.round((item.contribution / total) * 1000) / 10
  }))
  return {
    target: object?.externalKey,
    factors: normalized,
    recommendations: normalized
      .filter((item) => item.contributionPercent >= 20)
      .map((item) => ({ action: `improve_${item.factor}`, priority: 'high', contributionPercent: item.contributionPercent }))
  }
}

function findTargetObject(objects: SalesOntologyObjectSummary[], input: Record<string, unknown>) {
  const target = readString(input['targetExternalKey']) ?? readString(input['entityExternalKey'])
  return target ? objects.find((object) => object.externalKey === target) : undefined
}

function findAnalogs(target: SalesOntologyObjectSummary, objects: SalesOntologyObjectSummary[]) {
  return objects
    .filter((object) => object.externalKey !== target.externalKey && object.objectType === target.objectType)
    .map((object) => ({
      externalKey: object.externalKey,
      label: object.label,
      similarity: similarityScore(target, object),
      successfulPattern: objectRiskScore(object) < objectRiskScore(target) ? 'lower_risk_peer' : 'similar_risk_peer'
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
}

function similarityScore(a: SalesOntologyObjectSummary, b: SalesOntologyObjectSummary) {
  let score = 0.35
  if (a.domain && a.domain === b.domain) score += 0.2
  for (const key of ['specialty', 'department', 'region', 'territory']) {
    if (a.properties[key] && a.properties[key] === b.properties[key]) score += 0.12
  }
  return clamp01(score)
}

function objectActionRecommendation(object: SalesOntologyObjectSummary) {
  if (object.objectType === 'Doctor') return 'sales_ontology.schedule_visit'
  if (object.objectType === 'Hospital') return 'sales_ontology.update_access_status'
  if (object.objectType === 'SalesTarget') return 'sales_ontology.update_actual_value'
  if (object.objectType === 'ComplianceAlert') return 'sales_ontology.escalate_alert'
  return 'sales_ontology.propose_action'
}

function objectRiskScore(object: SalesOntologyObjectSummary) {
  const direct = readNumber(object.properties['risk_score']) ?? readNumber(object.properties['riskScore'])
  if (direct !== undefined) return clamp01(direct > 1 ? direct / 100 : direct)
  return analyzeObject(object).riskScore
}

function buildInsights(objects: SalesOntologyObjectSummary[]) {
  const insights: Array<{
    id: string
    title: string
    description: string
    confidence: number
    priority: SalesOntologyPriority
    target?: SalesOntologyObjectSummary
    evidence?: Record<string, unknown>[]
  }> = []
  for (const object of objects) {
    const influence = readNumber(object.properties['influence_score']) ?? readNumber(object.properties['influenceScore'])
    const volume = readNumber(object.properties['prescription_volume']) ?? readNumber(object.properties['prescriptionVolume'])
    if (object.objectType === 'Doctor' && (influence ?? 0) >= 70 && (volume ?? 999) < 80) {
      insights.push({
        id: `insight:${object.externalKey}:high-influence-low-volume`,
        title: 'High influence doctor has low prescription volume',
        description: `${object.label ?? object.externalKey} has influence signal above threshold while prescription volume is low.`,
        confidence: 0.78,
        priority: 'high',
        target: object
      })
    }
    const achievement =
      readNumber(object.properties['achievement_rate']) ?? readNumber(object.properties['achievementRate'])
    if (object.objectType === 'SalesTarget' && typeof achievement === 'number' && achievement < 0.8) {
      insights.push({
        id: `insight:${object.externalKey}:target-gap`,
        title: 'Sales target is below plan',
        description: `${object.label ?? object.externalKey} achievement rate is ${Math.round(achievement * 100)}%.`,
        confidence: 0.82,
        priority: achievement < 0.55 ? 'critical' : 'high',
        target: object
      })
    }
  }
  return insights
}

function buildSuggestions(objects: SalesOntologyObjectSummary[]) {
  return buildInsights(objects).map((insight) => ({
    type: 'next_best_action',
    priority: insight.priority,
    title: insight.priority === 'critical' ? 'Escalate and assign recovery owner' : 'Create targeted follow-up plan',
    description: insight.description,
    targetEntities: insight.target
      ? [
          {
            entityTypeCode: 'sales_ontology_object',
            externalKey: insight.target.externalKey,
            label: insight.target.label,
            objectType: insight.target.objectType
          }
        ]
      : [],
    reasoningChain: [
      { step: 'insight', value: insight.title },
      { step: 'risk_priority', value: insight.priority }
    ],
    suggestedActions: [
      {
        actionType: insight.priority === 'critical' ? 'sales_ontology.flag_compliance_risk' : 'sales_ontology.schedule_visit',
        requiresApproval: insight.priority === 'critical'
      }
    ],
    expectedImpact: {
      confidence: insight.confidence,
      metric: insight.priority === 'critical' ? 'risk_reduction' : 'engagement_recovery'
    },
    confidence: insight.confidence,
    evidence: insight.evidence
  }))
}

function insightToEntity(insight: ReturnType<typeof buildInsights>[number]): SalesOntologyEntityInput {
  return {
    entityTypeCode: 'sales_ontology_insight',
    externalKey: insight.id,
    displayName: insight.title,
    currentStateCode: 'active',
    attributes: {
      title: insight.title,
      description: insight.description,
      priority: insight.priority,
      confidence: insight.confidence,
      payload: insight
    }
  }
}

function insightToRelation(insight: ReturnType<typeof buildInsights>[number]): SalesOntologyRelationInput | undefined {
  if (!insight.target) {
    return undefined
  }
  return {
    relationTypeCode: 'sales_ontology_insight_mentions_object',
    source: { entityTypeCode: 'sales_ontology_insight', externalKey: insight.id },
    target: { entityTypeCode: 'sales_ontology_object', externalKey: insight.target.externalKey },
    attributes: { confidence: insight.confidence }
  }
}

function suggestionToEntity(suggestion: SalesOntologySuggestion): SalesOntologyEntityInput {
  return {
    entityTypeCode: 'sales_ontology_suggestion',
    externalKey: suggestion.id ?? `suggestion:${Date.now()}`,
    displayName: suggestion.title,
    currentStateCode: suggestion.status,
    attributes: {
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      confidence: suggestion.confidence,
      status: suggestion.status,
      payload: suggestion
    },
    provenance: suggestion.evidence
  }
}

function suggestionToRelation(suggestion: SalesOntologySuggestion): SalesOntologyRelationInput | undefined {
  const target = suggestion.targetEntities?.[0]
  const externalKey = readString(target?.['externalKey'])
  if (!suggestion.id || !externalKey) {
    return undefined
  }
  return {
    relationTypeCode: 'sales_ontology_suggestion_targets_object',
    source: { entityTypeCode: 'sales_ontology_suggestion', externalKey: suggestion.id },
    target: { entityTypeCode: 'sales_ontology_object', externalKey },
    attributes: { confidence: suggestion.confidence }
  }
}

function proposalToEntity(proposal: SalesOntologyActionProposal): SalesOntologyEntityInput {
  return {
    entityTypeCode: 'sales_ontology_action_proposal',
    externalKey: proposal.id ?? `proposal:${Date.now()}`,
    displayName: proposal.title,
    currentStateCode: proposal.status,
    attributes: {
      title: proposal.title,
      description: proposal.description,
      priority: proposal.priority,
      confidence: proposal.confidence,
      status: proposal.status,
      payload: proposal
    },
    provenance: proposal.evidence
  }
}

function proposalToRelation(proposal: SalesOntologyActionProposal): SalesOntologyRelationInput | undefined {
  if (!proposal.id || !proposal.entityExternalKey) {
    return undefined
  }
  return {
    relationTypeCode: 'sales_ontology_proposal_targets_object',
    source: { entityTypeCode: 'sales_ontology_action_proposal', externalKey: proposal.id },
    target: { entityTypeCode: proposal.entityTypeCode ?? 'sales_ontology_object', externalKey: proposal.entityExternalKey },
    attributes: { confidence: proposal.confidence }
  }
}

function normalizeActionName(value: string) {
  const raw = value.trim()
  const map: Record<string, string> = {
    scheduleVisit: 'sales_ontology.schedule_visit',
    updateSentiment: 'sales_ontology.update_sentiment',
    flagComplianceRisk: 'sales_ontology.flag_compliance_risk',
    markAsAtRisk: 'sales_ontology.mark_as_at_risk',
    generateVisitBrief: 'sales_ontology.generate_visit_brief',
    updateAccessStatus: 'sales_ontology.update_access_status',
    dismiss: 'sales_ontology.dismiss_alert',
    escalate: 'sales_ontology.escalate_alert',
    approve: 'sales_ontology.approve_plan',
    reject: 'sales_ontology.reject_plan',
    updateActualValue: 'sales_ontology.update_actual_value',
    allocateBudget: 'sales_ontology.allocate_budget',
    advanceCycle: 'sales_ontology.advance_cycle',
    updateStatus: 'sales_ontology.update_status',
    inviteToEvent: 'sales_ontology.invite_to_event',
    create_visit_record: 'sales_ontology.schedule_visit',
    update_doctor_sentiment: 'sales_ontology.update_sentiment',
    flag_compliance_risk: 'sales_ontology.flag_compliance_risk',
    send_notification: 'sales_ontology.send_notification'
  }
  return map[raw] ?? (raw.startsWith('sales_ontology.') ? raw : `sales_ontology.${raw}`)
}

function getActionDefinition(actionName: string) {
  return SALES_ONTOLOGY_MANIFEST.actionTypes.find((item) => item.code === actionName)
}

function actionLabel(actionName: string) {
  return getActionDefinition(actionName)?.name ?? actionName
}

function evaluatePreconditions(target: SalesOntologyObjectSummary, preconditions: string[] | undefined) {
  for (const condition of preconditions ?? []) {
    const result = evaluateCondition(target, condition)
    if (!result.valid) return result
  }
  return { valid: true }
}

function evaluateCondition(target: SalesOntologyObjectSummary, condition: string) {
  const normalized = condition.trim()
  if (!normalized) return { valid: true }
  for (const operator of ['!=', '==', '>=', '>', ' in ']) {
    if (!normalized.includes(operator)) continue
    const [left, right] = normalized.split(operator)
    const actual = resolveTargetField(target, left.trim())
    const expected = right.trim().replace(/^[["']+|[\]"']+$/g, '')
    if (operator === '!=' && actual !== undefined && String(actual) === expected) return { valid: false, reason: `${left.trim()} is ${expected}` }
    if (operator === '==' && actual !== undefined && String(actual) !== expected) return { valid: false, reason: `${left.trim()} is ${actual}, not ${expected}` }
    if (operator === '>=' && readNumber(actual) !== undefined && readNumber(actual) < Number(expected)) return { valid: false, reason: `${left.trim()} is below ${expected}` }
    if (operator === '>' && readNumber(actual) !== undefined && readNumber(actual) <= Number(expected)) return { valid: false, reason: `${left.trim()} is not greater than ${expected}` }
    if (operator === ' in ') {
      const values = right.replace(/[[\]]/g, '').split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      if (actual !== undefined && !values.includes(String(actual))) return { valid: false, reason: `${left.trim()} is not in ${values.join(', ')}` }
    }
  }
  return { valid: true }
}

function resolveTargetField(target: SalesOntologyObjectSummary, fieldPath: string) {
  const field = fieldPath.split('.').pop() ?? fieldPath
  if (field === 'lifecycleStage') return target.attributes['lifecycle_stage'] ?? target.properties['lifecycleStage'] ?? target.state
  if (field === 'status') return target.state ?? target.attributes['status'] ?? target.properties['status']
  return target.attributes[field] ?? target.properties[field] ?? target.properties[camelCase(field)]
}

function executeActionLogic(actionName: string, target: SalesOntologyObjectSummary, params: Record<string, unknown>) {
  const result: Record<string, unknown> = {
    action: actionName,
    objectId: target.externalKey,
    objectName: target.label ?? target.externalKey,
    success: true
  }
  if (actionName === 'sales_ontology.schedule_visit') {
    result['visitDate'] = readString(params['visitDate']) ?? readString(params['date']) ?? new Date(Date.now() + 86400000).toISOString()
    result['message'] = `Visit scheduled for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.update_sentiment') {
    result['sentiment'] = readString(params['sentiment']) ?? 'neutral'
    result['message'] = `Sentiment update logged for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.flag_compliance_risk') {
    result['riskType'] = readString(params['riskType']) ?? 'general'
    result['severity'] = readString(params['severity']) ?? 'high'
    result['message'] = `Compliance risk flagged for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.mark_as_at_risk') {
    result['lifecycleStage'] = 'at_risk'
    result['status'] = 'warning'
    result['message'] = `${target.label ?? target.externalKey} marked as at risk.`
  } else if (actionName === 'sales_ontology.generate_visit_brief') {
    result['briefType'] = 'auto_generated'
    result['message'] = `Visit brief generated for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.update_access_status') {
    result['accessStatus'] = readString(params['status']) ?? readString(params['accessStatus']) ?? 'pending'
    result['message'] = `Access status update logged for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.dismiss_alert') {
    result['alertStatus'] = 'dismissed'
    result['message'] = `Alert dismissed for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.escalate_alert') {
    result['alertStatus'] = 'escalated'
    result['message'] = `Alert escalated for ${target.label ?? target.externalKey}.`
  } else if (actionName === 'sales_ontology.approve_plan') {
    result['planStatus'] = 'approved'
  } else if (actionName === 'sales_ontology.reject_plan') {
    result['planStatus'] = 'rejected'
    result['reason'] = readString(params['reason'])
  } else if (actionName === 'sales_ontology.update_actual_value') {
    const actualValue = readNumber(params['actualValue']) ?? readNumber(params['actual'])
    const targetValue = readNumber(target.properties['target']) ?? readNumber(target.properties['target_value']) ?? readNumber(params['targetValue'])
    result['actualValue'] = actualValue
    result['achievementRate'] = actualValue !== undefined && targetValue ? Math.round((actualValue / targetValue) * 1000) / 10 : undefined
  } else if (actionName === 'sales_ontology.allocate_budget') {
    const amount = readNumber(params['amount']) ?? 0
    result['amount'] = amount
    result['message'] = `Budget allocation intent logged: ${amount}.`
  } else if (actionName === 'sales_ontology.advance_cycle') {
    const current = readString(target.attributes['lifecycle_stage']) ?? readString(target.properties['lifecycleStage']) ?? 'new'
    const targetStage = readString(params['targetStage']) ?? getValidTransitions(target.objectType, current)[0]
    if (!targetStage || !validateTransition(target.objectType, current, targetStage)) {
      result['success'] = false
      result['message'] = `Cannot transition from ${current} to ${targetStage ?? '(none)'}.`
    } else {
      result['lifecycleStage'] = targetStage
      result['message'] = `Lifecycle advanced to ${targetStage}.`
    }
  } else if (actionName === 'sales_ontology.update_status') {
    result['status'] = readString(params['status']) ?? readString(params['targetStage'])
  } else if (actionName === 'sales_ontology.invite_to_event') {
    result['eventId'] = readString(params['eventId']) ?? readString(params['event'])
    result['message'] = `Event invitation logged for ${target.label ?? target.externalKey}.`
  } else {
    result['message'] = `${actionName} executed by generic Sales Ontology handler.`
  }
  return result
}

function defaultSideEffectsForAction(actionName: string) {
  const map: Record<string, string[]> = {
    'sales_ontology.schedule_visit': ['create VisitRecord', 'update doctor.nextRecommendedVisitDate', 'notify managedBy'],
    'sales_ontology.update_sentiment': ['update doctor.sentiment'],
    'sales_ontology.flag_compliance_risk': ['create ComplianceAlert', 'notify compliance'],
    'sales_ontology.mark_as_at_risk': ['update doctor.lifecycleStage', 'notify managedBy'],
    'sales_ontology.generate_visit_brief': ['create VisitBrief'],
    'sales_ontology.update_access_status': ['update hospital.accessStatus'],
    'sales_ontology.dismiss_alert': ['update alert.status'],
    'sales_ontology.escalate_alert': ['update alert.status', 'notify compliance'],
    'sales_ontology.invite_to_event': ['create ActionItem', 'notify doctor']
  }
  return map[actionName] ?? []
}

function actionSideEffectEntity(target: SalesOntologyObjectSummary, entityType: string, params: Record<string, unknown>): SalesOntologyEntityInput {
  const externalKey = `${entityType}:${target.externalKey}:${Date.now()}`
  return {
    entityTypeCode: entityType === 'ComplianceAlert' || entityType === 'VisitRecord' || entityType === 'VisitBrief' || entityType === 'ActionItem'
      ? 'sales_ontology_event'
      : 'sales_ontology_object',
    externalKey,
    displayName: `${entityType} - ${target.label ?? target.externalKey}`,
    currentStateCode: 'active',
    attributes: {
      event_type: entityType,
      timestamp: new Date().toISOString(),
      description: `${entityType} created by Sales Ontology action executor.`,
      related_object_id: target.externalKey,
      properties: params
    }
  }
}

function buildActionExecutionEntities(target: SalesOntologyObjectSummary, actionName: string, result: Record<string, unknown>) {
  return [
    {
      entityTypeCode: 'sales_ontology_event',
      externalKey: `action:${actionName}:${target.externalKey}:${Date.now()}`,
      displayName: `${actionLabel(actionName)} executed`,
      currentStateCode: result['success'] === false ? 'failed' : 'active',
      attributes: {
        event_type: 'ActionExecuted',
        timestamp: new Date().toISOString(),
        description: String(result['message'] ?? actionName),
        related_object_id: target.externalKey,
        properties: result
      }
    }
  ] satisfies SalesOntologyEntityInput[]
}

function validateTransition(objectType: string | undefined, current: string, target: string) {
  return getValidTransitions(objectType, current).includes(target)
}

function getValidTransitions(objectType: string | undefined, current: string) {
  const defaultTransitions: Record<string, string[]> = {
    new: ['active', 'at_risk'],
    active: ['at_risk', 'completed', 'churned'],
    at_risk: ['active', 'churned', 'failed'],
    normal: ['warning', 'at_risk'],
    warning: ['normal', 'at_risk'],
    failed: ['active'],
    churned: ['reactivated']
  }
  return (objectType ? LIFECYCLE_TRANSITIONS[objectType]?.[current] : undefined) ?? defaultTransitions[current] ?? []
}

function computeMetricStatus(expectedValue: number | undefined, actualValue: number | undefined) {
  if (expectedValue === undefined || actualValue === undefined) return 'unknown'
  return actualValue > expectedValue ? 'exceeded' : actualValue >= expectedValue * 0.8 ? 'met' : 'below'
}

function summarizeEffects(effects: Array<{ status?: string; metricName?: string; actualValue?: number | null; expectedValue?: number | null }>) {
  return {
    total: effects.length,
    byStatus: countBy(effects, (item) => item.status ?? 'unknown'),
    byMetric: countBy(effects, (item) => item.metricName ?? 'unknown'),
    averageActualToExpected:
      average(
        effects
          .map((item) => (typeof item.actualValue === 'number' && typeof item.expectedValue === 'number' && item.expectedValue !== 0 ? item.actualValue / item.expectedValue : undefined))
          .filter((value): value is number => typeof value === 'number')
      ) ?? null
  }
}

function buildLearningRecommendations(
  effectRollup: ReturnType<typeof summarizeEffects>,
  runs: Array<{ runType?: string; status?: string }>
) {
  const recommendations = []
  if ((effectRollup.byStatus['below'] ?? 0) > 0) {
    recommendations.push({ action: 'tighten_action_preconditions', reason: 'Some decisions underperformed expected effects.' })
  }
  if ((effectRollup.byStatus['exceeded'] ?? 0) > 0) {
    recommendations.push({ action: 'reuse_high_effect_playbooks', reason: 'Some decisions exceeded expected effects.' })
  }
  const reasoningRuns = runs.filter((run) => run.runType === 'reasoning').length
  if (reasoningRuns < 3) {
    recommendations.push({ action: 'collect_more_reasoning_runs', reason: 'Learning quality improves with more reasoning/effect pairs.' })
  }
  return recommendations
}

function scopedWhere(scope: SalesOntologyScope, extra: Record<string, unknown> = {}) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? undefined,
    assistantId: scope.assistantId,
    ...extra
  }
}

function summarizeScope(scope: SalesOntologyScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? undefined,
    assistantId: scope.assistantId
  }
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item) || 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item) || 'unknown'
    acc[key] = acc[key] ?? []
    acc[key].push(item)
    return acc
  }, {})
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function daysBetween(from: Date, to: Date) {
  return Math.floor(Math.abs(to.getTime() - from.getTime()) / 86400000)
}

function readDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function readLimit(value: unknown, fallback: number) {
  const limit = readNumber(value) ?? fallback
  return Math.max(1, Math.min(500, Math.floor(limit)))
}

function readPriority(value: unknown): SalesOntologyPriority {
  const priority = readString(value)
  return priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'critical'
    ? priority
    : 'medium'
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function readArrayOfRecords(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
}

function readArrayOfStrings(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value
      .map((item) => readString(item))
      .filter((item): item is string => Boolean(item))
    return values.length ? values : undefined
  }
  const text = readString(value)
  if (!text) {
    return undefined
  }
  const values = text
    .split(/[,\n|]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return values.length ? values : undefined
}

function camelCase(value: string) {
  return value.replace(/[_-]+([a-zA-Z0-9])/g, (_, next: string) => next.toUpperCase())
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

function inputToRecord(input: Record<string, unknown>) {
  return { ...input }
}
