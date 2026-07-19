// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `defineWorkflow` — staged, audited pipelines.
//
// The shape this generalizes is ghostfire.coffee's production floor, and the
// framing correction in #256 is the important part: despite the name "order
// tracker", it is NOT queue- or Durable-Object-driven. It is a synchronous SSR
// + D1 state machine — an integer `stage` column advanced by sign-off rows,
// where "liveness" is an email plus a page reload. That maps to a workflow
// module, distinct from the queues module and from #71's realtime DO. If live
// push is wanted later it layers on top; it is not required for the pattern.
//
// The domain (coffee production) is site-specific; the mechanism is not.
// Fulfillment, onboarding, approval chains, and support-ticket flows are all
// the same four things:
//
//   1. an ordered list of stages, and one integer saying which is in progress;
//   2. exactly one audit row per completed stage — who, when, and what they
//      recorded;
//   3. an advance that is safe when two operators press the button at once;
//   4. a per-stage side-effect hook (issue the invoice on packaging).

import { AstroidConfigError } from "../errors.js";

/** One stage in the pipeline. */
export interface WorkflowStage {
  /** Stable key, used in generated code and audit rows. */
  key: string;
  /** What an operator reads. */
  label: string;
}

/** One field an operator fills in when signing off a stage. */
export interface WorkflowField {
  key: string;
  label: string;
  placeholder?: string;
}

export interface WorkflowConfig {
  /**
   * Base name for the generated tables and routes — `"orders"` gives an
   * `orders.stage` column, an `orders_signoffs` audit table, and
   * `/api/orders/advance`.
   */
  key: string;
  /** The stages, in order. A bare string is shorthand for `{ key, label }`. */
  stages: readonly (string | WorkflowStage)[];
  /**
   * Per-stage fields recorded on sign-off, keyed by stage key. A stage with no
   * entry records only actor + timestamp.
   *
   * These are the "specs" in the reference — brew ratio, water activity. They
   * are stored as a JSON blob on the audit row rather than as columns, because
   * they are documentation of what happened, not something the pipeline
   * branches on, and every stage wants a different set.
   */
  stationFields?: Record<string, WorkflowField[]>;
  /**
   * Emit an override log table. Every out-of-band move — sending an item back a
   * stage, skipping one — is recorded with the actor's initials. Default true:
   * a pipeline you can override without a trace is one nobody trusts.
   */
  overrides?: boolean;
}

/** Normalized stage list. */
export function workflowStages(config: WorkflowConfig): WorkflowStage[] {
  return config.stages.map((stage) =>
    typeof stage === "string" ? { key: stage, label: stage } : stage,
  );
}

/** The audit table's name for a workflow. */
export const workflowAuditTable = (config: WorkflowConfig) => `${config.key}_signoffs`;
/** The override log's name, or null when overrides are off. */
export const workflowOverrideTable = (config: WorkflowConfig) =>
  config.overrides === false ? null : `${config.key}_override_log`;

/**
 * Define a staged workflow.
 *
 * ```ts
 * export const fulfillment = defineWorkflow({
 *   key: "orders",
 *   stages: ["received", "picked", "packed", "shipped"],
 *   stationFields: { packed: [{ key: "weight", label: "Package weight" }] },
 * });
 * ```
 *
 * Validated here rather than at generation, so a malformed pipeline fails at
 * config load with a message naming the problem.
 */
export function defineWorkflow(config: WorkflowConfig): WorkflowConfig {
  if (!config.key || !/^[a-z][a-z0-9_]*$/.test(config.key)) {
    throw new AstroidConfigError(
      `Workflow \`key\` must be a lowercase identifier (it names generated tables and routes); got ${JSON.stringify(config.key)}`,
    );
  }

  const stages = workflowStages(config);
  // Two stages is the floor: with one there is nothing to advance to, and the
  // whole module is an integer that only ever holds 0.
  if (stages.length < 2) {
    throw new AstroidConfigError(
      `Workflow ${JSON.stringify(config.key)} needs at least 2 stages; got ${stages.length}`,
    );
  }

  const seen = new Set<string>();
  for (const stage of stages) {
    if (!stage.key || !/^[a-z][a-z0-9_]*$/.test(stage.key)) {
      throw new AstroidConfigError(
        `Workflow stage keys must be lowercase identifiers; got ${JSON.stringify(stage.key)}`,
      );
    }
    // Duplicates would make `stationFields` ambiguous and an audit row's stage
    // key non-unique — both silent, both awful to debug later.
    if (seen.has(stage.key)) {
      throw new AstroidConfigError(
        `Workflow ${JSON.stringify(config.key)} has a duplicate stage ${JSON.stringify(stage.key)}`,
      );
    }
    seen.add(stage.key);
  }

  for (const stageKey of Object.keys(config.stationFields ?? {})) {
    if (!seen.has(stageKey)) {
      throw new AstroidConfigError(
        `Workflow ${JSON.stringify(config.key)} declares stationFields for an unknown stage ${JSON.stringify(stageKey)} (stages: ${[...seen].join(", ")})`,
      );
    }
  }

  return config;
}
