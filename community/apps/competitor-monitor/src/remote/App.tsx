import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLocalizedMessage,
  useRemoteLocale,
} from "@xpert-ai/plugin-shadcn-ui/i18n";
import { i18n, t, errorText } from "./i18n";
import { emptyDataset, type Action, type Dataset } from "./types";
import { RemoteBridge } from "./bridge";
import { ProductPanel } from "./components/ProductPanel";
import { CollectionPanel } from "./components/CollectionPanel";
import { AdvicePanel } from "./components/AdvicePanel";
import { DataManagement } from "./components/DataManagement";
export function App({ bridge }: { bridge: RemoteBridge }) {
  useRemoteLocale(i18n);
  const [data, setData] = useState<Dataset>(emptyDataset),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [round, setRound] = useState("latest"),
    [scopeKey, setScopeKey] = useState(0);
  const [notice, setNotice] = useLocalizedMessage(
    i18n,
    i18n.message("notice.waiting"),
  );
  const locked = useRef(false),
    generation = useRef(0),
    scope = useRef(0);
  const onError = useCallback(
    (error: Error) => setNotice(errorText(error)),
    [setNotice],
  );
  const load = useCallback(async () => {
    const current = ++generation.current;
    const result = await bridge.load();
    if (current !== generation.current) return;
    setData(result);
    setRound((id) =>
      id === "latest" || result.rounds.some((r) => r.id === id) ? id : "latest",
    );
  }, [bridge]);
  useEffect(
    () =>
      bridge.start(
        () => {
          void load()
            .then(() => setNotice(i18n.message("notice.connected")))
            .catch(onError);
        },
        () => {
          generation.current++;
          scope.current++;
          setData(emptyDataset);
          setRound("latest");
          setFailure("");
          setScopeKey((k) => k + 1);
        },
      ),
    [bridge, load, onError, setNotice],
  );
  // 动作互斥覆盖读取回执；刷新失败不把已提交的变更伪装成成功展示。
  const action: Action = async (key, input) => {
    if (locked.current) throw Error("collection_busy");
    locked.current = true;
    setBusy(true);
    const currentScope = scope.current;
    try {
      const result = await bridge.action(key, input);
      if (currentScope !== scope.current) throw Error("scope_changed");
      if (result.round) setRound(result.round.id);
      await load();
      if (
        key !== "prepare_analysis" &&
        (key !== "delete_records" || result.deleted)
      )
        setNotice(
          i18n.message(result.deleted ? "notice.deleted" : "notice.saved"),
        );
      return result;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  function collect(roundId?: string) {
    void action(
      roundId ? "retry_collection" : "run_collection",
      roundId
        ? { roundId, failOnItemId: failure || undefined }
        : {
            idempotencyKey: crypto.randomUUID(),
            failOnItemId: failure || undefined,
          },
    )
      .then((result) => {
        setFailure("");
        if (result.round?.errorReason) setNotice(result.round.errorReason);
      })
      .catch(onError);
  }
  async function analyze(id: string) {
    try {
      const prepared = await action("prepare_analysis", { roundId: id });
      locked.current = true;
      setBusy(true);
      try {
        await bridge.dispatch(prepared);
        setNotice(i18n.message("notice.sent"));
      } finally {
        locked.current = false;
        setBusy(false);
      }
    } catch (e) {
      onError(e instanceof Error ? e : Error("generic"));
    }
  }
  return (
    <main className="shell">
      <header className="page-heading">
        <h1>{t("app.title")}</h1>
        <p>{t("app.tagline")}</p>
      </header>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <div key={scopeKey} className="stack">
        <div className="top-panels">
          <ProductPanel
            items={data.items}
            busy={busy}
            action={action}
            onError={onError}
          />
          <CollectionPanel
            rounds={data.rounds}
            busy={busy}
            failure={failure}
            setFailure={setFailure}
            onCollect={collect}
            onAnalyze={(id) => void analyze(id)}
            onResume={(id) =>
              void action("resume_collection", { roundId: id })
                .then(() => setNotice(i18n.message("notice.resumed")))
                .catch(onError)
            }
            onRefresh={() => void load().catch(onError)}
          />
        </div>
        <AdvicePanel
          data={data}
          selectedRound={round}
          setRound={setRound}
          busy={busy}
          action={action}
          onAnalyze={(id) => void analyze(id)}
          onError={onError}
        />
        <DataManagement
          data={data}
          busy={busy}
          action={action}
          onError={onError}
        />
      </div>
      <footer>{t("app.mock")}</footer>
    </main>
  );
}
