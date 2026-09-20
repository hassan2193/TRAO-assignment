"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Kit } from "@/lib/types";

export function SchedulePanel({ kitId, kit, onUpdated }: { kitId: string; kit: Kit; onUpdated: (kit: Kit) => void }) {
  const [days, setDays] = useState(kit.schedule.days_available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questionById = new Map(kit.questions.map((q) => [q.id, q]));

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const { kit: updated } = await api.post<{ kit: Kit }>(`/api/kits/${kitId}/regenerate/schedule`, { days });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rebuild the schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="days" className="label">
            Days available
          </label>
          <input
            id="days"
            type="number"
            min={1}
            max={365}
            className="input w-28"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </div>
        <button type="button" className="btn-secondary" onClick={regenerate} disabled={busy}>
          {busy ? "Rebuilding..." : "Rebuild schedule"}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        {kit.schedule.days.map((day) => (
          <div key={day.day} className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Day {day.day}</h3>
              <span className="text-sm text-slate-500">{day.minutes} min</span>
            </div>
            <p className="text-sm text-slate-600">{day.focus}</p>
            {day.question_ids.length > 0 ? (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                {day.question_ids.map((qid) => (
                  <li key={qid}>{questionById.get(qid)?.prompt ?? qid}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Review day — no new questions scheduled.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
