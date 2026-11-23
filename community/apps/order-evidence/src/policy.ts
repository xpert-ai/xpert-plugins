import { ConflictException, ForbiddenException } from "@nestjs/common";
import { STEPS, type Step } from "./definition.js";
import { documentsFor, type Snapshot } from "./fixture.js";
import type { Result } from "./model.js";
export type PriorEvidence = Result & { evidenceId: string; digest: string };
export function validateStageEvidence(
  step: Step,
  snapshot: Snapshot,
  ids: string[],
  previous: PriorEvidence[],
) {
  const sources = documentsFor(snapshot, step).map((d) => d.id);
  const allowed = [...sources, ...previous.map((p) => p.evidenceId)];
  if (ids.some((id) => !allowed.includes(id)))
    throw new ConflictException("unknown_evidence");
  if (!sources.every((id) => ids.includes(id)))
    throw new ConflictException("all_stage_source_evidence_required");
  const predecessor = STEPS[STEPS.findIndex((s) => s.key === step) - 1];
  if (predecessor) {
    const proposal = previous.find((p) => p.nodeKey === predecessor.key);
    const approval = previous.find(
      (p) => p.nodeKey === `approve-${predecessor.key}` && p.approved,
    );
    if (!proposal || !approval || approval.proposalDigest !== proposal.digest)
      throw new ForbiddenException("exact_predecessor_human_approval_required");
  }
}
