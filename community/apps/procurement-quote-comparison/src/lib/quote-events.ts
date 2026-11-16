import { matchesStoredExtraction } from './quote-extraction.js';
import { Injectable, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { z } from "zod/v3";
import {
  type AgentEventContext,
  type AgentEventPublisher,
  type AgentEventDelivery,
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
import { eventSource, journal, digestSnapshot, QuoteEventParse } from "./event-journal.js";
import type { SaveSupplierQuoteExtractionInput } from "./types.js";

const key = "procurement.quote";
const type = "procurement.quote.revised";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().startsWith(s + "T");
  });
const factSchema = z
  .object({
    caseId: z.string().uuid(),
    series: z.string().uuid(),
    quote: z.string().uuid(),
    revision: z.number().int().positive(),
    digest: z.string(),
    date: z.string().nullable(),
    previous: z
      .object({ revision: z.number(), date: z.string().nullable() })
      .nullable(),
    documentId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    extraction: z.unknown(),
  })
  .strict();

const category = {
  key: "procurement",
  label: { en_US: "Procurement", zh_Hans: "采购事件" },
  icon: { type: "font", value: "package" },
} as const;

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
  ] as const;
  constructor(
    @InjectRepository(ProcurementComparisonCase)
    readonly cases: Repository<ProcurementComparisonCase>
  ) {}
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
    if (await tx.existsBy(QuoteEventParse, { binding: route.binding, documentId, digest })) return true;
    // Old facts identify their own document. Duplicate confirmations had no fact of their own.
    const [prior] = await tx.query(
      `SELECT snapshot->>'documentId'=$2::text AS own FROM plugin_procurement_event_fact
       WHERE binding=$1 AND snapshot->>'digest'=$3 AND (
         snapshot->>'documentId'=$2::text OR (snapshot->>'series'=$4 AND NOT EXISTS (
           SELECT 1 FROM plugin_procurement_event_parse WHERE binding=$1 AND "documentId"=($2::text)::uuid)))
       ORDER BY own DESC LIMIT 1`,
      [route.binding, documentId, digest, quote.eventQuoteSeriesId ?? null]
    );
    if (!prior) return false;
    if (!prior.own) {
      const lines = await tx.findBy(ProcurementQuoteItem, { caseId: c.id, supplierQuoteId: quote.id });
      if (!matchesStoredExtraction(input, quote, lines)) return false;
    }
    await tx.insert(QuoteEventParse, { binding: route.binding, documentId, digest });
    return true;
  }
  async capture(
    tx: EntityManager,
    c: ProcurementComparisonCase,
    input: SaveSupplierQuoteExtractionInput,
    quote: ProcurementSupplierQuote,
    conversationId?: string | null
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
    const [row] = await tx.query(
      `SELECT snapshot FROM plugin_procurement_event_fact WHERE binding=$1
      AND snapshot->>'series'=$2 ORDER BY seq DESC LIMIT 1`,
      [route.binding, series]
    );
    const previous = row ? factSchema.parse(row.snapshot) : null;
    const { caseId, documentId, quoteSeriesId, ...extraction } = input;
    const digest = digestSnapshot(extraction);
    await tx.insert(QuoteEventParse, { binding: route.binding, documentId, digest });
    if (previous?.digest === digest) return;
    const revision = (previous?.revision ?? 0) + 1;
    const origin = z.string().uuid().safeParse(conversationId);
    const snapshot = {
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
    };
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
  }
  async drain(
    ctx: AgentEventContext,
    publisher: AgentEventPublisher,
    limit: number
  ) {
    const accessible = await this.cases.manager.transaction(
      async (tx) => (await this.target(tx, ctx))?.createdById === ctx.userId
    );
    if (!accessible) throw new ForbiddenException("quote_case_owner_required");
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
      let conversation: { conversationId: string } | undefined;
      if (options?.includeConversation) {
        const [fact] = await tx.query(
          `SELECT snapshot->>'conversationId' AS id FROM plugin_procurement_event_fact
           WHERE binding=$1 AND source=$2 AND event->'fact'->>'sha256'=$3`,
          [ctx.bindingId, event.sourceEventId, event.fact.sha256]
        );
        if (fact?.id) conversation = { conversationId: fact.id };
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
  handle(
    ctx: AgentEventContext,
    delivery: AgentEventDelivery
  ): Promise<EventDecision> {
    return this.cases.manager.transaction(async (tx) => {
      const c = await this.target(tx, ctx);
      if (!c || c.createdById !== ctx.userId)
        return { status: "blocked", reasonCode: "case_access_changed" };
      return journal!.decide(tx, ctx, delivery, async (data) => {
        const f = factSchema.parse(data);
        if (f.caseId !== c.id || c.status === "completed")
          return { status: "ignored", reasonCode: "case_closed" };
        if (!f.previous) return { status: "ignored", reasonCode: "baseline" };
        const currentDate = date.safeParse(f.date),
          priorDate = date.safeParse(f.previous.date);
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
              type: "delivery_delay",
              severity: "high",
              title: "报价交期推迟",
              description: f.previous.date + " → " + f.date,
              suggestion: "核对报价修订 " + f.revision,
              status: "pending",
            })
          );
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
    });
  }
}
