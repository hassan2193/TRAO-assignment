"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Flashcard, Kit } from "@/lib/types";

interface SessionCard extends Flashcard {
  lastConfidence: number | null;
  timesReviewed: number;
  covered: boolean;
}

interface Summary {
  total: number;
  covered: number;
  notCovered: number;
  averageConfidence: number | null;
}

const CONFIDENCE_LABELS: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };

export function PracticePanel({ kitId, kit }: { kitId: string; kit: Kit }) {
  const [session, setSession] = useState<SessionCard[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ flashcards }, { summary: s }] = await Promise.all([
        api.get<{ flashcards: SessionCard[] }>(`/api/kits/${kitId}/practice/session`),
        api.get<{ summary: Summary }>(`/api/kits/${kitId}/practice/summary`),
      ]);
      setSession(flashcards);
      setSummary(s);
      setIndex(0);
      setRevealed(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load practice session.");
    }
  }, [kitId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (kit.flashcards.length === 0) {
    return <p className="text-sm text-slate-500">Add some flashcards first — practice mode needs cards to drill.</p>;
  }

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!session || !summary) return <p className="text-sm text-slate-500">Loading practice session…</p>;

  const card = session[index];

  async function recordConfidence(confidence: 1 | 2 | 3) {
    await api.post(`/api/kits/${kitId}/practice/${card.id}`, { confidence });
    if (index + 1 < session!.length) {
      setIndex(index + 1);
      setRevealed(false);
    } else {
      await load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          Covered {summary.covered} / {summary.total} cards
        </span>
        {summary.averageConfidence !== null && <span>Average confidence: {summary.averageConfidence.toFixed(1)} / 3</span>}
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Restart session
        </button>
      </div>

      {!card ? (
        <p className="text-sm text-slate-500">Session complete — nice work.</p>
      ) : (
        <div className="card mx-auto max-w-lg text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Card {index + 1} of {session.length}
            {card.lastConfidence !== null && ` · last confidence: ${CONFIDENCE_LABELS[card.lastConfidence]}`}
          </p>
          <p className="mt-4 whitespace-pre-wrap text-lg font-medium text-slate-900">{card.front}</p>

          {revealed ? (
            <>
              <p className="mt-4 whitespace-pre-wrap text-slate-700">{card.back || "(no answer recorded)"}</p>
              <div className="mt-6 flex justify-center gap-2">
                {[1, 2, 3].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="btn-secondary"
                    onClick={() => recordConfidence(c as 1 | 2 | 3)}
                  >
                    {CONFIDENCE_LABELS[c]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="btn-primary mt-6" onClick={() => setRevealed(true)}>
              Reveal answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
