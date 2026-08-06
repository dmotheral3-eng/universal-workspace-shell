import { useEffect, useState, type ReactNode } from "react";
import {
  configureAuth,
  consumeOAuthRedirect,
  getSession,
  isSignedIn,
  onAuthChange,
  signIn,
  signInWithProvider,
  type LawDogSession,
} from "@/data/lawdog-auth";
import { getConfig } from "@/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";

/**
 * Wraps the workspace when the Law Dog profile is active.
 *
 * On any other profile it renders children untouched — the healthcare demo on
 * MockProvider must keep working with no login at all.
 */
export function LawDogGate({ children }: { children: ReactNode }) {
  const config = getConfig();
  const lawdog = config.data.lawdog;
  const active = config.data.mode.startsWith("lawdog") && !!lawdog;

  const [session, setSession] = useState<LawDogSession | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !lawdog) {
      setReady(true);
      return;
    }
    configureAuth({ url: lawdog.url, anonKey: lawdog.anonKey });
    try {
      const oauthSession = consumeOAuthRedirect();
      if (oauthSession) {
        setSession(oauthSession);
        setReady(true);
        return onAuthChange(setSession);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth sign-in failed");
    }
    setSession(isSignedIn() ? getSession() : null);
    setReady(true);
    return onAuthChange(setSession);
  }, [active, lawdog]);

  if (!active) return <>{children}</>;
  if (!ready) return null;
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
          <span className="text-sm font-medium">{config.brand.name}</span>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => signInWithProvider("google")}
          >
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => signInWithProvider("azure")}
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

          {error && <p className="text-xs text-destructive">{error}</p>}

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
