---
"astroidjs": minor
---

**Checkout refusals now list every stale line, and Square's CSP comes from the toolkit.**

`verifyCheckout` is rebuilt on `cartIssues` from `louise-toolkit/commerce`. A refused cart used to name only its first problem, so a customer fixed one line, retried, and was refused over the next. The refusal now carries `issues`: every stale line in cart order, with the live price for a changed one. `reason` is still the first problem, so existing branches on it keep working. Pass `issues` to `repairCart` (`louise-toolkit/commerce`) to fix the whole cart in one step. The scaffolded checkout route returns them in its 409 body.

`message` changes when more than one line is stale: a plural sentence for several lines with the same problem ("Some items in your cart are no longer available."), and "Your cart changed since you filled it — please review it." for a mix. If you match on `message` text, match on `reason` instead.

Square's CSP origins now come from `squareWebPaymentsCsp()` instead of a copy kept here. The copy had fallen behind: it was missing Square's Sentry ingest (`connect-src`), which put a CSP violation on the console of every checkout, and Cash Sans's font host (`font-src`), which blocked the font `card-wrapper.css` loads. Nothing to do: rebuild and both are allowed.
