import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { io } from "socket.io-client";
import { z } from "zod/v3";
import {
  createCollaborationClient,
  createCollaborationPresenceStore,
  createSocketIoTransportAdapter,
  base64ToBytes,
  bytesToBase64,
  type CollaborationPresenceStoreSnapshot,
} from "@xpert-ai/plugin-sdk/collaboration-client";
import { action } from "./bridge";
import type { DocumentKind } from "../../../src/domain";

const sessionSchema = z.object({
  sessionId: z.string(),
  clientKey: z.string(),
  documentId: z.string(),
  namespace: z.string(),
  connectionUrl: z.string().url(),
  access: z.enum(["read", "write"]),
  expiresAt: z.number(),
  actor: z.object({
    presenceId: z.string(),
    displayName: z.string(),
    color: z.string(),
    actorType: z.enum(["user", "agent", "system"]),
    avatarUrl: z.string().nullable().optional(),
  }),
});
export type DocumentHandle = {
  flush: () => Promise<boolean>;
  markdown: () => string;
};
/** Platform sessions own synchronization and presence. Authenticated View actions acknowledge
 * bounded CRDT writes, so failed/unacknowledged updates remain in the live editor for retry. */
export function useDocument(meetingId: string, kind: DocumentKind) {
  const [doc] = useState(() => new Y.Doc());
  const [connection, setConnection] = useState("connecting");
  const [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(false);
  const [presence, setPresence] =
    useState<CollaborationPresenceStoreSnapshot>();
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => {
    let disposed = false,
      generation = 0,
      saved = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: Promise<boolean> | undefined, stop: (() => void) | undefined;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    let connecting = false;
    let scheduleRetry: ReturnType<typeof setInterval> | undefined;
    const flush = async (): Promise<boolean> => {
      if (inFlight) {
        if (!(await inFlight)) return false;
        return flush();
      }
      if (generation === saved) return true;
      const target = generation,
        updateBase64 = bytesToBase64(Y.encodeStateAsUpdate(doc));
      inFlight = action("document.update", { meetingId, kind, updateBase64 })
        .then(
          () => {
            saved = target;
            if (!disposed) {
              setDirty(generation !== saved);
              setError(false);
            }
            return true;
          },
          () => {
            if (!disposed) setError(true);
            return false;
          }
        )
        .finally(() => {
          inFlight = undefined;
        });
      const result = await inFlight;
      return result && (generation === saved || (await flush()));
    };
    flushRef.current = flush;
    const connect = async () => {
      if (disposed || connecting) return;
      connecting = true;
      try {
        const response = z
          .object({ session: sessionSchema, state: z.string() })
          .parse(await action("document.session", { meetingId, kind }));
        if (disposed) return;
        stop?.();
        clearInterval(scheduleRetry);
        clearTimeout(renewal);
        Y.applyUpdate(doc, base64ToBytes(response.state), "initial");
        const socket = io(response.session.connectionUrl, {
          autoConnect: false,
          transports: ["websocket"],
          auth: {
            sessionId: response.session.sessionId,
            clientKey: response.session.clientKey,
            documentId: response.session.documentId,
          },
        });
        const store = createCollaborationPresenceStore({
          selfActor: response.session.actor,
          onChange: (snapshot) => {
            if (!disposed) setPresence(snapshot);
          },
        });
        const client = createCollaborationClient({
          session: response.session,
          transport: createSocketIoTransportAdapter(socket),
          document: {
            applyUpdate: (update, origin) => Y.applyUpdate(doc, update, origin),
            encodeStateVector: () => Y.encodeStateVector(doc),
            mergeUpdates: Y.mergeUpdates,
            // Outbound changes use acknowledged View actions; updates broadcast by the platform arrive here.
            onUpdate: () => () => {},
          },
          onConnectionChange: (state) => {
            if (!disposed) {
              setConnection(state);
              if (state === "connected" && generation === saved)
                setError(false);
            }
          },
          onPresence: store.upsert,
          onPresenceSnapshot: (items, metadata) =>
            store.replace(items, metadata.selfClientId),
          onPresenceRemove: store.remove,
          onError: () => {
            if (!disposed) setError(true);
          },
          initialPresence: {
            mode: "edit",
            focus: { kind: "document", fieldKey: kind },
          },
        });
        const observe = (_update: Uint8Array, origin: unknown) => {
          if (origin === client.remoteOrigin || origin === "initial") return;
          generation++;
          setDirty(true);
          clearTimeout(timer);
          timer = setTimeout(() => void flush(), 300);
        };
        doc.on("update", observe);
        socket.on("connect_error", () => {
          if (!disposed) setConnection("disconnected");
        });
        socket.on("disconnect", (reason) => {
          if (!disposed && reason === "io server disconnect") {
            clearTimeout(renewal);
            renewal = setTimeout(() => void connect(), 1000);
          }
        });
        client.connect();
        setReady(true);
        setPresence(store.snapshot());
        renewal = setTimeout(
          () => void connect(),
          Math.max(1000, response.session.expiresAt - Date.now() - 60000)
        );
        scheduleRetry = setInterval(() => {
          if (generation !== saved) void flush();
        }, 3000);
        stop = () => {
          doc.off("update", observe);
          client.disconnect();
          store.clear();
        };
      } catch {
        if (!disposed) {
          setError(true);
          setConnection("disconnected");
          renewal = setTimeout(() => void connect(), 5000);
        }
      } finally {
        connecting = false;
      }
    };
    void connect();
    const guard = (event: BeforeUnloadEvent) => {
      if (generation !== saved) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(scheduleRetry);
      clearTimeout(renewal);
      window.removeEventListener("beforeunload", guard);
      void flush();
      stop?.();
    };
  }, [meetingId, kind, doc]);
  return {
    doc,
    ready,
    dirty,
    error,
    connection,
    presence,
    flush: () => flushRef.current(),
  };
}
