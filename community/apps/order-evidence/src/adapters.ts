import { Injectable } from "@nestjs/common";
import {
  ProjectPipelineRuntimeAdapterProvider as Adapter,
  type ProjectPipelineContext,
  type ProjectPipelineOperationContext,
  type ProjectPipelineAssistantContext,
} from "@xpert-ai/plugin-sdk";
import type {
  ProjectPipelineEvidenceRef,
  ProjectPipelineSubjectVersion,
} from "@xpert-ai/contracts";
import { OrderService } from "./service.js";
import { checkRef } from "./routing.js";
import { refs, operationRef } from "./definition.js";
import { resultSchema } from "./model.js";
@Injectable()
@Adapter("schema", refs.result)
export class OrderSchema {
  readonly kind = "schema";
  readonly ref = refs.result;
  parse(value: unknown) {
    return resultSchema.parse(value);
  }
}
@Injectable()
@Adapter("subject", refs.subject)
export class OrderSubject {
  readonly kind = "subject";
  readonly ref = refs.subject;
  constructor(private readonly service: OrderService) {}
  resolve(c: ProjectPipelineContext, id: string) {
    return this.service.subject(c, id);
  }
  checkCurrent(c: ProjectPipelineContext, v: ProjectPipelineSubjectVersion) {
    return this.service.current(c, v);
  }
  resolveEntry(c: ProjectPipelineContext, id: string) {
    return this.service.entry(c, id);
  }
}
@Injectable()
@Adapter("evidence", refs.evidence)
export class OrderEvidenceAdapter {
  readonly kind = "evidence";
  readonly ref = refs.evidence;
  constructor(private readonly service: OrderService) {}
  read(c: ProjectPipelineContext, ref: ProjectPipelineEvidenceRef) {
    return this.service.evidence(c, ref);
  }
}
@Injectable()
@Adapter("policy", refs.route)
export class OrderRouter {
  readonly kind = "policy";
  readonly ref = refs.route;
  constructor(private readonly service: OrderService) {}
  evaluate(c: ProjectPipelineOperationContext) {
    return this.service.route(c);
  }
}
@Injectable()
@Adapter("policy", refs.approval)
export class OrderApproval {
  readonly kind = "policy";
  readonly ref = refs.approval;
  constructor(private readonly service: OrderService) {}
  async evaluate() {
    return { status: "blocked" as const, code: "human_decision_required" };
  }
  authorizeDecision(
    c: ProjectPipelineOperationContext,
    i: { candidateSelectionKey: string; outcome: string },
  ) {
    return this.service.authorize(c, i.candidateSelectionKey, i.outcome);
  }
}
@Injectable()
@Adapter("operation", refs.decision)
export class OrderDecision {
  readonly kind = "operation";
  readonly ref = refs.decision;
  constructor(private readonly service: OrderService) {}
  execute(c: ProjectPipelineOperationContext) {
    return this.service.decision(c, true);
  }
  inspect(c: ProjectPipelineOperationContext) {
    return this.service.decision(c, false);
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("contract"))
export class OrderContract {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("contract");
  constructor(private readonly service: OrderService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "contract");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "contract");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("engineering"))
export class OrderEngineering {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("engineering");
  constructor(private readonly service: OrderService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "engineering");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "engineering");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("procurement"))
export class OrderProcurement {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("procurement");
  constructor(private readonly service: OrderService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "procurement");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "procurement");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("production"))
export class OrderProduction {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("production");
  constructor(private readonly service: OrderService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "production");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "production");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("quality"))
export class OrderQuality {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("quality");
  constructor(private readonly service: OrderService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "quality");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "quality");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("aftercare"))
export class OrderAftercare {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("aftercare");
  constructor(private readonly service: OrderService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "aftercare");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "aftercare");
  }
}
@Injectable()
@Adapter("policy", checkRef("contract"))
export class RequirementsRouter {
  readonly kind = "policy";
  readonly ref = checkRef("contract");
  constructor(private readonly service: OrderService) {}
  evaluate(c: ProjectPipelineOperationContext) {
    return this.service.businessRoute(c, "contract");
  }
}
@Injectable()
@Adapter("policy", checkRef("procurement"))
export class SupplyRouter {
  readonly kind = "policy";
  readonly ref = checkRef("procurement");
  constructor(private readonly service: OrderService) {}
  evaluate(c: ProjectPipelineOperationContext) {
    return this.service.businessRoute(c, "procurement");
  }
}
@Injectable()
@Adapter("policy", checkRef("quality"))
export class QualityRouter {
  readonly kind = "policy";
  readonly ref = checkRef("quality");
  constructor(private readonly service: OrderService) {}
  evaluate(c: ProjectPipelineOperationContext) {
    return this.service.businessRoute(c, "quality");
  }
}
export const ADAPTERS = [
  RequirementsRouter,
  SupplyRouter,
  QualityRouter,
  OrderSchema,
  OrderSubject,
  OrderEvidenceAdapter,
  OrderRouter,
  OrderApproval,
  OrderDecision,
  OrderContract,
  OrderEngineering,
  OrderProcurement,
  OrderProduction,
  OrderQuality,
  OrderAftercare,
];
