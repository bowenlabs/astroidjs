// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The media base the running Worker serves from, for the checks that can't read
// a request's `env`.
//
// The page sanitizers and the settings action are built once, from the config,
// and drizzle-kit loads the schema that builds them outside a Worker. So they
// can't take `env.MEDIA_URL` the way the generated routes do. Left on the fixed
// `deploy.mediaBase`, a staging Preview, which serves media from its own
// `/media`, drops every image uploaded on it as a hotlink.
//
// So the generated worker records `MEDIA_URL` once, at startup, and these checks
// read it when they run. That's safe as module state because a Worker isolate
// runs one deployment, and `MEDIA_URL` is fixed per deployment: production's
// isolates hold production's base, and a Preview's hold the Preview's.

import type { AstroidConfig } from "../config.js";

let runtimeMediaBase: string | undefined;

/**
 * Record the running deployment's media base, `vars.MEDIA_URL`. The generated
 * worker calls this at startup; an empty or absent value leaves the config's
 * base in effect.
 */
export function setAstroidMediaBase(base: string | undefined): void {
  const trimmed = base?.replace(/\/+$/, "");
  runtimeMediaBase = trimmed ? trimmed : undefined;
}

/**
 * The media base a write is checked against: the running deployment's when the
 * worker recorded one, else `deploy.mediaBase`, else `/media`. Call it when the
 * check runs, not when it's built.
 */
export function astroidMediaBase(config: AstroidConfig): string {
  return runtimeMediaBase ?? (config.deploy?.mediaBase ?? "/media").replace(/\/+$/, "");
}
