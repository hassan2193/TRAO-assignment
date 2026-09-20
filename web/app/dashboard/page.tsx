"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { api, ApiError } from "@/lib/api";
import type { KitSummary } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ kits: KitSummary[] }>("/api/kits");
      setKits(data.kits);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your kits.");
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // Poll while any kit is still generating so status updates without a
  // manual refresh.
  useEffect(() => {
    if (!kits?.some((k) => k.status === "generating")) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [kits, load]);

  async function onDelete(id: string) {
    if (!confirm("Delete this kit? This cannot be undone.")) return;
    await api.delete(`/api/kits/${id}`);
    setKits((prev) => prev?.filter((k) => k.id !== id) ?? null);
  }

  if (authLoading || !user) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Your kits</h1>
        <Link href="/kits/new" className="btn-primary">
          New kit
        </Link>
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {kits === null && !error && <p className="mt-6 text-slate-500">Loading your kits…</p>}

      {kits !== null && kits.length === 0 && (
        <div className="mt-8 card text-center">
          <p className="text-slate-600">You haven&apos;t created any kits yet.</p>
          <Link href="/kits/new" className="btn-primary mt-4 inline-flex">
            Create your first kit
          </Link>
        </div>
      )}

      {kits !== null && kits.length > 0 && (
        <ul className="mt-6 space-y-3">
          {kits.map((kit) => (
            <li key={kit.id} className="card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/kits/${kit.id}`} className="truncate font-medium text-slate-900 hover:underline focus-ring rounded">
                    {kit.role || "Untitled role"}
                  </Link>
                  <StatusBadge status={kit.status} />
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {kit.company ?? "Company research pending"} · {kit.days} day{kit.days === 1 ? "" : "s"} to prepare
                </p>
                {kit.status === "failed" && kit.error && (
                  <p className="mt-1 text-sm text-red-600">{kit.error.message}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`/kits/${kit.id}`} className="btn-secondary">
                  Open
                </Link>
                <button type="button" className="btn-danger" onClick={() => onDelete(kit.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
