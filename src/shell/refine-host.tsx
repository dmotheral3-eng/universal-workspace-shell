import { useEffect, useState } from "react";
import { Refine } from "@refinedev/core";
import type { IResourceItem } from "@refinedev/core";
import { loadResourcesFromRegistry } from "@/data/refine-resources";
import { brokerDataProvider } from "@/data/refine-data-provider";
import { shellAuthProvider } from "@/data/refine-auth-provider";
import { brokerAccessControlProvider } from "@/data/refine-access-control";
import { changeLogProvider } from "@/data/refine-audit-log";

/**
 * Refine sits UNDER the shell, not around it (BOR-129).
 *
 * The nav-rail, the layout tree, the command palette and every face keep their
 * own chrome and their own routing; `<Refine>` is mounted beneath them purely
 * so the hooks — useTable / useShow / useMany / useForm / useLogList / useCan —
 * have a context to read. Nothing in this commit calls one yet, which is why
 * the app must render byte-for-byte as it did before: if anything moved on
 * screen, the mount is wrong.
 *
 * `resources` are fetched, never written down — see refine-resources.ts. They
 * start empty and arrive a tick later; a profile with no lending registry (or
 * a signed-out one) simply keeps the empty list, which is the honest answer for
 * a surface that has no rail of its own.
 *
 * PROVIDERS ARRIVE WITH THEIR IMPLEMENTATIONS, NEVER BEFORE. BOR-129 as written
 * asked for all four props at once. Mounted that way it did not survive a page
 * load: `<Refine>` CALLS `authProvider.check()` itself on mount, so a
 * not-yet-built auth provider threw on every render ("Unhandled Error in check:
 * refine always expects a resolved promise"). A provider prop is not inert.
 * `dataProvider` is BOR-130 (refine-data-provider.ts); `authProvider` is BOR-131
 * (refine-auth-provider.ts) and wraps the shell's one existing sign-in — it adds
 * no second one. `accessControlProvider` is BOR-132 (refine-access-control.ts):
 * it asks the broker's `can` route, whose reason is the rule row's own text.
 * `auditLogProvider` is BOR-133 (refine-audit-log.ts): it reads the change
 * record and writes nothing, because the server already wrote the row in the
 * same transaction as the change.
 *
 * ITS OWN MODULE BECAUSE THERE IS MORE THAN ONE ROOT (BOR-136). A popped-out
 * panel is a second React tree in a second window. Once a panel reads through
 * a resource hook it needs this above it there as well, or it throws on mount.
 */
export function RefineHost({ children }: { children: React.ReactNode }) {
  const [resources, setResources] = useState<IResourceItem[]>([]);

  useEffect(() => {
    let live = true;
    loadResourcesFromRegistry().then((r) => {
      if (live) setResources(r);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Refine
      dataProvider={brokerDataProvider}
      authProvider={shellAuthProvider}
      accessControlProvider={brokerAccessControlProvider}
      auditLogProvider={changeLogProvider}
      resources={resources}
      options={{
        mutationMode: "pessimistic",
        disableTelemetry: true,
        // The shell owns the URL. Refine must not also write to it, or the two
        // routers fight over the address bar.
        syncWithLocation: false,
      }}
    >
      {children}
    </Refine>
  );
}
