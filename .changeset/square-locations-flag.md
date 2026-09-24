---
"create-astroid": minor
---

`--square-locations <single|multi>` scaffolds a multi-merchant Square store directly.

**What changed.** `commerce.square.locations: "multi"` has been in `astroidjs` for a while (the location comes from the request host, not `SQUARE_LOCATION_ID`), but `create-astroid` had no way to ask for it. The checkout route is scaffold-once, so a store that wanted it had to scaffold single-location, edit `astroid.config.ts`, delete `src/pages/api/checkout.ts` and `src/components/SquareCard.astro`, and run `astroid generate`. Now `pnpm create astroid --commerce square --square-locations multi` writes the multi-merchant checkout route and card input, and records `square: { locations: "multi" }` in `astroid.config.ts`, so `astroid doctor` stops flagging a `SQUARE_LOCATION_ID` the project must not have.

**What you have to do.** Nothing, for an existing project. The flag needs `--commerce square` and exits with an error without it, rather than scaffolding a single-location route a multi-merchant store would silently charge through. The generated `resolveLocationId` refuses every checkout until you map your hosts to Square location ids — deliberately, so an unwired store takes no money rather than the wrong money.
