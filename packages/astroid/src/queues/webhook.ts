// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The webhook receiver: verify → enqueue → return fast.
//
// All three sites wrote this route the same way, and the ordering is the part
// worth encoding. **Verify the HMAC over the raw body before parsing anything.**
// Not for style—parsing first means an unauthenticated caller can reach the
// JSON parser and everything downstream of it, and re-serializing a parsed body
// to check the signature is how signature checks quietly stop checking anything.
// So the raw text is read once, verified, and only then parsed.
//
// The other half is what the status code means to the sender. Every provider
// here retries on non-2xx, which makes the response the only backpressure signal
// available: a 5xx means "try again", a 4xx means "never again", and returning
// the wrong one either loses the event permanently or pins the provider in a
// retry loop. Each code below is chosen for what it tells the sender to do.

import type { AstroidQueueMessage } from "./messages.js";

/**
 * The queue producer surface used here—structural, so a real `Queue<T>`
 * binding satisfies it without astroid depending on the Workers types.
 *
 * `Promise<unknown>` rather than `Promise<void>`: Cloudflare's `Queue.send`
 * resolves to a `QueueSendResponse`, and a `void` return type would reject the
 * actual binding. Nothing here reads the value.
 */
export interface QueueProducer<T = AstroidQueueMessage> {
  send(message: T): Promise<unknown>;
}

/**
 * The queue binding when it's bound, and otherwise a stand-in producer that
 * runs `handler` on each message in the request.
 *
 * A staging Preview leaves the queue unbound, because a queue consumer can't
 * target a Preview (louise-toolkit ADR 0017), so every producer that sends
 * straight to the binding throws there. Send through this instead, with the
 * handler the queue consumer runs, and the same code works on both:
 *
 * ```ts
 * export const commerceQueue = (env: CloudflareEnv) =>
 *   astroidQueue(env.COMMERCE_QUEUE, (message) => handleQueueMessage(env, message));
 *
 * await commerceQueue(env).send({ kind: "catalog_refresh" });
 * ```
 *
 * It's a Preview fallback, not a production path. A message run inline lasts
 * only as long as the request, gets no retry and no dead-letter queue, and a
 * slow one holds the response open. The stand-in's `send` throws whatever the
 * handler throws, where a real `send` would have succeeded and left the failure
 * to the consumer. The binding always wins when it's there.
 */
export function astroidQueue<T = AstroidQueueMessage>(
  queue: QueueProducer<T> | null | undefined,
  handler: (message: T) => Promise<void>,
): QueueProducer<T> {
  if (queue) return queue;
  return {
    send: async (message) => {
      await handler(message);
    },
  };
}

export interface WebhookVerifyInput {
  /** The raw request body, exactly as received. */
  raw: string;
  headers: Headers;
  url: URL;
  /** The signing secret—already checked to be real by the caller. */
  secret: string;
}

export interface WebhookRouteOptions {
  /** Which integration this endpoint serves—carried into the message. */
  provider: string;
  /**
   * The signing secret, or `null` when unprovisioned. Read it with
   * `readModuleSecret` so a placeholder counts as absent.
   */
  secret: string | null;
  /** Signature check over the raw body—for example, `verifySquareSignature`. */
  verify: (input: WebhookVerifyInput) => boolean | Promise<boolean>;
  /**
   * The queue binding, or null/undefined when Queues aren't provisioned. Pass
   * {@link astroidQueue}'s producer to run the message in the request when the
   * binding is absent, such as on a staging Preview.
   */
  queue?: QueueProducer | null;
  /**
   * Run a message in the request instead, when `queue` is absent. Prefer
   * passing {@link astroidQueue}'s producer as `queue`, which covers every
   * producer in a site rather than this one route. A staging
   * Preview leaves the queue unbound, because a queue consumer can't target a
   * Preview (louise-toolkit ADR 0017), so without this every webhook a Preview
   * receives answers 503 and the provider retries it forever.
   *
   * Pass the same handler the queue consumer runs: `(message) =>
   * handleQueueMessage(env, message)`. Throwing answers 503, so the provider
   * redelivers, which is the retry the queue would have given it.
   *
   * It's a fallback, not an alternative: a sync that outlasts the provider's
   * delivery timeout reads to the provider as a failure, which is why
   * production enqueues. On staging, with a sandbox catalog, that's a fair
   * trade, and the queue wins whenever both are there.
   */
  inline?: (message: AstroidQueueMessage) => Promise<void>;
  /**
   * Pull the event type out of the parsed payload. Defaults to a `type` field;
   * override for providers that name it differently (Fourthwall's `testMode`
   * envelope, Stripe's nested object).
   */
  eventType?: (payload: unknown) => string;
  /**
   * Decide whether an event is worth queueing at all. Returning false acks the
   * delivery without enqueuing—the provider is satisfied and the consumer
   * isn't woken for an event nothing acts on.
   */
  accept?: (type: string, payload: unknown) => boolean;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Default event-type reader: a top-level `type` string. */
function defaultEventType(payload: unknown): string {
  const type = (payload as { type?: unknown })?.type;
  return typeof type === "string" ? type : "";
}

/**
 * Handle one inbound provider webhook.
 *
 * ```ts
 * export const POST: APIRoute = ({ request, url }) =>
 *   handleWebhook(request, url, {
 *     provider: "square",
 *     secret: await readModuleSecret(env.SQUARE_WEBHOOK_SECRET),
 *     queue: env.COMMERCE_QUEUE,
 *     verify: ({ raw, headers, url, secret }) =>
 *       verifySquareSignature(url.href, raw, headers.get("x-square-hmacsha256-signature"), secret),
 *   });
 * ```
 */
export async function handleWebhook(
  request: Request,
  url: URL,
  options: WebhookRouteOptions,
): Promise<Response> {
  // 503, not 500 or 200: the module is dormant, which is a temporary state a
  // deploy fixes. 5xx keeps the provider retrying, so events delivered during
  // the gap land once the secret is provisioned instead of being lost.
  if (!options.secret) return text("Webhook not configured", 503);

  const raw = await request.text();

  let valid = false;
  try {
    valid = await options.verify({ raw, headers: request.headers, url, secret: options.secret });
  } catch {
    valid = false;
  }
  // 401 is terminal on purpose. A signature that doesn't check out will never
  // check out on retry, and asking the provider to keep trying turns a
  // misconfiguration into a self-inflicted flood.
  if (!valid) return text("Invalid signature", 401);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Also terminal—a body that isn't JSON now won't become JSON later.
    return text("Invalid JSON", 400);
  }

  const type = (options.eventType ?? defaultEventType)(payload);
  if (options.accept && !options.accept(type, payload)) {
    return text("Ignored", 202);
  }

  const message: AstroidQueueMessage = {
    kind: "webhook",
    provider: options.provider,
    type,
    payload,
  };

  if (!options.queue) {
    if (!options.inline) return text("Queue not configured", 503);
    try {
      await options.inline(message);
    } catch {
      // Same contract as a failed send: the event is real, so ask for it again.
      return text("Processing failed", 503);
    }
    // 200, not 202: the work already happened.
    return text("Processed", 200);
  }

  try {
    await options.queue.send(message);
  } catch {
    // The signature was good, so this event is real and worth keeping. 503 asks
    // the provider to redeliver rather than dropping it.
    return text("Queue unavailable", 503);
  }

  // 202, not 200: the work hasn't happened yet, it's been accepted. That's the
  // entire point of enqueuing—the response returns before the consumer runs.
  return text("Accepted", 202);
}
