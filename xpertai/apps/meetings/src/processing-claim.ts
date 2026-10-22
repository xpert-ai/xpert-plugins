// A durable claim serializes long transcription without holding a workspace lease.
// Every checkpoint verifies the owner in the same short lock that commits it.
import { randomUUID } from "node:crypto";
import { FileStore } from "./file-store.js";
import { MeetingError, type Meeting, type Scope } from "./domain.js";

const claimMs = 15 * 60_000;
export function assertProcessingClaim(current: Meeting, expected: Meeting) {
  if (
    expected.processingClaim &&
    (current.processingClaim?.id !== expected.processingClaim.id ||
      current.processingClaim.expiresAt <= Date.now())
  )
    throw new MeetingError("processing_claim_lost");
}

export async function withProcessingClaim<T>(
  store: FileStore,
  scope: Scope,
  id: string,
  action: (guarded: FileStore) => Promise<T>
) {
  const claim = { id: randomUUID(), expiresAt: Date.now() + claimMs };
  const acquired = await store.update(scope, id, (m) => {
    if (m.processingClaim && m.processingClaim.expiresAt > Date.now())
      throw new MeetingError("processing_busy");
    m.processingClaim = claim;
  });
  const guard = (m: Meeting) => assertProcessingClaim(m, acquired);
  class ClaimedStore extends FileStore {
    override async read(...args: Parameters<FileStore["read"]>) {
      const m = await store.read(...args);
      guard(m);
      return m;
    }
    override async update(...args: Parameters<FileStore["update"]>) {
      const [actor, meetingId, change] = args;
      return store.update(actor, meetingId, async (m, dir) => {
        guard(m);
        await change(m, dir);
        guard(m);
        m.processingClaim = { ...claim, expiresAt: Date.now() + claimMs };
      });
    }
  }
  try {
    return await action(new ClaimedStore(store.storage, store.projection));
  } finally {
    // Losing workers must not release a successor's claim or change its status.
    try {
      await store.update(scope, id, (m) => {
        if (m.processingClaim?.id !== claim.id)
          throw new MeetingError("processing_claim_lost");
        m.processingClaim = null;
      });
    } catch (error) {
      if (
        !(
          error instanceof MeetingError &&
          ["processing_claim_lost", "meeting_not_found"].includes(error.code)
        )
      )
        throw error;
    }
  }
}
