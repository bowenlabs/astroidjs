// GET /api/v1—the root of this app's versioned JSON API.
//
// Every route the app's clients call lives under /api/v1: the web app first,
// and a native client later against the same routes. So each one answers JSON,
// reads its input from the body or the URL (never an HTML form post), and
// needs no browser-only header. A breaking change is a new prefix, /api/v2,
// beside this one, because a native client on a customer's phone updates on
// its own schedule.
//
// The generated middleware rate-limits every POST under /api/v1 per client IP.
// Add a tighter rule for one route with `security.rateRules` in
// astroid.config.ts.
import type { APIRoute } from "astro";
import astroidConfig from "../../../../astroid.config.js";

export const prerender = false;

export const GET: APIRoute = () =>
  Response.json(
    { name: astroidConfig.theme.name, version: "v1" },
    { headers: { "cache-control": "no-store" } },
  );
