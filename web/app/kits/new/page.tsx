"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { api, ApiError } from "@/lib/api";
import type { KitSummary } from "@/lib/types";

interface RoleEntry {
  jd: string;
  companyUrl: string;
  days: number;
}

function emptyEntry(): RoleEntry {
  return { jd: "", companyUrl: "", days: 5 };
}

export default function NewKitPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<RoleEntry[]>([emptyEntry()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateEntry(index: number, patch: Partial<RoleEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry()]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function onFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("File must contain a JSON array");
      const parsedEntries: RoleEntry[] = parsed.map((item, i) => {
        const jd = item.jd ?? item.description ?? "";
        const companyUrl = item.companyUrl ?? item.company_url ?? "";
        const days = Number(item.days ?? 5);
        if (!jd || !companyUrl) throw new Error(`Entry ${i + 1} is missing jd/company_url`);
        return { jd, companyUrl, days: Number.isFinite(days) && days > 0 ? days : 5 };
      });
      if (parsedEntries.length === 0) throw new Error("File contained no entries");
      setEntries(parsedEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse that file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleaned = entries
      .map((entry) => ({ ...entry, jd: entry.jd.trim(), companyUrl: entry.companyUrl.trim() }))
      .filter((entry) => entry.jd && entry.companyUrl);

    if (cleaned.length === 0) {
      setError("Add at least one job description and company URL.");
      return;
    }

    setSubmitting(true);
    try {
      if (cleaned.length === 1) {
        const { kit } = await api.post<{ kit: KitSummary }>("/api/kits", cleaned[0]);
        await api.post(`/api/kits/${kit.id}/generate`);
        router.push(`/kits/${kit.id}`);
      } else {
        const { kits } = await api.post<{ kits: KitSummary[] }>("/api/kits/batch", { cases: cleaned });
        await Promise.all(kits.map((k) => api.post(`/api/kits/${k.id}/generate`).catch(() => undefined)));
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your kit(s). Please try again.");
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">New interview prep kit</h1>
      <p className="mt-1 text-sm text-slate-600">
        Paste a job description and the company&apos;s website. Preparing for more than one role? Add another below,
        or upload a JSON file of <code>{"{ jd, companyUrl, days }"}</code> entries.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        {entries.map((entry, index) => (
          <fieldset key={index} className="card space-y-4">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-semibold text-slate-800">Role {index + 1}</legend>
              {entries.length > 1 && (
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeEntry(index)}>
                  Remove
                </button>
              )}
            </div>

            <div>
              <label htmlFor={`jd-${index}`} className="label">
                Job description
              </label>
              <textarea
                id={`jd-${index}`}
                className="input min-h-[140px]"
                value={entry.jd}
                onChange={(e) => updateEntry(index, { jd: e.target.value })}
                placeholder="Paste the full job description here..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`url-${index}`} className="label">
                  Company website
                </label>
                <input
                  id={`url-${index}`}
                  type="text"
                  className="input"
                  value={entry.companyUrl}
                  onChange={(e) => updateEntry(index, { companyUrl: e.target.value })}
                  placeholder="https://company.com"
                />
              </div>
              <div>
                <label htmlFor={`days-${index}`} className="label">
                  Days until interview
                </label>
                <input
                  id={`days-${index}`}
                  type="number"
                  min={1}
                  max={365}
                  className="input"
                  value={entry.days}
                  onChange={(e) => updateEntry(index, { days: Number(e.target.value) })}
                />
              </div>
            </div>
          </fieldset>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" onClick={addEntry}>
            + Add another role
          </button>
          <label className="btn-secondary cursor-pointer">
            Upload JSON file
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onFileUpload} />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Starting generation..." : entries.length > 1 ? `Generate ${entries.length} kits` : "Generate kit"}
        </button>
      </form>
    </div>
  );
}
