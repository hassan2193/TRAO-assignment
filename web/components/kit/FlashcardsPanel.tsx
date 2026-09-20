"use client";

import { useState } from "react";
import { EditableText } from "@/components/EditableText";
import { api, ApiError } from "@/lib/api";
import type { Flashcard, Kit } from "@/lib/types";

const STATE_STYLES: Record<string, string> = {
  generated: "bg-slate-100 text-slate-500",
  edited: "bg-blue-50 text-blue-700",
  pinned: "bg-violet-50 text-violet-700",
};

export function FlashcardsPanel({ kitId, kit, onUpdated }: { kitId: string; kit: Kit; onUpdated: (kit: Kit) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function refreshFrom(promise: Promise<{ kit: Kit }>) {
    try {
      const { kit: updated } = await promise;
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That action failed. Please try again.");
    }
  }

  function patchCard(id: string, patch: Partial<Flashcard>) {
    return refreshFrom(api.patch<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/${id}`, patch));
  }

  function deleteCard(id: string) {
    return refreshFrom(api.delete<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/${id}`));
  }

  function addCard() {
    return refreshFrom(
      api.post<{ kit: Kit }>(`/api/kits/${kitId}/flashcards`, {
        front: "New flashcard — click to edit",
        back: "",
        requirement_ids: [],
      })
    );
  }

  function move(card: Flashcard, direction: -1 | 1) {
    const idx = kit.flashcards.findIndex((f) => f.id === card.id);
    const swapWith = kit.flashcards[idx + direction];
    if (!swapWith) return;
    const order = kit.flashcards.map((f) => f.id);
    [order[idx], order[idx + direction]] = [order[idx + direction], order[idx]];
    return refreshFrom(api.post<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/reorder`, { orderedIds: order }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Flashcards ({kit.flashcards.length})</h2>
        <button type="button" className="btn-primary" onClick={addCard}>
          + Add flashcard
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {kit.flashcards.map((card, idx) => (
          <li key={card.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_STYLES[card.state]}`}>{card.state}</span>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label="Move up" className="btn-secondary px-2 py-1" disabled={idx === 0} onClick={() => move(card, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className="btn-secondary px-2 py-1"
                  disabled={idx === kit.flashcards.length - 1}
                  onClick={() => move(card, 1)}
                >
                  ↓
                </button>
                <button type="button" className="btn-danger px-2 py-1" onClick={() => deleteCard(card.id)}>
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              <div>
                <span className="text-xs font-medium text-slate-500">Front</span>
                <EditableText label="front" value={card.front} onSave={(v) => patchCard(card.id, { front: v })} multiline />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Back</span>
                <EditableText label="back" value={card.back} onSave={(v) => patchCard(card.id, { back: v })} multiline />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {kit.flashcards.length === 0 && <p className="text-sm text-slate-500">No flashcards yet.</p>}
    </div>
  );
}
