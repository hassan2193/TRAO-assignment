import type { Response } from "express";
import { KitModel, type KitDocument } from "../models/Kit.js";
import { validateKit } from "../validation/kitSchema.js";

/**
 * Loads a kit and enforces ownership in one place, so every route that
 * touches a kit gets the same "not found vs not yours" behaviour (both
 * return 404, never leaking whether a kit id exists for another user).
 */
export async function loadOwnedKit(userId: string, kitId: string): Promise<KitDocument | null> {
  const kit = await KitModel.findById(kitId);
  if (!kit || kit.userId.toString() !== userId) return null;
  return kit;
}

export class InvalidKitStateError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`Edit would leave the kit in an invalid state: ${errors.join("; ")}`);
    this.errors = errors;
  }
}

/**
 * Every builder mutation (edit/add/delete/reorder/regenerate) goes through
 * this before hitting the database. The initial generation pipeline
 * validates the kit it produces (pipeline/orchestrator.ts); this is the
 * same safety net for every edit made afterwards, so a bug in a mutation
 * handler can never silently persist a structurally invalid kit (a
 * dangling requirement/question reference, a duplicate id, etc.).
 */
export async function saveValidatedKit(kit: KitDocument): Promise<void> {
  const result = validateKit(kit.kit);
  if (!result.valid) {
    throw new InvalidKitStateError(result.errors);
  }
  kit.markModified("kit");
  await kit.save();
}

/**
 * Sends the nested Appendix A kit content — never the KitDocument wrapper
 * (`{_id, userId, status, kit, warnings, ...}`) that `kit` actually is.
 *
 * Every builder mutation endpoint (edit/add/delete/reorder/regenerate)
 * responds through this. The frontend types every one of those calls as
 * `Promise<{ kit: Kit }>` and merges the result straight into its local
 * `record.kit` — if a route ever responds with the raw KitDocument instead
 * (`res.json({ kit })` where `kit` is the mongoose document), the nested
 * Appendix A content ends up one level too deep at `record.kit.kit`, so
 * `record.kit.role` — and every other top-level field — silently becomes
 * `undefined` while `record.kit` itself stays a truthy object. That's a
 * real bug this route shape caused in production: `record.kit` not being
 * null doesn't mean its shape is right, and no amount of optional chaining
 * on the frontend fixes a contract mismatch at the source.
 *
 * `GET /api/kits/:id` is the one deliberate exception — it's meant to
 * return the full document (status, progress log, etc.) as `KitRecord`, so
 * it sends `{ kit }` directly rather than going through this helper.
 */
export function respondWithKit(res: Response, kit: KitDocument, extra: Record<string, unknown> = {}, status = 200): void {
  res.status(status).json({ kit: kit.kit, ...extra });
}
