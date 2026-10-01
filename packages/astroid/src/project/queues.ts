// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The commerce queue's names, as the site's `wrangler.jsonc` declares them.
//
// The generated worker tells a dead-letter batch from an ordinary one by
// comparing `batch.queue` with a constant. Deriving that constant from the
// project key restated a name `wrangler.jsonc` already owns, and a site whose
// queues predate its key never matched it: dead letters went uncaptured, and a
// site that consumed its dead-letter queue ran each one through the main
// handler again. So the name comes from `wrangler.jsonc`, and the key-derived
// names are only what a new scaffold writes there.

import type { AstroidConfig } from "../config.js";
import { AstroidConfigError } from "../errors.js";
import { ASTROID_QUEUE_BINDING, astroidUsesQueues } from "../queues/messages.js";
import { parseJsonc, type PreviewsFindings } from "./previews.js";

/** The commerce queue's names in a `wrangler.jsonc`. */
export interface AstroidWranglerQueues {
  /** The queue the `COMMERCE_QUEUE` producer sends to, or `null` when no producer binds it. */
  queue: string | null;
  /** The `dead_letter_queue` of that queue's consumer, or `null` when it names none. */
  deadLetterQueue: string | null;
  /** Every queue this Worker consumes, in the order `wrangler.jsonc` lists them. */
  consumers: string[];
}

interface WranglerQueuesBlock {
  queues?: {
    producers?: { queue?: string; binding?: string }[];
    consumers?: { queue?: string; dead_letter_queue?: string }[];
  };
}

/**
 * Read the commerce queue's names from `wrangler.jsonc` text. Only the top-level
 * `queues` block counts, because that's the one the deployed Worker consumes.
 *
 * Throws {@link AstroidConfigError} when the text doesn't parse, rather than
 * falling back to a default name: a guessed name is the silent mismatch this
 * reader exists to prevent.
 */
export function astroidWranglerQueues(wrangler: string): AstroidWranglerQueues {
  let parsed: WranglerQueuesBlock;
  try {
    parsed = parseJsonc(wrangler) as WranglerQueuesBlock;
  } catch (err) {
    throw new AstroidConfigError(
      `wrangler.jsonc doesn't parse, so Astroid can't read its queue names (${(err as Error).message}).`,
    );
  }
  const producers = parsed?.queues?.producers ?? [];
  const consumers = parsed?.queues?.consumers ?? [];
  const queue = producers.find((p) => p.binding === ASTROID_QUEUE_BINDING)?.queue ?? null;
  const deadLetterQueue =
    (queue && consumers.find((c) => c.queue === queue)?.dead_letter_queue) || null;
  return {
    queue,
    deadLetterQueue,
    consumers: consumers.flatMap((c) => (c.queue ? [c.queue] : [])),
  };
}

/** The dead-letter queue name the generated `src/worker.ts` compares batches with. */
const DEAD_LETTER_CONSTANT = /^const DEAD_LETTER_QUEUE = ("(?:[^"\\]|\\.)*");$/m;

/**
 * `astroid doctor`'s check on the commerce queue's dead-letter routing. It
 * compares `wrangler.jsonc` with the generated worker on disk, so it names the
 * cause of a mismatch that the freshness check reports only as stale.
 *
 * - An error when the worker's `DEAD_LETTER_QUEUE` isn't the queue
 *   `wrangler.jsonc` routes failures to, because no dead letter is captured.
 * - A warning when the dead-letter queue has no consumer, because its messages
 *   wait there unseen until the queue drops them.
 * - A warning when the commerce queue names no dead-letter queue, because a
 *   message that fails every retry is dropped.
 *
 * `worker` is the text of `src/worker.ts`, or `null` when it's missing. Empty
 * findings when the config uses no queue, when `wrangler.jsonc` doesn't parse,
 * or when it binds no `COMMERCE_QUEUE` producer: doctor reports those elsewhere.
 */
export function checkWranglerQueues(
  config: AstroidConfig,
  wrangler: string,
  worker: string | null,
): PreviewsFindings {
  const findings: PreviewsFindings = { ok: [], errors: [], warnings: [] };
  if (!astroidUsesQueues(config)) return findings;
  let names: AstroidWranglerQueues;
  try {
    names = astroidWranglerQueues(wrangler);
  } catch {
    return findings;
  }
  const { queue, deadLetterQueue, consumers } = names;
  if (!queue) return findings;

  if (!deadLetterQueue) {
    findings.warnings.push(
      `wrangler.jsonc's consumer for the \`${queue}\` queue names no \`dead_letter_queue\`, ` +
        "so a message that fails every retry is dropped unseen. Add one, create it with " +
        "`wrangler queues create`, and give it a consumer.",
    );
  } else if (consumers.includes(deadLetterQueue)) {
    findings.ok.push(`wrangler: dead-letter queue \`${deadLetterQueue}\` has a consumer`);
  } else {
    findings.warnings.push(
      `wrangler.jsonc routes the \`${queue}\` queue's failures to \`${deadLetterQueue}\`, but ` +
        "nothing consumes it, so a dead letter is never recorded as an incident. Add " +
        `{ "queue": ${JSON.stringify(deadLetterQueue)}, "max_batch_size": 10, "max_retries": 0 } ` +
        "to `queues.consumers`.",
    );
  }

  if (worker === null) return findings;
  const match = DEAD_LETTER_CONSTANT.exec(worker);
  const generated = match ? (JSON.parse(match[1]) as string) : null;
  if (generated === deadLetterQueue) {
    if (generated) {
      findings.ok.push(`src/worker.ts captures dead letters from \`${generated}\``);
    }
  } else if (generated && deadLetterQueue) {
    findings.errors.push(
      `src/worker.ts captures dead letters from \`${generated}\`, but wrangler.jsonc routes ` +
        `the \`${queue}\` queue's failures to \`${deadLetterQueue}\`, so no dead letter is ` +
        "captured. Run `astroid generate`.",
    );
  } else if (deadLetterQueue) {
    findings.errors.push(
      `src/worker.ts doesn't capture dead letters, but wrangler.jsonc routes the \`${queue}\` ` +
        `queue's failures to \`${deadLetterQueue}\`. Run \`astroid generate\`.`,
    );
  } else {
    findings.errors.push(
      `src/worker.ts captures dead letters from \`${generated}\`, but wrangler.jsonc names ` +
        `no dead-letter queue for \`${queue}\`. Run \`astroid generate\`.`,
    );
  }
  return findings;
}
