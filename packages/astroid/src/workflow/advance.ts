// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The guarded advance — the one piece of a staged pipeline that is genuinely
// hard to get right.
//
// Two operators standing at two stations both press "sign off" on the same job.
// A read-then-write advance runs the item forward two stages and writes two
// audit rows, and nobody notices until the numbers stop adding up. The fix is
// optimistic concurrency: make the write itself assert the stage it expected —
// `UPDATE … SET stage = ? WHERE id = ? AND stage = ?` — and treat "0 rows
// changed" as the conflict signal rather than checking first and hoping.
//
// ORDERING MATTERS, and the reference gets it wrong. ghostfire's floor route
// inserts the sign-off row and THEN runs the guarded update, so a double submit
// writes two audit rows even though only one advance lands. Here the guarded
// update goes first and the audit row is written only if it actually moved the
// item — so the audit table can't record work that didn't happen. The unique
// index the schema generator emits on `(entity_id, stage)` is the belt to that
// braces.

/** The D1 surface this needs. Structural, so a real `D1Database` fits and a
 *  test can pass a stub. */
export interface WorkflowDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
}

/** Who is advancing the item. */
export interface WorkflowActor {
  /** Short initials shown in the audit trail. Trimmed, upper-cased, capped. */
  initials: string;
  /** Optional account id, when the pipeline runs behind a portal. */
  userId?: string;
}

export type AdvanceResult =
  | {
      ok: true;
      /** The stage now in progress. Equals `stageCount` when the item is done. */
      stage: number;
      complete: boolean;
    }
  | {
      ok: false;
      /** Maps straight onto an HTTP status, so a route is a one-liner. */
      status: 404 | 409 | 422;
      error: string;
    };

export interface AdvanceOptions {
  db: WorkflowDatabase;
  /** Table holding the `stage` column. */
  table: string;
  /** Audit table — one row per completed stage. */
  auditTable: string;
  /** Primary key column on `table`. Default `"id"`. */
  idColumn?: string;
  /** Foreign key column on the audit table. Default `"<table singular>_id"`,
   *  which is why it's explicit here rather than guessed. */
  auditIdColumn: string;
  /** The item being advanced. */
  id: string | number;
  /**
   * The stage the caller believes is in progress. This is the whole guard: it
   * comes from the page the operator was looking at, so a stale page fails
   * instead of advancing something that already moved.
   */
  expectedStage: number;
  /** Total number of stages. Signing the last one completes the item. */
  stageCount: number;
  actor: WorkflowActor;
  /** Free-form recorded values for this stage, stored as JSON on the audit row. */
  specs?: { k: string; v: string }[];
}

/** Longest initials we store. Three is what a floor actually writes. */
const MAX_INITIALS = 3;
/** Caps on recorded specs, so one request can't write an unbounded blob. */
const MAX_SPECS = 24;
const MAX_SPEC_KEY = 60;
const MAX_SPEC_VALUE = 200;

/** Trim/normalize operator initials, or null when there aren't any. */
export function normalizeInitials(value: unknown): string | null {
  const initials = String(value ?? "")
    .trim()
    .toUpperCase()
    .slice(0, MAX_INITIALS);
  return initials || null;
}

/** Drop anything malformed from a caller-supplied spec list and bound it. An
 *  operator's notes are untrusted input like any other request body. */
export function normalizeSpecs(value: unknown): { k: string; v: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (s): s is { k: string; v: string } =>
        !!s && typeof s === "object" && typeof s.k === "string" && typeof s.v === "string",
    )
    .map((s) => ({ k: s.k.slice(0, MAX_SPEC_KEY), v: s.v.slice(0, MAX_SPEC_VALUE) }))
    .slice(0, MAX_SPECS);
}

/**
 * Advance one item by one stage, recording who did it.
 *
 * ```ts
 * const result = await advanceWorkflowStage({
 *   db: env.DB, table: "orders", auditTable: "orders_signoffs",
 *   auditIdColumn: "order_id", id, expectedStage, stageCount: 4,
 *   actor: { initials: "BB" }, specs,
 * });
 * return json(result, result.ok ? 200 : result.status);
 * ```
 *
 * Every failure is a status, never a throw: a conflict is an ordinary outcome
 * of two people working at once, not an exception.
 */
