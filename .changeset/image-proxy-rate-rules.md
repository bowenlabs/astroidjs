---
"astroidjs": minor
---

A default rate rule for image resize proxies. Each request to a proxy such as `defineImageProxy` from `louise-toolkit/media` is an edge resize billed to the zone, and when an allowed host is a shared bucket, as Square's catalog images are, a client can ask for an endless supply of sources. No default rule covered the route, because Astroid can't see where a site mounts its proxy.

- **New option:** `security.imageProxies`, the paths where the site mounts an image proxy, such as `["/api/img/square"]`. It sits under `security` so an app with no editor can set it too.
- **The rule:** `astroidRateRules` adds a `GET` rule named `image-proxy:<path>` for each path, at 1,000 requests per address per 10 minutes. That's about twenty first visits to a page of 50 images, which the browser then caches. Like every rule, it also limits the path's slashed spelling, and a rule in `security.rateRules` for the same path wins.
- **Validation:** `defineAstroid` refuses a path that isn't absolute, is `/`, has a trailing slash, or is listed twice, since a rule for it would never match.

The limit is loose. It counts in KV like every default rule, so the requests one page view sends at once mostly read the same count, and a KV failure lets a request through. It bounds a sustained abuser, not a single page view. Two Workers that share a KV namespace share the budget, as they do for every default rule.

**What to do:** list your image proxy paths in `security.imageProxies`. If you wrote a rate rule for a proxy path yourself, you can remove it and rely on the default, or keep it to set your own budget or a name of its own.
