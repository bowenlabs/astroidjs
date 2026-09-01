# Architecture decision records

Decisions about Astroid that are worth the reasoning, not just the diff. One file
per decision, numbered, amended rather than rewritten when reality moves.

## Numbering

Numbers are **shared with
[bowenlabs/louise-toolkit](https://github.com/bowenlabs/louise-toolkit/tree/main/docs/adr)**,
not restarted here. Astroid grew inside that repository, and seven ADRs there
cite these by number — renumbering on the way out would break every citation
without producing an error anywhere.

So 0003 is 0003 in both places: here in full, there as a tombstone pointing here.
A new Astroid decision takes the next free number **across both repos**. Check
both indexes before claiming one.

## Records

|                                                |                                              |
| ---------------------------------------------- | -------------------------------------------- |
| [0003](0003-astroid-component-primitive-dx.md) | Component-primitive DX: typed `.astro` props |

## What stayed in louise-toolkit

[ADR 0001](https://github.com/bowenlabs/louise-toolkit/blob/main/docs/adr/0001-opinionated-astro-cloudflare.md)
— _opinionated Astro-on-Cloudflare, fully typed_ — reads like an Astroid decision
and is not one. Its rule is "framework-agnostic where it's free; opinionated where
it's expensive", and the split is that rule being **applied**: the core turned out
to be free to keep agnostic, so it did, and the expensive opinions moved here. It
is foundational to louise's own architecture and cited by six of its other ADRs,
so it stays there and is amended to record how the split resolved it.
