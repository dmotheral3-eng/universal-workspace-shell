import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import {
  mapPartyRow,
  mapRateRow,
  mapSavingRow,
  mapSubpoenaRow,
  mapClaimMathRow,
  mapRecoveryMathRow,
  groupClaimMath,
  sortParties,
} from "./data/lawdog-provider";
import {
  partyRows,
  rateRows,
  savingsRows,
  subpoenaRows,
  claimMathRows,
  recoveryMathRows,
} from "./data/lawdog-fixtures";
import { LdPanelFrame } from "./panels/legal/ld-panel-frame";
import type { LegalDataState } from "./panels/legal/use-legal-data";
import { PartiesView } from "./panels/legal/parties";
import { RatesView } from "./panels/legal/rates";
import { SavingsView, SavingsFooter } from "./panels/legal/savings";
import { SubpoenasView } from "./panels/legal/subpoenas";
import { ClaimValueView } from "./panels/legal/claim-value";
import { RecoveryOutlookView } from "./panels/legal/recovery-outlook";

/**
 * Fixture harness for the six legal panels — open /panels.html with `npm run dev`
 * (or in the built output) to look at every panel in both states side by side.
 *
 * It exists because the live states cannot be seen in dev or preview: those
 * tables have no anonymous read path, so an unauthenticated run renders empty by
 * design. Fixtures are the sanctioned way to inspect the populated states, and
 * the empty column here is the contractual one — every panel must read as a
 * finished, calm surface with zero rows.
 *
 * The panels' own views are imported directly; nothing is re-implemented here, so
 * a regression in a panel shows up in this page.
 */

const parties = sortParties(partyRows.map(mapPartyRow));
const rates = rateRows.map(mapRateRow);
const savings = savingsRows.map(mapSavingRow);
const subpoenas = subpoenaRows.map(mapSubpoenaRow);
const claims = groupClaimMath(claimMathRows.map(mapClaimMathRow));
const recovery = recoveryMathRows.map(mapRecoveryMathRow);

function ready<T>(data: T): LegalDataState<T> {
  return { kind: "ready", data };
}

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <figcaption className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
        {caption}
      </figcaption>
      <div className="h-[380px] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {children}
      </div>
    </figure>
  );
}

function Pair({
  name,
  populated,
  empty,
}: {
  name: string;
  populated: ReactNode;
  empty: ReactNode;
}) {
  // id lets a section be deep-linked: /panels.html#claim-value
  const id = name.toLowerCase().replace(/\s+/g, "-");
  return (
    <section id={id} className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium text-neutral-900">{name}</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cell caption="populated">{populated}</Cell>
        <Cell caption="empty">{empty}</Cell>
      </div>
    </section>
  );
}

function Preview() {
  return (
    <div className="min-h-screen bg-neutral-50 p-6 font-sans text-neutral-900">
      <header className="mb-6">
        <h1 className="text-[15px] font-medium">Legal panels — fixture harness</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-neutral-600">
          Fixture rows are shaped exactly like the live columns and are run through the same row
          mappers the panels use. Empty is the state a signed-out run actually shows, so it is
          rendered here beside every populated panel.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        <Pair
          name="Parties"
          populated={
            <LdPanelFrame
              title="Parties"
              subject="parties"
              meta="Reyes v. Northgate"
              state={ready(parties)}
              render={(rows) => <PartiesView parties={rows} />}
            />
          }
          empty={
            <LdPanelFrame
              title="Parties"
              subject="parties"
              state={ready([])}
              render={(rows) => <PartiesView parties={rows} />}
            />
          }
        />

        <Pair
          name="Rates"
          populated={
            <LdPanelFrame
              title="Rates"
              subject="rates"
              state={ready(rates)}
              render={(rows) => <RatesView rates={rows} />}
            />
          }
          empty={
            <LdPanelFrame
              title="Rates"
              subject="rates"
              state={ready([])}
              render={(rows) => <RatesView rates={rows} />}
            />
          }
        />

        <Pair
          name="Savings"
          populated={
            <LdPanelFrame
              title="Savings"
              subject="savings"
              meta="Reyes v. Northgate"
              state={ready(savings)}
              render={(rows) => <SavingsView rows={rows} />}
              footer={(rows) => (rows.length > 0 ? <SavingsFooter rows={rows} /> : null)}
            />
          }
          empty={
            <LdPanelFrame
              title="Savings"
              subject="savings"
              state={ready([])}
              render={(rows) => <SavingsView rows={rows} />}
              footer={(rows) => (rows.length > 0 ? <SavingsFooter rows={rows} /> : null)}
            />
          }
        />

        <Pair
          name="Subpoenas"
          populated={
            <LdPanelFrame
              title="Subpoenas"
              subject="subpoenas"
              meta="Reyes v. Northgate"
              state={ready(subpoenas)}
              render={(rows) => <SubpoenasView rows={rows} />}
            />
          }
          empty={
            <LdPanelFrame
              title="Subpoenas"
              subject="subpoenas"
              state={ready([])}
              render={(rows) => <SubpoenasView rows={rows} />}
            />
          }
        />

        <Pair
          name="Claim value"
          populated={
            <LdPanelFrame
              title="Claim value"
              subject="claim value"
              state={ready(claims)}
              render={(groups) => <ClaimValueView groups={groups} />}
            />
          }
          empty={
            <LdPanelFrame
              title="Claim value"
              subject="claim value"
              state={ready([])}
              render={(groups) => <ClaimValueView groups={groups} />}
            />
          }
        />

        <Pair
          name="Recovery outlook"
          populated={
            <LdPanelFrame
              title="Recovery outlook"
              subject="the recovery outlook"
              meta="Reyes v. Northgate"
              state={ready(recovery)}
              render={(rows) => <RecoveryOutlookView rows={rows} />}
            />
          }
          empty={
            <LdPanelFrame
              title="Recovery outlook"
              subject="the recovery outlook"
              state={ready([])}
              render={(rows) => <RecoveryOutlookView rows={rows} />}
            />
          }
        />

        {/* Shared states, written once in the frame and shown once here. */}
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-neutral-900">Shared states</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Cell caption="nothing selected">
              <LdPanelFrame
                title="Subpoenas"
                subject="subpoenas"
                state={{ kind: "awaiting-entity" }}
                render={() => null}
              />
            </Cell>
            <Cell caption="other store">
              <LdPanelFrame
                title="Subpoenas"
                subject="subpoenas"
                state={{ kind: "unavailable" }}
                render={() => null}
              />
            </Cell>
            <Cell caption="load failed">
              <LdPanelFrame
                title="Subpoenas"
                subject="subpoenas"
                state={{ kind: "error" }}
                render={() => null}
              />
            </Cell>
          </div>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
