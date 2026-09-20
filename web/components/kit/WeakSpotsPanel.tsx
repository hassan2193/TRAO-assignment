"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { WeakSpotsReport } from "@/lib/types";

export function WeakSpotsPanel({ kitId }: { kitId: string }) {
  const [report, setReport] = useState<WeakSpotsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ report: WeakSpotsReport }>(`/api/kits/${kitId}/weak-spots`)
      .then((data) => setReport(data.report))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the weak spots report."));
  }, [kitId]);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!report) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="card bg-brand-50">
        <p className="text-sm text-slate-800">{report.recommendation}</p>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-900">Weak requirements</h3>
        {report.weakRequirements.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing flagged yet — keep practicing to get a signal.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {report.weakRequirements.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-800">
                  {r.text} <span className="text-xs font-normal text-slate-400">({r.priority})</span>
                </span>
                <span className="text-slate-500">{r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-900">Low-confidence flashcards</h3>
        {report.weakFlashcards.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No low-confidence cards recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {report.weakFlashcards.map((f) => (
              <li key={f.id}>{f.front}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
