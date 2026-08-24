/**
 * The email-claim rule, kept out of the gate component on purpose.
 *
 * WHY ITS OWN MODULE: `test/` compiles under tsconfig.node.json, which has no
 * DOM lib, no JSX and no `@/*` alias — importing a .tsx component from a test
 * is a build failure, not a style question (it is exactly how this landed red
 * on the first push). The rule is pure logic, so it lives in a pure module and
 * both the component and the test import it the way tenant-scope.test.ts
 * already does: by relative path.
 *
 * THE PROBLEM IT DESCRIBES: a Microsoft tenant can withhold the email claim
 * from applications. When it does the sign-in SUCCEEDS — GoTrue returns a valid
 * session with an empty email — and everything downstream is then empty,
 * because the entitlement register on master is keyed by email
 * (fn_lending_entitlement) and the broker returns no books for an identity it
 * cannot name (server/broker/identity.ts). The person lands signed in, inside
 * an empty workspace, and concludes the product is broken.
 */

/**
 * Not a permissions problem the person can retry their way out of, so the copy
 * says what happened, who can change it, and what to do instead.
 */
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

/**
 * The broker refused, politely.
 *
 * Access on this surface is granted ONE BOOK AT A TIME (public.lending_book_access
 * on master, read through fn_lending_entitlement), so a person can hold a valid
 * session, belong to the right tenant, and still correctly be shown nothing.
 * That is not an error and must not be dressed as one — "try again shortly" is
 * false advice for a state that will never change on its own.
 *
 * Companion to NO_EMAIL_MESSAGE above: that one is the door refusing an identity
 * it cannot name, this one is the workspace refusing an identity it CAN name but
 * has not been given anything to show.
 */
export const NO_BOOK_ACCESS_MESSAGE =
  "You are signed in, but no book has been opened to you yet. " +
  "Access is granted one book at a time — ask whoever set up your workspace to grant one.";

/**
 * Broker codes that mean "the answer is no", as opposed to "this broke".
 *
 * `timeout` and `unreachable` are deliberately NOT here: those are failures and
 * belong in the error branch, where "try again shortly" is the right advice.
 */
const REFUSAL_CODES = new Set(["not_entitled", "tenant_unresolved", "tenant_ambiguous"]);

export function isRefusalCode(code: unknown): boolean {
  return typeof code === "string" && REFUSAL_CODES.has(code);
}
