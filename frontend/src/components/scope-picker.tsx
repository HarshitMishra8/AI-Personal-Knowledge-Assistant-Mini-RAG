"use client";

import { Check, ChevronDown, Library } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DocumentItem } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Choose which documents a chat searches. An empty selection means "all documents". */
export function ScopePicker({
  documents,
  value,
  onChange,
}: {
  documents: DocumentItem[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const known = new Map(documents.map((d) => [d.id, d]));
  const selected = value.filter((id) => known.has(id));
  const label =
    selected.length === 0
      ? "All documents"
      : selected.length === 1
        ? known.get(selected[0])!.filename
        : `${selected.length} documents`;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-8 max-w-[16rem] items-center gap-1.5 rounded-lg px-2.5 text-sm text-graphite hover:bg-subtle hover:text-ink"
      >
        <Library className="h-4 w-4 shrink-0" />
        <span className="truncate">Searching {label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute bottom-10 left-0 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-rule bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(20,33,61,0.35)]"
        >
          <Option checked={selected.length === 0} onClick={() => onChange([])}>
            All documents
          </Option>
          <div className="my-1 h-px bg-rule" />
          <div className="max-h-64 overflow-y-auto">
            {documents.map((doc) => (
              <Option
                key={doc.id}
                checked={selected.includes(doc.id)}
                disabled={doc.status !== "ready"}
                onClick={() => toggle(doc.id)}
                hint={doc.status === "processing" ? "Processing" : doc.status === "failed" ? "Failed" : undefined}
              >
                {doc.filename}
              </Option>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  checked,
  disabled,
  onClick,
  hint,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-subtle",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          checked ? "border-accent bg-accent text-accent-ink" : "border-rule",
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-graphite">{hint}</span>}
    </button>
  );
}
