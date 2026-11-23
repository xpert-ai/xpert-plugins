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
import { MarginService } from "./service.js";
import { refs, operationRef } from "./definition.js";
import { resultSchema } from "./model.js";
@Injectable()
@Adapter("schema", refs.result)
export class MarginSchema {
  readonly kind = "schema";
  readonly ref = refs.result;
  parse(value: unknown) {
    return resultSchema.parse(value);
  }
}
@Injectable()
@Adapter("subject", refs.subject)
export class MarginSubject {
  readonly kind = "subject";
  readonly ref = refs.subject;
  constructor(private readonly service: MarginService) {}
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
export class MarginEvidenceAdapter {
  readonly kind = "evidence";
  readonly ref = refs.evidence;
  constructor(private readonly service: MarginService) {}
  read(c: ProjectPipelineContext, ref: ProjectPipelineEvidenceRef) {
    return this.service.evidence(c, ref);
  }
}
@Injectable()
@Adapter("policy", refs.route)
export class MarginRouter {
  readonly kind = "policy";
  readonly ref = refs.route;
  constructor(private readonly service: MarginService) {}
  evaluate(c: ProjectPipelineOperationContext) {
    return this.service.route(c);
  }
}
@Injectable()
@Adapter("policy", refs.approval)
export class MarginApproval {
  readonly kind = "policy";
  readonly ref = refs.approval;
  constructor(private readonly service: MarginService) {}
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
export class MarginDecision {
  readonly kind = "operation";
  readonly ref = refs.decision;
  constructor(private readonly service: MarginService) {}
  execute(c: ProjectPipelineOperationContext) {
    return this.service.decision(c, true);
  }
  inspect(c: ProjectPipelineOperationContext) {
    return this.service.decision(c, false);
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("discover"))
export class MarginDiscover {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("discover");
  constructor(private readonly service: MarginService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "discover");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "discover");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("verify"))
export class MarginVerify {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("verify");
  constructor(private readonly service: MarginService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "verify");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "verify");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("propose"))
export class MarginPropose {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("propose");
  constructor(private readonly service: MarginService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "propose");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "propose");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("execute"))
export class MarginExecute {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("execute");
  constructor(private readonly service: MarginService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "execute");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "execute");
  }
}
@Injectable()
@Adapter("assistant_operation", operationRef("review"))
export class MarginReview {
  readonly kind = "assistant_operation";
  readonly ref = operationRef("review");
  constructor(private readonly service: MarginService) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.service.prepare(c, "review");
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.service.collect(c, "review");
  }
}
export const ADAPTERS = [
  MarginSchema,
  MarginSubject,
  MarginEvidenceAdapter,
  MarginRouter,
  MarginApproval,
  MarginDecision,
  MarginDiscover,
  MarginVerify,
  MarginPropose,
  MarginExecute,
  MarginReview,
];
