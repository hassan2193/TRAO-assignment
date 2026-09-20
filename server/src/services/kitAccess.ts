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
