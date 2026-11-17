import { Button, Input, Label } from "@xpert-ai/plugin-shadcn-ui";
import { t, formatTime } from "../i18n";
import type { Round } from "../types";
import { Section, Status } from "./Shared";
export function CollectionPanel({
  rounds,
  busy,
  failure,
  setFailure,
  onCollect,
  onAnalyze,
  onResume,
  onRefresh,
}: {
  rounds: Round[];
  busy: boolean;
  failure: string;
  setFailure: (value: string) => void;
  onCollect: (roundId?: string) => void;
  onAnalyze: (id: string) => void;
  onResume: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <Section
      title={t("rounds")}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onRefresh}>
            {t("action.refresh")}
          </Button>
          <Button disabled={busy} onClick={() => onCollect()}>
            {t("action.run")}
          </Button>
        </>
      }
    >
      <Label htmlFor="failure-id">{t("field.failure")}</Label>
      <Input
        id="failure-id"
        value={failure}
        onChange={(e) => setFailure(e.target.value)}
      />
      <div className="record-list">
        {rounds.map((round) => (
          <article className="record-row" key={round.id}>
            <div className="record-copy">
              <strong>{formatTime(round.startedAt)}</strong>
              <p>{t("time.zone")}</p>
              <Status value={round.status} />
              <p>
                {t("field.roundId")}: {round.id}
              </p>
              {round.errorReason && <p role="alert">{round.errorReason}</p>}
            </div>
            {["success", "partial"].includes(round.status) ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onAnalyze(round.id)}
              >
                {t("action.analyze")}
              </Button>
            ) : round.status === "failed" ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onCollect(round.id)}
              >
                {t("action.retry")}
              </Button>
            ) : round.status === "paused" ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onResume(round.id)}
              >
                {t("action.resume")}
              </Button>
            ) : null}
          </article>
        ))}
        {!rounds.length && <p>{t("empty.rounds")}</p>}
      </div>
    </Section>
  );
}
