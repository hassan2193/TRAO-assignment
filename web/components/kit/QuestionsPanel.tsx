"use client";

import { useMemo, useState } from "react";
import { EditableText } from "@/components/EditableText";
import { api, ApiError } from "@/lib/api";
import type { Kit, Question, QuestionCategory } from "@/lib/types";

const CATEGORIES: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];
const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

const STATE_STYLES: Record<string, string> = {
  generated: "bg-slate-100 text-slate-500",
  edited: "bg-blue-50 text-blue-700",
  pinned: "bg-violet-50 text-violet-700",
};

function reorderWithinSubset(fullIds: string[], subsetIdsInNewOrder: string[]): string[] {
  const subsetSet = new Set(subsetIdsInNewOrder);
  let cursor = 0;
  return fullIds.map((id) => (subsetSet.has(id) ? subsetIdsInNewOrder[cursor++] : id));
}

export function QuestionsPanel({ kitId, kit, onUpdated }: { kitId: string; kit: Kit; onUpdated: (kit: Kit) => void }) {
  const [filter, setFilter] = useState<QuestionCategory | "all">("all");
  const [busyCategory, setBusyCategory] = useState<QuestionCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const displayed = useMemo(
    () => (filter === "all" ? kit.questions : kit.questions.filter((q) => q.category === filter)),
    [kit.questions, filter]
  );

  async function refreshFrom(promise: Promise<{ kit: Kit }>) {
    try {
      const { kit: updated } = await promise;
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That action failed. Please try again.");
    }
  }

  function patchQuestion(id: string, patch: Partial<Question>) {
    return refreshFrom(api.patch<{ kit: Kit }>(`/api/kits/${kitId}/questions/${id}`, patch));
  }

  function deleteQuestion(id: string) {
    return refreshFrom(api.delete<{ kit: Kit }>(`/api/kits/${kitId}/questions/${id}`));
  }

  function move(question: Question, direction: -1 | 1) {
    const idx = displayed.findIndex((q) => q.id === question.id);
    const swapWith = displayed[idx + direction];
    if (!swapWith) return;
    const newDisplayedOrder = displayed.slice();
    newDisplayedOrder[idx] = swapWith;
    newDisplayedOrder[idx + direction] = question;
    const newFullOrder = reorderWithinSubset(
      kit.questions.map((q) => q.id),
      newDisplayedOrder.map((q) => q.id)
    );
    return refreshFrom(api.post<{ kit: Kit }>(`/api/kits/${kitId}/questions/reorder`, { orderedIds: newFullOrder }));
  }

  async function addQuestion() {
    setAdding(true);
    try {
      const category = filter === "all" ? "technical" : filter;
      await refreshFrom(
        api.post<{ kit: Kit }>(`/api/kits/${kitId}/questions`, {
          prompt: "New question — click to edit",
          answer_outline: "",
          difficulty: 2,
          category,
          requirement_ids: [],
        })
      );
    } finally {
      setAdding(false);
    }
  }

  async function regenerateCategory(category: QuestionCategory) {
    setBusyCategory(category);
    setError(null);
    try {
      const { kit: updated } = await api.post<{ kit: Kit }>(`/api/kits/${kitId}/regenerate/questions/${category}`);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not regenerate ${category} questions.`);
    } finally {
      setBusyCategory(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter by category" className="flex flex-wrap gap-1">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium ${
                filter === c ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setFilter(c)}
            >
              {c === "all" ? "All" : CATEGORY_LABELS[c]} (
              {c === "all" ? kit.questions.length : kit.questions.filter((q) => q.category === c).length})
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {filter !== "all" && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => regenerateCategory(filter)}
              disabled={busyCategory === filter}
            >
              {busyCategory === filter ? "Regenerating..." : `Regenerate ${CATEGORY_LABELS[filter]}`}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={addQuestion} disabled={adding}>
            + Add question
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {displayed.length === 0 && <p className="text-sm text-slate-500">No questions in this category yet.</p>}

      <ul className="space-y-3">
        {displayed.map((q, idx) => (
          <li key={q.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                  {CATEGORY_LABELS[q.category]}
                </span>
                <span className={`rounded px-2 py-0.5 font-medium ${STATE_STYLES[q.state]}`}>{q.state}</span>
                <label className="flex items-center gap-1 text-slate-600">
                  Difficulty
                  <select
                    aria-label="Difficulty"
                    className="rounded border border-slate-300 px-1 py-0.5"
                    value={q.difficulty}
                    onChange={(e) => patchQuestion(q.id, { difficulty: Number(e.target.value) })}
                  >
                    {[1, 2, 3].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-slate-600">
                  Move to
                  <select
                    aria-label="Move to category"
                    className="rounded border border-slate-300 px-1 py-0.5"
                    value={q.category}
                    onChange={(e) => patchQuestion(q.id, { category: e.target.value as QuestionCategory })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Move up"
                  className="btn-secondary px-2 py-1"
                  disabled={idx === 0}
                  onClick={() => move(q, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className="btn-secondary px-2 py-1"
                  disabled={idx === displayed.length - 1}
                  onClick={() => move(q, 1)}
                >
                  ↓
                </button>
                <button type="button" className="btn-danger px-2 py-1" onClick={() => deleteQuestion(q.id)}>
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <EditableText label="prompt" value={q.prompt} onSave={(v) => patchQuestion(q.id, { prompt: v })} multiline />
              <div>
                <span className="text-xs font-medium text-slate-500">Answer outline</span>
                <EditableText
                  label="answer outline"
                  value={q.answer_outline}
                  onSave={(v) => patchQuestion(q.id, { answer_outline: v })}
                  multiline
                />
              </div>
              {q.requirement_ids.length > 0 && (
                <p className="text-xs text-slate-400">
                  Covers: {q.requirement_ids.map((rid) => kit.role.requirements.find((r) => r.id === rid)?.text ?? rid).join(", ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
