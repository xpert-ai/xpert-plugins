import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  Button,
  Checkbox,
  Input,
  Label,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@xpert-ai/plugin-shadcn-ui";
import { t, formatTime } from "../i18n";
import {
  deletionSchema,
  type Dataset,
  type DeleteTarget,
  type DeletePlan,
  type Action,
} from "../types";
import { Section, Choice } from "./Shared";
export function DataManagement({
  data,
  busy,
  action,
  onError,
}: {
  data: Dataset;
  busy: boolean;
  action: Action;
  onError: (error: Error) => void;
}) {
  const [target, setTarget] = useState<DeleteTarget>("items"),
    [selected, setSelected] = useState<string[]>([]),
    [plan, setPlan] = useState<DeletePlan | null>(null),
    [phrase, setPhrase] = useState(""),
    [error, setError] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const rows =
    target === "items"
      ? data.items.map((r) => ({ id: r.id, label: `${r.title} (${r.itemId})` }))
      : target === "rounds"
        ? data.rounds.map((r) => ({ id: r.id, label: formatTime(r.startedAt) }))
        : target === "changes"
          ? data.changes.map((r) => ({
              id: r.id,
              label: `${r.itemId} · ${t(`dimension.${r.dimension}`)}: ${r.beforeValue} → ${r.afterValue}`,
            }))
          : data.advice.map((r) => ({ id: r.id, label: r.content }));
  async function prepare(kind: DeleteTarget | "all", ids: string[]) {
    if (busy) return;
    if (kind !== "all" && !ids.length) {
      onError(Error(t("delete.select")));
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    try {
      const preview = deletionSchema.parse(
        await action("delete_records", { target: kind, ids }),
      );
      setPhrase("");
      setError("");
      setPlan({
        target: kind,
        ids,
        confirmation: preview.confirmation,
        counts: preview.counts,
      });
    } catch (e) {
      onError(e instanceof Error ? e : Error("invalid_response"));
    }
  }
  return (
    <Collapsible>
      <Section
        title={t("manage.title")}
        actions={
          <CollapsibleTrigger asChild>
            <Button variant="outline">{t("manage.title")}</Button>
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          <div className="stack">
            <p>{t("manage.hint")}</p>
            <div className="actions">
              <Choice
                label={t("field.target")}
                value={target}
                onChange={(value) => {
                  if (
                    ["items", "rounds", "changes", "advice"].includes(value)
                  ) {
                    setTarget(value as DeleteTarget);
                    setSelected([]);
                  }
                }}
                options={(
                  ["items", "rounds", "changes", "advice"] as const
                ).map((value) => ({ value, label: t(value) }))}
              />
              <Button
                variant="destructive"
                disabled={busy || !selected.length}
                onClick={() =>
                  void prepare(
                    target,
                    selected.filter((id) => rows.some((r) => r.id === id)),
                  )
                }
              >
                {t("action.deleteSelected")}
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void prepare("all", [])}
              >
                {t("action.clear")}
              </Button>
            </div>
            <Label>
              <Checkbox
                checked={
                  rows.length > 0 && rows.every((r) => selected.includes(r.id))
                }
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? rows.map((r) => r.id) : [])
                }
              />
              {t("field.selectAll")}
            </Label>
            <div className="record-list">
              {rows.map((r) => (
                <div className="record-row" key={r.id}>
                  <Label className="record-copy">
                    <Checkbox
                      aria-label={t("field.select", { id: r.id })}
                      checked={selected.includes(r.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true
                            ? [...current, r.id]
                            : current.filter((id) => id !== r.id),
                        )
                      }
                    />
                    {r.label}
                  </Label>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void prepare(target, [r.id])}
                  >
                    {t("action.delete")}
                  </Button>
                </div>
              ))}
              {!rows.length && <p>{t("empty.records")}</p>}
            </div>
          </div>
        </CollapsibleContent>
      </Section>
      <AlertDialog
        open={plan !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPlan(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.warning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {plan && (
            <ul>
              {(Object.keys(plan.counts) as (keyof DeletePlan["counts"])[]).map(
                (key) => (
                  <li key={key}>
                    {t("delete.count", {
                      label: t(key),
                      count: plan.counts[key],
                    })}
                  </li>
                ),
              )}
            </ul>
          )}
          <Label htmlFor="delete-phrase">{t("delete.phrase")}</Label>
          <Input
            id="delete-phrase"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            autoComplete="off"
          />
          <p role="alert">{error}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("action.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || phrase !== t("delete.keyword")}
              onClick={() => {
                if (!plan) return;
                void action("delete_records", plan)
                  .then((result) => {
                    if (!result.deleted) throw Error(t("error.generic"));
                    setPlan(null);
                    setSelected([]);
                  })
                  .catch((e) =>
                    setError(
                      e instanceof Error ? e.message : t("error.generic"),
                    ),
                  );
              }}
            >
              {t("delete.title")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
