import { useEffect, useState, type ReactNode } from "react";
import {
  completeOAuthRedirect,
  configureAuth,
  getSession,
  isSignedIn,
  onAuthChange,
  signIn,
  signInWithProvider,
  signOut,
  type LawDogSession,
} from "@/data/lawdog-auth";
import { getAuthConfig, getConfig } from "@/config";
import { trackDoorEvent } from "./door-analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";

/**
 * The shell's sign-in gate. Wraps the workspace whenever the active profile
 * declares a door (`getAuthConfig()`):
 *
 *   lawdog profile → Law Dog's own project (native, unchanged)
 *   cube profile   → MASTER, app.centripetal-ai.com — the one door for every
 *                    Cube-backed surface. Google and Microsoft both live there
 *                    already, which is the whole point: a Cube surface gets two
 *                    working providers without wiring a single one.
 *
 * On a profile with no door it renders children untouched — the healthcare demo
 * on MockProvider must keep working with no login at all.
 */
/**
 * A Microsoft tenant can hide the email claim from applications. When it does,
 * the sign-in itself SUCCEEDS — we get a valid session with an empty email —
 * and then every downstream answer is empty, because the entitlement register
 * on master is keyed by email (`fn_lending_entitlement`) and the broker returns
 * no books for an identity it cannot name (server/broker/identity.ts).
 *
 * That is the blank wall this screen exists to prevent. It is NOT a permissions
 * problem the person can fix by trying again, so the copy says what happened,
 * who can change it, and what to do meanwhile — and it offers a way back out
 * rather than stranding them in a signed-in session that can never show data.
 */
/**
 * A dead end that reads as an explanation rather than as a failure. Same 320px
 * column and same visual weight as the sign-in card, so it does not look like a
 * crash screen.
 */
function DoorNotice({
  title,
  message,
  onBack,
}: {
  title: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-[320px]">
        <div className="mb-6 flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{message}</p>
        <Button variant="outline" className="mt-4 h-8 w-full text-xs" onClick={onBack}>
          Try a different account
        </Button>
      </div>
    </div>
  );
}

export const NO_EMAIL_MESSAGE =
  "Your organisation hides your email address from apps, so we cannot match you to a seat. " +
  "Ask your IT team to release the email claim for this sign-in, or use another account.";

/**
 * GoTrue phrases this several ways, so match on PHRASES rather than on the bare
 * word "email" — "Invalid email or password" is a password failure and must not
 * be dressed up as a tenant policy problem. The first entry is the one GoTrue
 * actually returns for a withheld claim; the rest are the wordings seen around it.
 */
const MISSING_EMAIL_PHRASES = [
  "error getting user email",
  "missing email",
  "email not provided",
  "not provided by",
  "no email",
  "without an email",
  "email not found",
];

export function isMissingEmailError(message: string): boolean {
  const m = message.toLowerCase();
  return MISSING_EMAIL_PHRASES.some((p) => m.includes(p));
}

export function LawDogGate({ children }: { children: ReactNode }) {
  const config = getConfig();
  const auth = getAuthConfig();
  const active = !!auth;

  const [session, setSession] = useState<LawDogSession | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !auth) {
      setReady(true);
      return;
    }
    configureAuth({ url: auth.url, anonKey: auth.anonKey, storageKey: auth.storageKey });

    // PKCE turns the redirect landing into a network round trip (exchange the
    // one-time code for a session), so this effect resolves asynchronously.
    let cancelled = false;
    const unsubscribe = onAuthChange(setSession);
    completeOAuthRedirect()
      .then((oauthSession) => {
        if (cancelled) return;
        setSession(oauthSession ?? (isSignedIn() ? getSession() : null));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "OAuth sign-in failed");
        setSession(isSignedIn() ? getSession() : null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [active, auth]);

  if (!active) return <>{children}</>;
  if (!ready) return null;

  // An emailless session is admitted by GoTrue and useless to us — see
  // NO_EMAIL_MESSAGE. Refuse it here, politely, instead of letting the person
  // land in an empty workspace and conclude the product is broken.
  if (session && !session.email) {
    return (
      <DoorNotice
        title={auth?.label ?? config.brand.name}
        message={NO_EMAIL_MESSAGE}
        onBack={() => {
          void signOut();
          setSession(null);
        }}
      />
    );
  }

  if (session) return <>{children}</>;

  const submit = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-[320px]">
        <div className="mb-6 flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{auth?.label ?? config.brand.name}</span>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => {
              trackDoorEvent("door-provider-selected", { provider: "google" });
              signInWithProvider("google");
            }}
          >
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => {
              trackDoorEvent("door-provider-selected", { provider: "azure" });
              signInWithProvider("azure");
            }}
          >
            Continue with Microsoft
          </Button>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ld-email" className="text-xs">
              Email
            </Label>
            <Input
              id="ld-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ld-password" className="text-xs">
              Password
            </Label>
            <Input
              id="ld-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="h-8 text-xs"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">
              {isMissingEmailError(error) ? NO_EMAIL_MESSAGE : error}
            </p>
          )}

          <Button onClick={submit} disabled={busy || !email || !password} className="h-8 w-full text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sign in"}
          </Button>

          <p className="pt-1 text-[10px] leading-snug text-muted-foreground">
            Every table in this store is RLS-scoped to authenticated users. There is no anonymous
            read path, by design.
          </p>
        </div>
      </div>
    </div>
  );
}
