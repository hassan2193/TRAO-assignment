import type { KitStatus } from "@/lib/types";

const STYLES: Record<KitStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  generating: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};

const LABELS: Record<KitStatus, string> = {
  pending: "Pending",
  generating: "Generating…",
  ready: "Ready",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: KitStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
