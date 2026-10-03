// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.

export {
  ASTROID_PORTAL_COOKIE_PREFIX,
  ASTROID_PORTAL_TABLE_PREFIX,
  astroidPortal,
  astroidPortalGuardConfig,
  type ResolvedPortal,
} from "./config.js";
export {
  type GuardDecision,
  guardResponse,
  matchesPrefix,
  portalGuard,
  type PortalGuardConfig,
  type PortalRoute,
  type PortalUser,
} from "./guard.js";
export { definePortalNav, type PortalNav, type PortalNavItem } from "./nav.js";
export {
  generateAstroidPortalAuth,
  generateAstroidPortalAuthRoute,
  generateAstroidPortalLocals,
  generateAstroidPortalLogoutPage,
} from "./scaffold.js";
export {
  type CustomerGuardResult,
  isSameOrigin,
  json,
  type PortalSessionResolver,
  requireCustomer,
  resolvePortalSession,
} from "./session.js";
export {
  ASTROID_PORTAL_SIGN_OUT_DEGRADED,
  type PortalSignOutOptions,
  type PortalSignOutResult,
  type PortalSignOutState,
  portalSignOut,
} from "./sign-out.js";
