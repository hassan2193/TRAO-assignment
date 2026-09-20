"use client";

import { useState } from "react";
import { EditableText } from "@/components/EditableText";
import { api, ApiError } from "@/lib/api";
import type { Kit } from "@/lib/types";

export function CompanyBriefPanel({
  kitId,
  kit,
  onUpdated,
}: {
  kitId: string;
  kit: Kit;
  onUpdated: (kit: Kit) => void;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePatch(patch: Partial<Kit["company_brief"]>) {
    const { kit: updated } = await api.patch<{ kit: Kit }>(`/api/kits/${kitId}`, { company_brief: patch });
    onUpdated(updated);
  }

  async function regenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const { kit: updated } = await api.post<{ kit: Kit }>(`/api/kits/${kitId}/regenerate/company`);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate the company brief.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">{kit.source.company || "Company"}</h2>
            <p className="text-sm text-slate-500">{kit.source.company_url}</p>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={regenerate} disabled={regenerating}>
            {regenerating ? "Re-researching..." : "Regenerate"}
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 space-y-3">
          <div>
            <span className="label">Summary</span>
            <EditableText
              label="company brief summary"
              multiline
              value={kit.company_brief.summary}
              onSave={(v) => savePatch({ summary: v })}
            />
          </div>
          <div>
            <span className="label">What they do</span>
            <EditableText
              label="what they do"
              multiline
              value={kit.company_brief.what_they_do}
              onSave={(v) => savePatch({ what_they_do: v })}
            />
          </div>
        </div>

        {kit.company_brief.sources.length > 0 ? (
          <div className="mt-4">
            <span className="label">Sources</span>
            <ul className="space-y-1 text-sm">
              {kit.company_brief.sources.map((src) => (
                <li key={src}>
                  <a href={src} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline break-all">
                    {src}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No pages were successfully retrieved from the company site — this brief is honest about knowing nothing
            verified, not filled in with guesses.
          </p>
        )}
      </div>
    </div>
  );
}
