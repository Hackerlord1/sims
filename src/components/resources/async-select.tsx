"use client";

import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDebounced, useOptions, type Option } from "@/components/resources/hooks";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { QueryValue } from "@/lib/api-client";

/**
 * Searchable single-select (WAI-ARIA combobox pattern). Options are fetched from the API as the
 * user types, so large lists never load in full.
 */
export function AsyncSelect({
  id,
  path,
  params = {},
  value,
  valueLabel,
  onChange,
  placeholder = "Search…",
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  path: string;
  params?: Record<string, QueryValue>;
  value: string | null | undefined;
  valueLabel?: string;
  onChange: (value: string | null, option?: Option) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(valueLabel);
  const q = useDebounced(text, 250);
  const wrapper = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useOptions(path, { ...params, q: q || undefined }, open && !disabled);
  // Resolve the label of an existing value when it was not supplied.
  const { data: current } = useOptions(path, { ...params, ids: value ?? undefined }, Boolean(value && !valueLabel && !selectedLabel));
  const label = selectedLabel ?? valueLabel ?? current?.data.find((o) => o.value === value)?.label;
  const options = useMemo(() => data?.data ?? [], [data]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const choose = (o: Option) => {
    onChange(o.value, o);
    setSelectedLabel(o.label);
    setText("");
    setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative">
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(inputClass, "pr-16")}
          placeholder={value && label ? label : placeholder}
          value={open ? text : (label ?? (value ? "Loading…" : ""))}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && options[active]) {
              e.preventDefault();
              choose(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          autoComplete="off"
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden /> : null}
          {value && !disabled ? (
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-text"
              aria-label="Clear selection"
              onClick={() => {
                onChange(null);
                setSelectedLabel(undefined);
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          <ChevronsUpDown className="mr-1 h-4 w-4 text-muted" aria-hidden />
        </div>
      </div>
      {open ? (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-xl">
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted" role="presentation">
              {isFetching ? "Searching…" : "No matches"}
            </li>
          ) : null}
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={cn("flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm", i === active && "bg-surface-2")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.hint ? <span className="block truncate text-xs text-muted">{o.hint}</span> : null}
              </span>
              {o.value === value ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
