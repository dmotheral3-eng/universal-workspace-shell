/**
 * The door must refuse an identity it cannot name.
 *
 * A Microsoft tenant can withhold the email claim. When it does the sign-in
 * SUCCEEDS and everything downstream is empty, because the entitlement register
 * on master is keyed by email. The gate therefore has two jobs, and this file
 * pins the one that is pure logic: recognising GoTrue's several wordings for
 * the same refusal so the person gets the explanation instead of raw upstream
 * prose. The other job — refusing a session whose email is empty — is a single
 * branch in the component and is proven by the walk, not here.
 */

import { describe, expect, it } from "vitest";
import { NO_EMAIL_MESSAGE, isMissingEmailError } from "@/shell/lawdog-gate";

describe("missing email claim", () => {
  it("matches the wordings GoTrue actually returns", () => {
    for (const m of [
      "Error getting user email from external provider",
      "Email not provided by the provider",
      "missing email",
      "No email address returned",
    ]) {
      expect(isMissingEmailError(m), m).toBe(true);
    }
  });

  it("does not swallow unrelated failures behind the email copy", () => {
    for (const m of [
      "Signups not allowed for this instance",
      "invalid request: both auth code and code verifier should be non-empty",
      "Sign-in failed",
      "",
    ]) {
      expect(isMissingEmailError(m), m).toBe(false);
    }
  });

  it("tells the person who can fix it and offers a way out", () => {
    expect(NO_EMAIL_MESSAGE).toMatch(/IT team/i);
    expect(NO_EMAIL_MESSAGE).toMatch(/another account/i);
  });
});
