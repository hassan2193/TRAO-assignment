import { KitModel, type KitDocument } from "../models/Kit.js";

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
