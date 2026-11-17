import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@xpert-ai/plugin-shadcn-ui";
import { i18n, t, formatTime } from "../i18n";
import type { Dataset, Action } from "../types";
import { Section, Status, Choice } from "./Shared";
export function AdvicePanel({
  data,
  selectedRound,
  setRound,
  busy,
  action,
  onAnalyze,
  onError,
}: {
  data: Dataset;
  selectedRound: string;
  setRound: (id: string) => void;
  busy: boolean;
  action: Action;
  onAnalyze: (id: string) => void;
  onError: (error: Error) => void;
}) {
  const [tab, setTab] = useState("all");
  const round =
    selectedRound === "latest"
      ? data.rounds[0]
      : data.rounds.find((r) => r.id === selectedRound);
  const changes = data.changes.filter((c) => c.roundId === round?.id);
  const itemIds = [...new Set(changes.map((c) => c.itemId))];
  const visibleIds = itemIds.filter(
    (id) =>
      tab === "all" ||
      data.advice.some(
        (a) =>
          changes.some((c) => c.itemId === id && c.id === a.changeId) &&
          (tab === "pending" ? a.status === "pending" : a.status !== "pending"),
      ),
  );
  return (
    <Section
      title={t("changes")}
      actions={
        <Choice
          label={t("rounds")}
          value={selectedRound}
          onChange={setRound}
          options={[
            { value: "latest", label: t("latest") },
            ...data.rounds.map((r) => ({
              value: r.id,
              label: formatTime(r.startedAt),
            })),
          ]}
        />
      }
    >
      <div className="actions spread">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">{t("all")}</TabsTrigger>
            <TabsTrigger value="pending">{t("pending")}</TabsTrigger>
            <TabsTrigger value="reviewed">{t("reviewed")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {round && ["success", "partial"].includes(round.status) && (
          <Button disabled={busy} onClick={() => onAnalyze(round.id)}>
            {t("action.analyze")}
          </Button>
        )}
      </div>
      <p>{t("summary", { count: changes.length })}</p>
      <div className="stack">
        {visibleIds.map((itemId) => {
          const list = changes.filter((c) => c.itemId === itemId),
            ids = new Set(list.map((c) => c.id)),
            advice = data.advice.filter(
              (a) =>
                ids.has(a.changeId) &&
                (tab === "all" ||
                  (tab === "pending"
                    ? a.status === "pending"
                    : a.status !== "pending")),
            );
          if (tab !== "all" && !advice.length) return null;
          return (
            <Card key={itemId}>
              <CardHeader>
                <CardTitle>
                  {data.items.find((i) => i.itemId === itemId)?.title ?? itemId}
                </CardTitle>
                <p>
                  {t("field.itemId")}: {itemId}
                </p>
              </CardHeader>
              <CardContent>
                <div className="comparison">
                  <div className="stack">
                    {list.map((c) => (
                      <div key={c.id}>
                        <strong>{t(`dimension.${c.dimension}`)}</strong>
                        <p>
                          <del>
                            {c.dimension === "price"
                              ? i18n.number(Number(c.beforeValue), {
                                  style: "currency",
                                  currency: "CNY",
                                })
                              : c.beforeValue || t("value.none")}
                          </del>{" "}
                          →{" "}
                          {c.dimension === "price"
                            ? i18n.number(Number(c.afterValue), {
                                style: "currency",
                                currency: "CNY",
                              })
                            : c.afterValue || t("value.none")}
                          {c.dimension === "price" &&
                            Number(c.beforeValue) > 0 &&
                            Number.isFinite(Number(c.afterValue)) && (
                              <span>
                                {" "}
                                (
                                {i18n.number(
                                  (Number(c.afterValue) -
                                    Number(c.beforeValue)) /
                                    Number(c.beforeValue),
                                  {
                                    style: "percent",
                                    maximumFractionDigits: 1,
                                    signDisplay: "always",
                                  },
                                )}
                                )
                              </span>
                            )}
                        </p>
                      </div>
                    ))}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline">{t("evidence")}</Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {list.map((c) => (
                          <p key={c.id}>
                            {t(`dimension.${c.dimension}`)}: {c.evidence}
                          </p>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                  <div className="stack">
                    {advice.map((a) => (
                      <article key={a.id} className="stack">
                        <div className="actions">
                          <strong>{t(`category.${a.category}`)}</strong>
                          <Status value={a.status} />
                        </div>
                        <p className="authored">{a.content}</p>
                        {a.reason && <p className="authored">{a.reason}</p>}
                        {a.status === "pending" && (
                          <div className="actions">
                            <Button
                              disabled={busy}
                              onClick={() =>
                                void action("approve_advice", {
                                  id: a.id,
                                  expectedRevision: a.revision,
                                }).catch(onError)
                              }
                            >
                              {t("action.approve")}
                            </Button>
                            <Button
                              disabled={busy}
                              variant="outline"
                              onClick={() =>
                                void action("reject_advice", {
                                  id: a.id,
                                  expectedRevision: a.revision,
                                }).catch(onError)
                              }
                            >
                              {t("action.reject")}
                            </Button>
                          </div>
                        )}
                      </article>
                    ))}
                    {!advice.length && <p>{t("empty.advice")}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!visibleIds.length && (
          <p>{t(tab === "all" ? "empty.changes" : "empty.advice")}</p>
        )}
      </div>
      <p>{t("app.reviewHint")}</p>
    </Section>
  );
}
