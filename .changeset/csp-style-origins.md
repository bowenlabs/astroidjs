---
"astroidjs": patch
---

CSP: `style-src` now carries module and config `style` origins. Square's Web Payments SDK (1.85+) injects `card-wrapper.css` from its CDN into the host page, and the fixed `'self' 'unsafe-inline'` blocked it, so `card.attach()` rejected and the card form never mounted. Square commerce now adds `sandbox.web.squarecdn.com` + `web.squarecdn.com` to `style-src`, and `security.cspOrigins.style` lets a site add its own. The origin data moved to a Worker-safe module (`security/csp-origins`) so the middleware generator and `astroidSecurity` read the same set.
