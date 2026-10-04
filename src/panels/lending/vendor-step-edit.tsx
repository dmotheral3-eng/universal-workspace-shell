import { useState } from "react";
import { CanAccess, useUpdate } from "@refinedev/core";
import type { BrokerError } from "@/data/cube-broker";

/**
 * The edit control on a vendor checklist step (BOR-132).
 *
 * IT IS ABSENT, NOT DISABLED, FOR SOMEONE WHO MAY NOT USE IT. `<CanAccess>`
 * asks the broker's `can` route for THIS step; unless the answer is yes the
 * control is not in the page at all. A greyed-out control is still an
 * invitation, and it tells the person nothing about why.
 *
 * WHEN IT IS PRESENT IT IS REAL. Changing the status goes through the write
 * door, pessimistically: nothing on screen moves until the server says the row
 * changed. If the wall refuses anyway — a role withdrawn since the page
 * loaded, a step sealed by someone else a moment ago — the refusal is shown
 * here, on the field, in the rule's own words as the server read them from the
 * rules table. This component holds no wording of its own for a refusal.
 */

/** The broker resource a checklist step is read and written through. */
export const STEP_RESOURCE = "lending_vendor_checklist";

/** The statuses the server's write allowlist accepts for a step. */
const STATUSES = ["NOT STARTED", "IN PROGRESS", "COMPLETE"] as const;

export interface StepAddress {
  vendorId: string;
  factKey: string;
}

/** `<vendor_id>:<fact_key>` — the row address the `can` route takes. */
export function stepCanId(step: StepAddress): string {
  return `${step.vendorId}:${step.factKey}`;
}

export function VendorStepEdit({
  step,
  status,
  onChanged,
}: {
  step: StepAddress;
  status: string | null;
  /** The row as the server returned it after the wall said yes. */
  onChanged?: (row: Record<string, unknown>) => void;
}) {
  return (
    <CanAccess resource={STEP_RESOURCE} action="edit" params={{ id: stepCanId(step) }} fallback={null}>
      <StepStatusControl step={step} status={status} onChanged={onChanged} />
    </CanAccess>
  );
}

function StepStatusControl({
  step,
  status,
  onChanged,
}: {
  step: StepAddress;
  status: string | null;
  onChanged?: (row: Record<string, unknown>) => void;
}) {
  const { mutate, mutation } = useUpdate();
  const [refusal, setRefusal] = useState<string | null>(null);
  const current = STATUSES.find((s) => s === (status ?? "").toUpperCase()) ?? "";

  return (
    <span data-testid="vendor-step-edit">
      <select
        aria-label="Change status"
        value={current}
        disabled={mutation.isPending}
        onChange={(e) => {
          const next = e.target.value;
          if (!next || next === current) return;
          setRefusal(null);
          mutate(
            {
              resource: STEP_RESOURCE,
              id: stepCanId(step),
              values: { status: next },
              meta: { key: { vendor_id: step.vendorId, fact_key: step.factKey } },
              // The refusal is shown on the field, below; no toast as well.
              successNotification: false,
              errorNotification: false,
            },
            {
              onSuccess: (res) => onChanged?.(res.data as Record<string, unknown>),
              onError: (err) => {
                const rule = (err as unknown as BrokerError).rule;
                setRefusal(
                  rule
                    ? [rule.label, rule.description].filter(Boolean).join(" ")
                    : "That change was not made."
                );
              },
            }
          );
        }}
        className="text-[12px]"
      >
        {current === "" ? <option value="">{status ?? "—"}</option> : null}
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {refusal ? (
        <span role="alert" className="ml-2 text-[12px]">
          {refusal}
        </span>
      ) : null}
    </span>
  );
}
