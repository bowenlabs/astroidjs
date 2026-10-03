// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Signing a portal user out from a server-rendered page.
//
// Ending a session is a write, and the session cookie is `SameSite=Lax`, which
// a browser attaches to a top-level GET from any site. So a `/logout` that
// signs out on a GET lets any other website sign your customers out with a
// link, an image, or a redirect. Both client sites with a portal shipped
// exactly that. The flow here signs out only on a same-origin POST, and asks
// first on anything else, so a page can't get it wrong by forgetting one check
// (louise-toolkit ADR 0012 §1: cookie-backed writes go behind the same-origin
// check).
//
// It decides and signs out; it renders nothing. The page keeps its own copy and
// layout, and chooses whether a signed-out visitor sees a page or a redirect.

import { reportDegraded } from "louise-toolkit/errors";
import type { PortalUser } from "./guard.js";
import { isSameOrigin } from "./session.js";

/** The `reportDegraded` name a failed sign-out reports under. */
export const ASTROID_PORTAL_SIGN_OUT_DEGRADED = "portal.sign-out";

/**
 * What the logout page shows.
 *
 * - `signed-out`: the session is gone, or there was none.
 * - `confirm`: still signed in; ask with a form that POSTs back. A GET (an old
 *   link, a bookmark) lands here, and so does a POST from another origin.
 * - `failed`: the sign-out itself failed; the session is still there.
 */
export type PortalSignOutState = "signed-out" | "confirm" | "failed";

export interface PortalSignOutResult {
  state: PortalSignOutState;
  /** 200, 403 for a refused cross-origin POST, or 503 for a failed sign-out. */
  status: 200 | 403 | 503;
  /**
   * Every `Set-Cookie` the sign-out expired, one header each. Empty unless
   * this request ended a session. Pass it to `redirectWithCookies`
   * (`louise-toolkit/auth`), or append each `cookies.getSetCookie()` entry to
   * the page's response.
   */
  cookies: Headers;
}

export interface PortalSignOutOptions {
  /** The signed-in portal user (`Astro.locals.portalUser`), or null. */
  user: PortalUser | null;
  /**
   * Ends the session the request's cookies name, and returns Better Auth's
   * response. With `getLouiseAuth`, build the instance for the request's
   * origin and call `auth.api.signOut({ headers: request.headers, asResponse:
   * true })`; the scaffolded `src/portal-auth.ts` exports that as
   * `signOutPortal`.
   */
  signOut: (request: Request) => Promise<Response>;
}

/**
 * Decide a logout request, and sign out when it's a same-origin POST.
 *
 * ```astro
 * ---
 * const result = await portalSignOut(Astro.request, {
 *   user: Astro.locals.portalUser,
 *   signOut: signOutPortal,
 * });
 * if (result.state === "signed-out") return redirectWithCookies(result.cookies, "/");
 * Astro.response.status = result.status;
 * ---
 * <form method="post" action="/logout"><button>Log out</button></form>
 * ```
 *
 * Every Log out control must be a form that POSTs, not a link: a link is a
 * GET, which only ever gets the `confirm` state. A failure, a non-OK answer or
 * a throw, is reported with `reportDegraded` and leaves the session alone.
 */
export async function portalSignOut(
  request: Request,
  options: PortalSignOutOptions,
): Promise<PortalSignOutResult> {
  const none = new Headers();
  if (!options.user) return { state: "signed-out", status: 200, cookies: none };
  if (request.method !== "POST") return { state: "confirm", status: 200, cookies: none };
  if (!isSameOrigin(request)) return { state: "confirm", status: 403, cookies: none };

  try {
    const response = await options.signOut(request);
    if (response.ok) {
      // One header per cookie: `headers.get("set-cookie")` would join them,
      // and a browser keeps only the first of a joined header.
      const cookies = new Headers();
      for (const cookie of response.headers.getSetCookie()) cookies.append("set-cookie", cookie);
      return { state: "signed-out", status: 200, cookies };
    }
    reportDegraded(
      ASTROID_PORTAL_SIGN_OUT_DEGRADED,
      new Error(`Sign-out answered ${response.status}`),
      { status: response.status },
    );
  } catch (error) {
    reportDegraded(ASTROID_PORTAL_SIGN_OUT_DEGRADED, error);
  }
  return { state: "failed", status: 503, cookies: none };
}