export async function advanceWorkflowStage(options: AdvanceOptions): Promise<AdvanceResult> {
  const {
    db,
    table,
    auditTable,
    idColumn = "id",
    auditIdColumn,
    id,
    expectedStage,
    stageCount,
    actor,
  } = options;

  const initials = normalizeInitials(actor.initials);
  if (!initials) return { ok: false, status: 422, error: "Initials are required to sign off." };

  if (!Number.isInteger(expectedStage) || expectedStage < 0 || expectedStage >= stageCount) {
    return { ok: false, status: 422, error: "That stage doesn't exist in this workflow." };
  }

  const next = expectedStage + 1;

  // The guard. `changes === 0` means the row is gone or someone else already
  // moved it — the two cases are told apart below, but only after the write,
  // so there is no window between the check and the update.
  const advanced = await db
    .prepare(`UPDATE ${table} SET stage = ? WHERE ${idColumn} = ? AND stage = ?`)
    .bind(next, id, expectedStage)
    .run();

  if ((advanced.meta?.changes ?? 0) === 0) {
    const current = await db
      .prepare(`SELECT stage FROM ${table} WHERE ${idColumn} = ?`)
      .bind(id)
      .first<{ stage: number }>();
    if (!current) return { ok: false, status: 404, error: "That item no longer exists." };
    return {
      ok: false,
      status: 409,
      // Naming the actual stage is what makes this recoverable: the operator
      // refreshes and sees where the job really is, rather than pressing again.
      error: `Someone else already moved this to stage ${current.stage} — refresh and try again.`,
    };
  }

  // Only now, with the advance committed, is the work real enough to record.
  const specs = normalizeSpecs(options.specs);
  await db
    .prepare(
      `INSERT INTO ${auditTable} (${auditIdColumn}, stage, specs, initials, actor_id, signed_at)` +
        ` VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      expectedStage,
      specs.length > 0 ? JSON.stringify(specs) : null,
      initials,
      actor.userId ?? null,
      Math.floor(Date.now() / 1000),
    )
    .run();

  return { ok: true, stage: next, complete: next >= stageCount };
}

export type OverrideAction = "back" | "skip";

export interface OverrideOptions extends Omit<AdvanceOptions, "specs" | "expectedStage"> {
  action: OverrideAction;
  /** Override log table. */
  overrideTable: string;
  /** Where the item is now, from the operator's page — the same staleness guard. */
  expectedStage: number;
  /** Optional station/context label recorded with the override. */
  station?: string;
}

/**
 * Move an item out of band — back a stage, or skip one — and log it.
 *
 * Sending an item BACK deletes the audit row for the stage being reopened, so
 * "a sign-off exists" keeps meaning "that stage is genuinely done". Leaving it
 * would make the audit trail claim work that was undone.
 */
export async function overrideWorkflowStage(options: OverrideOptions): Promise<AdvanceResult> {
  const {
    db,
    table,
    auditTable,
    overrideTable,
    idColumn = "id",
    auditIdColumn,
    id,
    action,
    expectedStage,
    stageCount,
    actor,
    station,
  } = options;

  const initials = normalizeInitials(actor.initials);
  if (!initials) return { ok: false, status: 422, error: "Initials are required to override." };

  const target = action === "back" ? expectedStage - 1 : expectedStage + 1;
  if (target < 0) return { ok: false, status: 422, error: "This is already the first stage." };
  if (target > stageCount) return { ok: false, status: 422, error: "This is already complete." };

  const moved = await db
    .prepare(`UPDATE ${table} SET stage = ? WHERE ${idColumn} = ? AND stage = ?`)
    .bind(target, id, expectedStage)
    .run();

  if ((moved.meta?.changes ?? 0) === 0) {
    const current = await db
      .prepare(`SELECT stage FROM ${table} WHERE ${idColumn} = ?`)
      .bind(id)
      .first<{ stage: number }>();
    if (!current) return { ok: false, status: 404, error: "That item no longer exists." };
    return {
      ok: false,
      status: 409,
      error: `Someone else already moved this to stage ${current.stage} — refresh and try again.`,
    };
  }

  if (action === "back") {
    await db
      .prepare(`DELETE FROM ${auditTable} WHERE ${auditIdColumn} = ? AND stage = ?`)
      .bind(id, target)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO ${overrideTable} (${auditIdColumn}, action, initials, station, at)` +
        ` VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, action, initials, station ?? null, Math.floor(Date.now() / 1000))
    .run();

  return { ok: true, stage: target, complete: target >= stageCount };
}
