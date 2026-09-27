// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// AI Gateway for the editor's AI assists, off until a site names one.
//
// Every louise-toolkit AI route takes a `gateway` option, and without one no
// successful AI call is logged anywhere: no latency, no error rate, and no
// cache. A gateway gives all three with no toolkit change. It's a variable,
// not config, so production can log through one while a Preview, which sets
// no variable, calls Workers AI directly.
//
// The log holds the text an editor sends to the assists. Say so on the site's
// privacy page before you set the variable.

import type { AiGatewayOptions } from "louise-toolkit/ai";
import { ASTROID_SECRET_PLACEHOLDER } from "../secrets.js";

/** The `vars` entry that names the site's AI Gateway. */
export const ASTROID_AI_GATEWAY_VAR = "AI_GATEWAY_ID";

/**
 * The AI Gateway options for this request's environment, or `undefined` to
 * call Workers AI directly. Reads `AI_GATEWAY_ID`: unset, empty, or the
 * placeholder sentinel all mean off.
 *
 * Takes `env` as `unknown`, like the toolkit's `aiRunner`, so a site whose
 * `CloudflareEnv` doesn't declare the variable still compiles.
 */
export function astroidAiGateway(env: unknown): AiGatewayOptions | undefined {
  const id = (env as Record<string, unknown> | null | undefined)?.[ASTROID_AI_GATEWAY_VAR];
  if (typeof id !== "string") return undefined;
  const trimmed = id.trim();
  if (!trimmed || trimmed === ASTROID_SECRET_PLACEHOLDER) return undefined;
  return { id: trimmed };
}
