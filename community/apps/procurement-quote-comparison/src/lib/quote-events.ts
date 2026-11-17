import { DelayDecision } from './entities/delay-decision.entity.js'
import { delayDecided, requestDelayDecision } from './delivery-decision.js'
import { withDecisionOutput } from './delivery-decision-output.js'
import { deliveryCheckOutput } from './delivery-check-output.js'
import { quoteFact as factSchema } from './delivery-check.js'
import { matchesStoredExtraction } from "./quote-extraction.js";
import { Injectable, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { z } from "zod/v3";
import {
  type AgentEventContext,
  type AgentEventPublisher,
  type AgentEventDelivery,
  type AgentEventFollowUp,
  type AgentEventPresentation,
  type EventDecision,
  type PluginAgentEventSource,
} from "@xpert-ai/plugin-sdk";
import {
  ProcurementComparisonCase,
  ProcurementQuoteItem,
  ProcurementRiskItem,
  ProcurementSourceDocument,
  ProcurementSupplierQuote,
} from "./entities/index.js";
import {
  eventSource,
  journal,
  digestSnapshot,
  QuoteEventParse,
  QuoteRevisionContext,
} from "./event-journal.js";
import type { SaveSupplierQuoteExtractionInput } from "./types.js";

import {
  captureDue,
  decideDue,
  dueType,
  QuoteFollowUp,
} from "./quote-follow-up.js";
const key = "procurement.quote";
const type = "procurement.quote.revised";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().startsWith(s + "T");
  });
const category = {
  key: "procurement",
  label: { en_US: "Procurement", zh_Hans: "采购事件" },
  icon: { type: "font", value: "package" },
} as const;

// Appending a revision only needs the preceding revision, extraction digest and date.
// Read that projection independently of the full payload contract used to publish and handle events.
const priorQuoteFields = factSchema.pick({ revision: true, digest: true, date: true }).strip()
type PriorQuote = { seq: string; snapshot: unknown; baseline: string | null }
const quoteHistory = `SELECT f.seq, f.snapshot, to_char(q.baseline, 'YYYY-MM-DD') AS baseline FROM plugin_procurement_event_fact f
  LEFT JOIN plugin_procurement_quote_context q USING (binding, source)
  WHERE f.binding=$1 AND f.event->>'type'='procurement.quote.revised' AND f.event->>'schemaVersion'='1'
    AND f.snapshot->>'series'=$2`

// A missing or unparseable date supersedes the old request, but cannot establish a new commitment.
// A series may have started before decisions were enabled. Look for its last verified commitment.
async function commitmentBefore(tx: EntityManager, binding: string, series: string, latest: PriorQuote) {
  let page = [latest]
  while (page.length) {
    for (const row of page) {
      const fact = priorQuoteFields.parse(row.snapshot)
      const baseline = date.safeParse(row.baseline)
      const quoted = date.safeParse(fact.date)
      if (baseline.success && (!quoted.success || baseline.data < quoted.data)) return baseline.data
      if (quoted.success) return quoted.data
    }
    page = await tx.query<PriorQuote[]>(quoteHistory + ' AND f.seq < $3 ORDER BY f.seq DESC LIMIT 32',
      [binding, series, page[page.length - 1].seq])
  }
  return null
}

