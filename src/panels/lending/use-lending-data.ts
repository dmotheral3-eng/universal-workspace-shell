import { useEffect, useRef, useState } from "react";
import { bus } from "@/bus";
import { usePanelScope } from "@/shell/panel-scope";
import { isBrokerMode } from "@/data/cube-broker";
import type { LegalDataState } from "@/panels/legal/use-legal-data";

/**
 * Wiring shared by the lending panels.
 *
 * ONE DOOR ONLY, unlike the legal hook. These tables live on the Cube and are
 * reachable exclusively through /api/cube/*, where the server holds the
 * credential, the tenant scope AND the book entitlement. There is deliberately
 * no provider fallback: on any profile that is not brokered these panels render
 * the quiet `unavailable` line rather than reaching for a second data path.
 *
 * The state shape is the legal hook's, so both families share `LdPanelFrame`
 * and behave identically in every non-ready case.
 */
export function useLendingData<T>(
  load: (bookId: string) => Promise<T>,
  options?: { requiresBook?: boolean }
): { state: LegalDataState<T>; bookName: string | null } {
  const requiresBook = options?.requiresBook ?? true;
  const { tab } = usePanelScope();
  const scopeId = tab.scopeId ?? null;

  const [bookId, setBookId] = useState<string | null>(null);
  const [bookName, setBookName] = useState<string | null>(null);
  const [state, setState] = useState<LegalDataState<T>>({ kind: "loading" });

  // Redefined every render by the panel; the ref keeps the fetch effect keyed
  // on the book rather than on a function identity.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setBookId(null);
    setBookName(null);
    // The Books panel is the entity list of this surface, so it speaks the same
    // event every other entity list does.
    return bus.onScoped("entity.selected", scopeId, (event) => {
      setBookId(event.entityId);
      setBookName(event.entityName);
    });
  }, [scopeId]);

  useEffect(() => {
    if (!isBrokerMode()) {
      setState({ kind: "unavailable" });
      return;
    }
    if (requiresBook && !bookId) {
      setState({ kind: "awaiting-entity" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    loadRef.current(bookId ?? "")
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Detail to the console only: a broker code can name a resource.
        console.warn("[lending panel] load failed", e);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, requiresBook]);

  return { state, bookName };
}
