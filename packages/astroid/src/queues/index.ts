// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.

export {
  ASTROID_ALSO_REFRESH_DEGRADED,
  astroidQueueHandler,
  type QueueHandlerOptions,
} from "./consumer.js";
export {
  affectsCatalog,
  ASTROID_DEFAULT_CRON,
  ASTROID_HEALTH_CRON,
  ASTROID_QUEUE_BINDING,
  ASTROID_QUEUE_RETRY_DELAY,
  type AstroidQueueMessage,
  astroidCommercePipeline,
  astroidCron,
  astroidCrons,
  astroidQueueNames,
  astroidUsesQueues,
  type CatalogRefreshMessage,
  type WebhookMessage,
} from "./messages.js";
export {
  generateAstroidEnvBindings,
  generateAstroidQueueSeam,
  generateAstroidWebhookRoute,
  generateAstroidWebhookRoutes,
} from "./scaffold.js";
export {
  astroidQueue,
  handleWebhook,
  type QueueProducer,
  type WebhookRouteOptions,
  type WebhookVerifyInput,
} from "./webhook.js";
