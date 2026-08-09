import { useEffect, useRef, useState } from "react";
import { bus } from "@/bus";
import { usePanelScope } from "@/shell/panel-scope";
import { getDataProvider } from "@/data";
import { LawDogProvider } from "@/data/lawdog-provider";

/**
 * Wiring shared by the six legal panels: follow the panel's scope, resolve the
 * provider, fetch, and hand back a state the panel can render in every case.
 *
 * The guard matters. These tables exist on one store only; on any other store —
 * and on the mock provider the default profile runs — the panels must render a
 * quiet line, not a stack trace. `unavailable` is that path, and it is checked
 * before a request is ever issued.
 */
export type LegalDataState<T> =
  | { kind: "unavailable" }
  | { kind: "awaiting-entity" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: T };

interface UseLegalDataResult<T> {
  state: LegalDataState<T>;
  entityName: string | null;
}

export function useLegalData<T>(
  load: (provider: LawDogProvider, entityId: string | null) => Promise<T>,
  options?: { requiresEntity?: boolean }
): UseLegalDataResult<T> {
  const requiresEntity = options?.requiresEntity ?? true;
  const { tab } = usePanelScope();
  const scopeId = tab.scopeId ?? null;

  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [state, setState] = useState<LegalDataState<T>>({ kind: "loading" });

  // The loader is redefined every render by its panel; keeping it in a ref means
  // the fetch effect depends on the entity, not on a function identity.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setEntityId(null);
    setEntityName(null);
    return bus.onScoped("entity.selected", scopeId, (event) => {
      setEntityId(event.entityId);
      setEntityName(event.entityName);
    });
  }, [scopeId]);

  useEffect(() => {
    const provider = getDataProvider();
    if (!(provider instanceof LawDogProvider) || !provider.isCubeStore()) {
      setState({ kind: "unavailable" });
      return;
    }
    if (requiresEntity && !entityId) {
      setState({ kind: "awaiting-entity" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    loadRef
      .current(provider, entityId)
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Detail goes to the console, never to the panel: the message can carry
        // hostnames, table names and status codes.
        console.warn("[legal panel] load failed", e);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, requiresEntity]);

  return { state, entityName };
}