@Injectable()
@eventSource(key)
export class QuoteEvents implements PluginAgentEventSource {
  readonly key = key;
  readonly protocolVersion = 1;
  readonly eventTypes = [
    {
      type: type,
      schemaVersion: 1,
      display: {
        category,
        label: { en_US: "Quote revision", zh_Hans: "报价修订" },
        icon: { type: "font", value: "clipboard-list" },
      },
    },
    {
      type: dueType,
      schemaVersion: 1,
      display: {
        category,
        label: { en_US: "Follow-up due", zh_Hans: "采购跟进到期" },
        icon: { type: "font", value: "clock" },
      },
    },
    {
      type: delayDecided, schemaVersion: 1,
      display: { category, label: { en_US: 'Buyer decision', zh_Hans: '采购人决定' }, icon: { type: 'font', value: 'clipboard-check' } }
    }
  ] as const;
  constructor(
    @InjectRepository(ProcurementComparisonCase)
    readonly cases: Repository<ProcurementComparisonCase>
  ) {}
  get outputs() { return withDecisionOutput(this.cases, deliveryCheckOutput(this.cases)) }
  private target(tx: EntityManager, ctx: AgentEventContext) {
    return tx.findOne(ProcurementComparisonCase, {
      where: {
        id: ctx.sourceBindingRef,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        xpertId: ctx.xpertId,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId ?? IsNull(),
      },
      lock: { mode: "pessimistic_write" },
    });
  }
  async configure(ctx: AgentEventContext, enabled: boolean) {
    await this.cases.manager.transaction(async (tx) => {
      const c = await this.target(tx, ctx);
      if (!c || c.createdById !== ctx.userId)
        throw new ForbiddenException("quote_case_owner_required");
      await journal!.configure(tx, ctx, enabled);
      await tx.getRepository(DelayDecision).createQueryBuilder().update().set({state:'closed',version:()=> 'version + 1'})
        .where('binding=:binding AND state=:state AND ("bindingRevision"<>:revision OR :enabled=false)',
          {binding:ctx.bindingId,state:'pending',revision:ctx.bindingRevision,enabled}).execute()
      await tx
        .getRepository(QuoteFollowUp)
        .createQueryBuilder()
        .update()
        .set({ state: "superseded", version: () => "version + 1" })
        .where(
          'binding = :binding AND state IN (:...states) AND ("bindingRevision" <> :revision OR :enabled = false)',
          {
            binding: ctx.bindingId,
            revision: ctx.bindingRevision,
            enabled,
            states: ["waiting", "captured"],
          }
        )
        .execute();
    });
  }
  async previouslyParsed(
    tx: EntityManager,
    c: ProcurementComparisonCase,
    input: SaveSupplierQuoteExtractionInput,
    quote: ProcurementSupplierQuote
  ) {
    if (!journal || !c.organizationId || !input.documentId) return false;
    const route = await journal.route(tx, {
      tenantId: c.tenantId,
      organizationId: c.organizationId,
      ref: c.id,
    });
    if (!route?.enabled) return false;
    if (
      input.quoteSeriesId &&
      quote.eventQuoteSeriesId &&
      input.quoteSeriesId !== quote.eventQuoteSeriesId
    )
      throw new Error("quote_series_mismatch");
    const { caseId, documentId, quoteSeriesId, ...extraction } = input;
    const digest = digestSnapshot(extraction);
    if (
      await tx.existsBy(QuoteEventParse, {
        binding: route.binding,
        documentId,
        digest,
      })
    )
      return true;
    // Old facts identify their own document. Duplicate confirmations had no fact of their own.
    const [prior] = await tx.query(
      `SELECT snapshot->>'documentId'=$2::text AS own FROM plugin_procurement_event_fact
       WHERE binding=$1 AND event->>'type'='procurement.quote.revised' AND event->>'schemaVersion'='1' AND snapshot->>'digest'=$3 AND (
         snapshot->>'documentId'=$2::text OR (snapshot->>'series'=$4 AND NOT EXISTS (
           SELECT 1 FROM plugin_procurement_event_parse WHERE binding=$1 AND "documentId"=($2::text)::uuid)))
       ORDER BY own DESC LIMIT 1`,
      [route.binding, documentId, digest, quote.eventQuoteSeriesId ?? null]
    );
    if (!prior) return false;
    if (!prior.own) {
      const lines = await tx.findBy(ProcurementQuoteItem, {
        caseId: c.id,
        supplierQuoteId: quote.id,
      });
      if (!matchesStoredExtraction(input, quote, lines)) return false;
    }
    await tx.insert(QuoteEventParse, {
      binding: route.binding,
      documentId,
      digest,
    });
    return true;
  }
  async capture(
    tx: EntityManager,
    c: ProcurementComparisonCase,
    input: SaveSupplierQuoteExtractionInput,
    quote: ProcurementSupplierQuote,
    conversationId?: string | null,
    threadId?: string | null
  ) {
    if (!journal || !c.organizationId || !c.id || !quote.id) return;
    const route = await journal.route(tx, {
      tenantId: c.tenantId,
      organizationId: c.organizationId,
      ref: c.id,
    });
    if (!route?.enabled) return;
    if (!input.documentId) return;
    if (
      !(await tx.existsBy(ProcurementSourceDocument, {
        id: input.documentId,
        caseId: c.id,
        tenantId: c.tenantId,
        organizationId: c.organizationId,
        role: "supplier_quote",
      }))
    )
      throw new Error("quote_document_mismatch");
    const series = quote.eventQuoteSeriesId ?? input.quoteSeriesId ?? quote.id;
    if (
      series !== quote.id &&
      !(await tx.existsBy(ProcurementSupplierQuote, {
        id: series,
        caseId: c.id,
        tenantId: c.tenantId,
        organizationId: c.organizationId,
      }))
    )
      throw new Error("quote_series_mismatch");
    if (!quote.eventQuoteSeriesId) {
      await tx.update(
        ProcurementSupplierQuote,
        { id: quote.id },
        { eventQuoteSeriesId: series }
      );
      quote.eventQuoteSeriesId = series;
    }
    const [row] = await tx.query<PriorQuote[]>(
      quoteHistory + ' ORDER BY f.seq DESC LIMIT 1',
      [route.binding, series]
    );
    const previous = row ? priorQuoteFields.parse(row.snapshot) : null;
    const { caseId, documentId, quoteSeriesId, ...extraction } = input;
    const digest = digestSnapshot(extraction);
    await tx.insert(QuoteEventParse, {
      binding: route.binding,
      documentId,
      digest,
    });
    if (previous?.digest === digest) return;
    const revision = (previous?.revision ?? 0) + 1;
    const origin = z.string().uuid().safeParse(conversationId);
    const baseline = c.delayDecisionsEnabled && row ? await commitmentBefore(tx, route.binding, series, row) : null;
    const snapshot = factSchema.parse({
      caseId: c.id,
      documentId,
      series,
      quote: quote.id,
      revision,
      digest,
      extraction,
      ...(origin.success ? { conversationId: origin.data } : {}),
      date: input.deliveryTime?.trim() ?? null,
      previous: previous
        ? { revision: previous.revision, date: previous.date }
        : null,
    });
    if (previous) await tx.update(DelayDecision, { binding: route.binding, series, state: "pending" },
      { state: "superseded", version: () => "version + 1" });
    if (previous)
      await tx
        .getRepository(QuoteFollowUp)
        .createQueryBuilder()
        .update()
        .set({ state: "superseded", version: () => "version + 1" })
        .where(
          'binding = :binding AND "quoteSource" = :source AND state IN (:...states)',
          {
            binding: route.binding,
            source: series + "/" + previous.revision,
            states: ["waiting", "captured", "fired"],
          }
        )
        .execute();
    const id = series + "/" + revision;
    await journal.capture(
      tx,
      route,
      {
        sourceEventId: id,
        type,
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        subject: { kind: "comparison-case", key: c.id },
      },
      snapshot,
      id,
      String(revision)
    );
    const originThread = origin.success ? z.string().min(1).max(100).safeParse(threadId) : null;
    if (baseline || originThread?.success)
      await tx.insert(QuoteRevisionContext, {
        binding: route.binding, source: id, baseline, threadId: originThread?.success ? originThread.data : null
      });
  }
  async drain(
    ctx: AgentEventContext,
    publisher: AgentEventPublisher,
    limit: number
  ) {
    await this.cases.manager.transaction(async (tx) => {
      const c = await this.target(tx, ctx);
      if (!c || c.createdById !== ctx.userId)
        throw new ForbiddenException("quote_case_owner_required");
      if (c.status === "completed") {
        await tx
          .getRepository(QuoteFollowUp)
          .createQueryBuilder()
          .update()
          .set({ state: "superseded", version: () => "version + 1" })
          .where("binding = :binding AND state IN (:...states)", {
            binding: ctx.bindingId,
            states: ["waiting", "captured"],
          })
          .execute();
      } else {
        await captureDue(tx, ctx, limit);
      }
    });
    return journal!.drain(this.cases.manager, ctx, publisher, limit);
  }
  async searchTitles(ctx: AgentEventContext, term: string) {
    return this.cases.manager.transaction(async (tx) => {
      const c = await this.target(tx, ctx);
      if (!c || c.createdById !== ctx.userId) return [];
      const risks = await tx
        .createQueryBuilder(ProcurementRiskItem, "r")
        .select("r.id", "id")
        .where({
          caseId: c.id,
          tenantId: ctx.tenantId,
          organizationId: ctx.organizationId,
        })
        .andWhere("strpos(lower(r.title),lower(:term)) > 0", { term })
        .getRawMany<{ id: string }>();
      return [
        ...(c.title.toLowerCase().includes(term.toLowerCase())
          ? [{ subject: c.id }]
          : []),
        ...risks.map((r) => ({
          result: { kind: "procurement-risk", key: r.id },
        })),
      ];
    });
  }
  async describe(
    ctx: AgentEventContext,
    event: AgentEventDelivery["event"],
    decision: EventDecision | null,
    options?: { includeConversation: boolean }
  ) {
    return this.cases.manager.transaction(async (tx) => {
      const c = await this.target(tx, ctx);
      if (!c || c.createdById !== ctx.userId || event.subject.key !== c.id)
        return null;
      let conversation: AgentEventPresentation["conversation"];
      if (options?.includeConversation) {
        const [fact] = await tx.query(
          `SELECT snapshot->>'conversationId' AS id, CASE WHEN event->>'type'=$4 THEN q."threadId" ELSE snapshot->>'threadId' END AS thread
           FROM plugin_procurement_event_fact LEFT JOIN plugin_procurement_quote_context q USING (binding, source)
           WHERE binding=$1 AND source=$2 AND event->'fact'->>'sha256'=$3`,
          [ctx.bindingId, event.sourceEventId, event.fact.sha256, type]
        );
        if (fact?.id) conversation = { conversationId: fact.id, ...(fact.thread ? { threadId: fact.thread } : {}) };
      }
      if (
        event.type === dueType &&
        decision?.status === "handled" &&
        decision.resultRef.kind === "procurement-follow-up"
      ) {
        const risk = await tx.findOneBy(ProcurementRiskItem, {
          id: decision.resultRef.key,
          caseId: c.id,
        });
        const [reminder] = await tx.query<{id: string; revision: number}[]>(
          `SELECT d.id, d.revision FROM plugin_procurement_event_fact f
           JOIN plugin_procurement_delivery_check_receipt a ON a."receiptId"=f.receipt
           JOIN plugin_procurement_delivery_check d ON d.id=a."checkId"
           WHERE f.binding=$1 AND f.source=$2 AND f.event->'fact'->>'sha256'=$3
           AND d."caseId"=$4 AND d."riskId"=$5 AND d."tenantId"=$6 AND d."organizationId"=$7 AND d."publishedFor"=$8`,
          [ctx.bindingId, event.sourceEventId, event.fact.sha256, c.id, decision.resultRef.key, ctx.tenantId, ctx.organizationId, ctx.userId]
        )
        return {
          title: risk?.title ?? c.title,
          conversation,
          fields: [
            {
              label: { en_US: "Risk", zh_Hans: "风险" },
              value: decision.resultRef.key,
            },
          ],
          result: risk ? {
            action: {en_US: "View risk", zh_Hans: "查看风险"},
            fields: [
              {label:{en_US:"Severity",zh_Hans:"风险等级"},value:risk.severity},
              {label:{en_US:"Delivery change",zh_Hans:"交期变更"},value:risk.description},
              ...(reminder ? [
                {label:{en_US:"Workbench reminder",zh_Hans:"工作台提醒"},value:reminder.id},
                {label:{en_US:"Quote revision",zh_Hans:"报价修订"},value:String(reminder.revision)}
              ] : [])
            ]
          } : undefined
        };
      }
      if (
        decision?.status !== "handled" ||
        decision.resultRef?.kind !== "procurement-risk"
      )
        return { title: c.title, conversation };
      const risk = await tx.findOneBy(ProcurementRiskItem, {
        id: decision.resultRef.key,
        caseId: c.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        eventOperationKey: decision.operationKey,
      });
      return risk
        ? {
            title: risk.title,
            conversation,
            fields: [
              { label: { en_US: "Case", zh_Hans: "采购案例" }, value: c.title },
              {
                label: { en_US: "Delivery change", zh_Hans: "交期变更" },
                value: risk.description,
              },
            ],
            result: {
              action: { en_US: "View risk", zh_Hans: "查看风险" },
              fields: [
                {
                  label: { en_US: "Severity", zh_Hans: "风险等级" },
                  value: risk.severity,
                },
                ...(risk.suggestion
                  ? [
                      {
                        label: {
                          en_US: "Suggested action",
                          zh_Hans: "建议措施",
                        },
                        value: risk.suggestion,
                      },
                    ]
                  : []),
                {
                  label: { en_US: "Risk ID", zh_Hans: "风险 ID" },
                  value: risk.id,
                },
              ],
            },
          }
        : null;
    });
  }
  async handle(
    ctx: AgentEventContext,
    delivery: AgentEventDelivery,
    followUp?: AgentEventFollowUp
  ): Promise<EventDecision> {
    if (delivery.event.type === dueType && !followUp)
      throw new Error("agent_follow_up_host_required");
    const decision = await this.cases.manager.transaction<EventDecision>(
      async (tx) => {
        const c = await this.target(tx, ctx);
        if (!c || c.createdById !== ctx.userId)
          return { status: "blocked", reasonCode: "case_access_changed" };
        return journal!.decide(tx, ctx, delivery, async (data) => {
          if (delivery.event.type === dueType)
            return decideDue(tx, ctx, delivery, c, data);
          if (delivery.event.type === delayDecided) {
            const fact = z.object({caseId: z.string().uuid(), requestId: z.string().uuid(), decisionId: z.string().uuid()}).parse(data)
            const row = await tx.findOneBy(DelayDecision, { id: fact.requestId, caseId: c.id, binding: ctx.bindingId,
              buyerId: ctx.userId, decisionId: fact.decisionId })
            if (!row || c.status === 'completed') return {status:'blocked',reasonCode:'case_access_changed'}
            return {status:'handled',operationKey:'decision/' + fact.decisionId, resultRef:{kind:'procurement-decision',key:row.id}}
          }
          const f = factSchema.parse(data);
          if (f.caseId !== c.id || c.status === "completed")
            return { status: "ignored", reasonCode: "case_closed" };
          if (!f.previous) return { status: "ignored", reasonCode: "baseline" };
          const context = await tx.findOneBy(QuoteRevisionContext, { binding: ctx.bindingId, source: delivery.event.sourceEventId });
          const baseline = context?.baseline;
          const currentDate = date.safeParse(f.date),
            priorDate = date.safeParse(baseline ?? f.previous.date);
          if (!currentDate.success || !priorDate.success)
            return { status: "blocked", reasonCode: "delivery_date_unclear" };
          if (currentDate.data <= priorDate.data)
            return { status: "ignored", reasonCode: "no_delay" };
          const operationKey = [
            f.caseId,
            f.series,
            f.previous.revision,
            f.revision,
            "delivery_delay_v1",
          ].join("/");
          let risk = await tx.findOneBy(ProcurementRiskItem, {
            eventOperationKey: operationKey,
          });
          if (!risk)
            risk = await tx.save(
              ProcurementRiskItem,
              tx.create(ProcurementRiskItem, {
                tenantId: c.tenantId,
                organizationId: c.organizationId,
                workspaceId: c.workspaceId,
                projectId: c.projectId,
                caseId: f.caseId,
                supplierQuoteId: f.quote,
                eventOperationKey: operationKey,
                deliveryCheckVersion: 1,
                type: "delivery_delay",
                severity: "high",
                title: "报价交期推迟",
                description: priorDate.data + " → " + currentDate.data,
                suggestion: "核对报价修订 " + f.revision,
                status: "pending",
              })
            );
          if (c.delayDecisionsEnabled && baseline) {
            await requestDelayDecision(tx, ctx, delivery, risk.id!, f, baseline, currentDate.data, context?.threadId ?? null);
          }
          await tx.update(
            ProcurementComparisonCase,
            { id: c.id },
            {
              riskCount: await tx.countBy(ProcurementRiskItem, {
                caseId: f.caseId,
              }),
            }
          );
          return {
            status: "handled",
            operationKey,
            resultRef: { kind: "procurement-risk", key: risk.id! },
          };
        });
      }
    );
    if (delivery.event.type === delayDecided && decision.status === 'handled') {
      const row = await this.cases.manager.findOneByOrFail(DelayDecision, { id:decision.resultRef.key,
        tenantId:ctx.tenantId, organizationId:ctx.organizationId, caseId:ctx.sourceBindingRef, buyerId:ctx.userId, binding:ctx.bindingId })
      if (row.conversationId) {
        if (!followUp) throw new Error('agent_follow_up_host_required')
        await followUp.wake({conversationId:row.conversationId, threadId:row.threadId ?? undefined,
          prompt:`The buyer's recorded disposition for quote revision ${row.revision} is ${row.state}. Report this result in the original case. No further approval or supplier contact is requested.`})
      }
    }
    if (delivery.event.type === dueType && decision.status === "handled") {
      // The journal decision wins the expiry/edit race. Retry the same immutable wake even if the next turn already rearmed.
      const [timer] = await this.cases.query(
        `SELECT snapshot->>'conversationId' AS "conversationId", snapshot->>'threadId' AS "threadId",
        snapshot->>'agentKey' AS "agentKey", snapshot->>'caseId' AS "caseId", snapshot->>'riskId' AS "riskId" FROM plugin_procurement_event_fact
        WHERE binding=$1 AND source=$2 AND event->'fact'->>'sha256'=$3`,
        [
          ctx.bindingId,
          delivery.event.sourceEventId,
          delivery.event.fact.sha256,
        ]
      );
      if (!timer) throw new Error("follow_up_fact_missing");
      await followUp!.wake({
        conversationId: timer.conversationId,
        threadId: timer.threadId ?? undefined,
        agentKey: timer.agentKey ?? undefined,
        prompt: `Your procurement follow-up is due. Use procurement_follow_up(action="inspect", caseId="${timer.caseId}", riskId="${timer.riskId}") and read the latest reply and case state. If cancelled or answered, finish quietly. For an outstanding supplier reply, publish_check with expectedQuoteRevision from inspect only if workbenchPublication is unpublished. If already published or unknown, do not repeat it. Set a further deadline only when justified.`,
      });
      // Edits change the business state. Only the matching committed wake can report admission.
      await this.cases.manager.update(QuoteFollowUp,
        { riskId: timer.riskId, binding: ctx.bindingId, wakeReceiptId: delivery.receiptId, wakeStatus: "queued" },
        { wakeStatus: "started" }
      );
    }
    return decision;
  }
}
