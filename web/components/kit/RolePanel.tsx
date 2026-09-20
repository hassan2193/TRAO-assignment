"use client";

import { EditableText } from "@/components/EditableText";
import { api } from "@/lib/api";
import type { Kit } from "@/lib/types";

const PRIORITY_STYLES: Record<string, string> = {
  must: "bg-red-50 text-red-700 border-red-200",
  nice: "bg-slate-50 text-slate-600 border-slate-200",
};

export function RolePanel({ kitId, kit, onUpdated }: { kitId: string; kit: Kit; onUpdated: (kit: Kit) => void }) {
  async function savePatch(patch: Partial<Kit["role"]>) {
    const { kit: updated } = await api.patch<{ kit: Kit }>(`/api/kits/${kitId}`, { role: patch });
    onUpdated(updated);
  }

  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <span className="label">Title</span>
          <EditableText label="role title" value={kit.role.title} onSave={(v) => savePatch({ title: v })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Seniority</span>
            <EditableText label="seniority" value={kit.role.seniority} onSave={(v) => savePatch({ seniority: v })} />
          </div>
          <div>
            <span className="label">Location</span>
            <p className="px-1 py-0.5 text-sm text-slate-700">{kit.source.location || "Not stated"}</p>
          </div>
        </div>
        <div>
          <span className="label">Responsibilities</span>
          <EditableText
            label="responsibilities"
            multiline
            value={kit.role.responsibilities.join("\n")}
            onSave={(v) => savePatch({ responsibilities: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-900">Requirements ({kit.role.requirements.length})</h3>
        {kit.coverage.uncovered_requirement_ids.length > 0 && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {kit.coverage.uncovered_requirement_ids.length} requirement(s) have no question covering them yet. They're
            marked below.
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {kit.role.requirements.map((req) => (
            <li key={req.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[req.priority]}`}>
                {req.priority}
              </span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                {req.kind}
              </span>
              <span className="text-slate-800">{req.text}</span>
              {uncovered.has(req.id) && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">uncovered</span>
              )}
            </li>
          ))}
          {kit.role.requirements.length === 0 && (
            <p className="text-sm text-slate-500">
              No requirements were extracted — the job description may be too thin to work with.
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
