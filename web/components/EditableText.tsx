"use client";

import { useEffect, useRef, useState } from "react";

interface EditableTextProps {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
}

/**
 * Click-to-edit text field. Keeps a local draft while editing so nothing is
 * sent to the server per keystroke — only on blur or Enter (Escape
 * cancels), which is what keeps typing feeling instant while regeneration
 * and other kit updates stay a deliberate, debounced network call.
 */
export function EditableText({ value, onSave, multiline, placeholder, label, className }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) void onSave(draft);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    const Field = multiline ? "textarea" : "input";
    return (
      <Field
        ref={ref as never}
        aria-label={label}
        className={`input ${multiline ? "min-h-[80px]" : ""} ${className ?? ""}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) commit();
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
      className={`focus-ring block w-full rounded px-1 py-0.5 text-left hover:bg-slate-50 ${className ?? ""}`}
    >
      {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-slate-400">{placeholder ?? "Click to add..."}</span>}
    </button>
  );
}
