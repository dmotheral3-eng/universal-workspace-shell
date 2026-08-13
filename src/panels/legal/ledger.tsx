import type { LawDogProvider } from "@/data/lawdog-provider";
import { LdPanelFrame, type LdExplainCopy } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

/**
 * The Ledger panel — the matter's three-actor record: who said, did, produced,
 * or refused, dated and attributed, newest first. Ported from the Ledger
 * Console (lawdog-app main @ aed3df9e) into the shell as a panel.
 *
 * PORT NOTE: rows come through the provider's private PostgREST door via a
 * narrow cast, exactly as every ld_* read travels. Promoting this to a public
 * listLedger()/listRounds() pair on LawDogProvider is the named follow-up.
 */

interface LedgerRow {
  ledger_id: string;
  entry_date: string | null;
  actor: string | null;
  actor_side: string | null;
  entry_kind: string | null;
  subject: string | null;
  provision_ref: string | null;
  severity: string | null;
  status: string | null;
  source_ref: string | null;
}

interface RoundRow {
  round_id: string;
  round_no: number | null;
  round_date: string | null;
  direction: string | null;
  author: string | null;
  label: string | null;
  is_operative: boolean | null;
}

interface LedgerData {
  entries: LedgerRow[];
  rounds: RoundRow[];
}

const EXPLAIN: LdExplainCopy = {
  what: "Every thing said, produced, or refused on this matter, as a dated row with a name on it.",
  next: "Read newest first; anything marked refused or high severity is leverage sitting in the record.",
  nextWhenEmpty: "Nothing has been logged for this matter yet — entries appear here the day they happen.",
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function kindTone(kind: string | null): string {
  switch ((kind ?? "").toLowerCase()) {
    case "refused":
      return "text-red-600 border-red-200 bg-red-50";
    case "produced":
      return "text-emerald-700 border-emerald-200 bg-emerald-50";
    default:
      return "text-neutral-500 border-neutral-200 bg-neutral-50";
  }
}

export function LedgerPanel() {
  const { state } = useLegalData<LedgerData>(async (provider, entityId) => {
    // Same door every legal read uses; see PORT NOTE above.
    const q = (
      provider as LawDogProvider as unknown as {
        q<T>(table: string, params: string): Promise<T[]>;
      }
    ).q.bind(provider);
    const [entries, rounds] = await Promise.all([
      q<LedgerRow>(
        "ld_ledger",
        `select=ledger_id,entry_date,actor,actor_side,entry_kind,subject,provision_ref,severity,status,source_ref&case_id=eq.${entityId}&order=entry_date.desc,created_at.desc`
      ),
      q<RoundRow>(
        "ld_rounds",
        `select=round_id,round_no,round_date,direction,author,label,is_operative&case_id=eq.${entityId}&order=round_no.asc`
      ),
    ]);
    return { entries, rounds };
  });

  return (
    <LdPanelFrame<LedgerData>
      title="Ledger"
      subject="the ledger"
      explain={EXPLAIN}
      state={state}
      countOf={(d) => d.entries.length}
      render={(d) => (
        <div className="space-y-4">
          {d.rounds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.rounds.map((r) => (
                <span
                  key={r.round_id}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${
                    r.is_operative
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-neutral-200 bg-neutral-50 text-neutral-500"
                  }`}
                  title={`${r.author ?? ""} — ${r.label ?? ""}`}
                >
                  R{r.round_no ?? "?"} · {fmtDate(r.round_date)}
                  {r.is_operative ? " · operative" : ""}
                </span>
              ))}
            </div>
          )}
          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-400">
                  <th className="px-3 py-1.5 font-medium">Date</th>
                  <th className="px-3 py-1.5 font-medium">Actor</th>
                  <th className="px-3 py-1.5 font-medium">Kind</th>
                  <th className="px-3 py-1.5 font-medium">Subject</th>
                  <th className="px-3 py-1.5 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {d.entries.map((e, i) => (
                  <tr
                    key={e.ledger_id}
                    className={
                      i % 2 ? "bg-neutral-50/50 align-top" : "bg-white align-top"
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                      {fmtDate(e.entry_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={
                          e.actor_side === "ours" || e.actor_side === "us"
                            ? "text-indigo-700"
                            : "text-amber-700"
                        }
                      >
                        {e.actor ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${kindTone(
                          e.entry_kind
                        )}`}
                      >
                        {e.entry_kind ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-700">
                      {e.subject ?? "—"}
                      {e.provision_ref ? (
                        <span className="ml-1.5 text-[10px] text-neutral-400">
                          {e.provision_ref}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {e.severity ? (
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${
                            e.severity === "HIGH"
                              ? "border-red-300 bg-red-600 text-white"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {e.severity}
                        </span>
                      ) : (
                        <span className="text-neutral-300">·</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    />
  );
}
