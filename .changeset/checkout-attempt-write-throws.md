---
"astroidjs": patch
---

`checkoutAttempts().write()` no longer throws when the KV binding is missing or its `put` throws before returning a promise. It logs `[astroid:commerce] checkout attempt write failed` and resolves, as it already did for a `put` that rejects.

The route writes the record after the payment succeeds. A synchronous throw from `put`, for example with `kv` undefined in an environment that has no `RL` binding, escaped `write()`, so the route answered a paid checkout with a 502 and told the customer the payment couldn't be confirmed. Now the payment's result is returned and only the record is lost, which is what `write()` already documented.

Nothing to change in your site. If you wrapped `attempts.write(...)` in your own `try` to guard against this, you can remove the wrapper.
