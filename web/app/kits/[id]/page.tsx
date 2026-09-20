"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { api, ApiError } from "@/lib/api";
import type { Kit, KitRecord } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressSteps } from "@/components/ProgressSteps";
import { Tabs } from "@/components/Tabs";
import { CompanyBriefPanel } from "@/components/kit/CompanyBriefPanel";
import { RolePanel } from "@/components/kit/RolePanel";
import { QuestionsPanel } from "@/components/kit/QuestionsPanel";
import { FlashcardsPanel } from "@/components/kit/FlashcardsPanel";
import { SchedulePanel } from "@/components/kit/SchedulePanel";
import { PracticePanel } from "@/components/kit/PracticePanel";
import { WeakSpotsPanel } from "@/components/kit/WeakSpotsPanel";

export default function KitDetailPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const kitId = params.id;

  const [record, setRecord] = useState<KitRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { kit } = await api.get<{ kit: KitRecord }>(`/api/kits/${kitId}`);
      setRecord(kit);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof ApiError ? err.message : "Could not load this kit.");
    }
  }, [kitId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (record?.status !== "generating") return;
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [record?.status, load]);

  async function startGeneration() {
    setStarting(true);
    setError(null);
    try {
      await api.post(`/api/kits/${kitId}/generate`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start generation.");
    } finally {
      setStarting(false);
    }
  }

  function onKitUpdated(kit: Kit) {
    setRecord((prev) => (prev ? { ...prev, kit } : prev));
  }

  if (authLoading || !user) return <p className="text-slate-500">Loading…</p>;

  if (notFound) {
    return (
      <div className="card">
        <p className="text-slate-700">This kit doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/dashboard" className="btn-secondary mt-3 inline-flex">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!record) {
    return <p className="text-slate-500">Loading kit…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{record.kit?.role.title || "Untitled role"}</h1>
          <p className="text-sm text-slate-500">
            {record.kit?.source.company || record.input.companyUrl} · {record.input.days} day
            {record.input.days === 1 ? "" : "s"} to prepare
          </p>
        </div>
        <StatusBadge status={record.status} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {(record.status === "pending" || record.status === "failed") && (
        <div className="card">
          {record.status === "failed" && record.error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Generation failed: {record.error.message}
            </p>
          )}
          <button type="button" className="btn-primary" onClick={startGeneration} disabled={starting}>
            {starting ? "Starting..." : record.status === "failed" ? "Retry generation" : "Generate kit"}
          </button>
        </div>
      )}

      {record.status === "generating" && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-900">Generating your kit…</h2>
          <ProgressSteps events={record.progressEvents} />
        </div>
      )}

      {record.warnings.length > 0 && record.status === "ready" && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {record.warnings.length} research note{record.warnings.length === 1 ? "" : "s"} (click to expand)
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-slate-500">
            {record.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}

      {record.status === "ready" && record.kit && (
        <Tabs
          tabs={[
            { id: "brief", label: "Company brief", content: <CompanyBriefPanel kitId={kitId} kit={record.kit} onUpdated={onKitUpdated} /> },
            { id: "role", label: "Role", content: <RolePanel kitId={kitId} kit={record.kit} onUpdated={onKitUpdated} /> },
            { id: "questions", label: "Questions", content: <QuestionsPanel kitId={kitId} kit={record.kit} onUpdated={onKitUpdated} /> },
            { id: "flashcards", label: "Flashcards", content: <FlashcardsPanel kitId={kitId} kit={record.kit} onUpdated={onKitUpdated} /> },
            { id: "schedule", label: "Schedule", content: <SchedulePanel kitId={kitId} kit={record.kit} onUpdated={onKitUpdated} /> },
            { id: "practice", label: "Practice", content: <PracticePanel kitId={kitId} kit={record.kit} /> },
            { id: "weak-spots", label: "Weak spots", content: <WeakSpotsPanel kitId={kitId} /> },
          ]}
        />
      )}
    </div>
  );
}
