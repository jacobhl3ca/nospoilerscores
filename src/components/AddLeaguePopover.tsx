"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// "Add {LEAGUE}" from the ESPN front page column (Jacob 9/28): tap a league
// block's label, pick a column, Add. Two taps when a column is free: "New
// column" starts picked. Picking a column replaces what it shows; HomeContent
// also puts the league in the switcher.

export interface AddLeagueSlot {
  slotIdx: number;
  // What the column shows now: "NFL", "Auto · MLB", "empty".
  label: string;
}

export default function AddLeaguePopover({
  leagueLabel,
  anchor,
  slots,
  freeSlotIdx,
  onAdd,
  onClose,
}: {
  leagueLabel: string;
  anchor: DOMRect;
  slots: AddLeagueSlot[];
  // The first Auto/empty column, which "New column" fills. Undefined = none.
  freeSlotIdx?: number;
  onAdd: (slotIdx: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [picked, setPicked] = useState<number | "new" | null>(freeSlotIdx !== undefined ? "new" : null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Under the label, kept inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8));
    const below = anchor.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : below;
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", away);
    ref.current?.querySelector<HTMLElement>("input:checked, input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", away);
    };
  }, [onClose]);

  const target = picked === "new" ? freeSlotIdx : picked ?? undefined;
  const option = (value: number | "new", text: string) => (
    <label key={String(value)} className="flex items-center gap-2 py-1 text-sm cursor-pointer select-none" style={{ color: "var(--text)" }}>
      <input
        type="radio"
        name={titleId}
        checked={picked === value}
        onChange={() => setPicked(value)}
        className="cursor-pointer accent-[var(--accent)]"
      />
      <span>{text}</span>
    </label>
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className="fixed z-[70] rounded-xl p-3 shadow-xl"
      style={{
        left: pos?.left ?? anchor.left,
        top: pos?.top ?? anchor.bottom + 6,
        visibility: pos ? "visible" : "hidden",
        minWidth: 220,
        background: "var(--bg)",
        border: "1px solid var(--border)",
      }}
    >
      <p id={titleId} className="text-sm font-semibold mb-1.5" style={{ color: "var(--text)" }}>Add {leagueLabel}</p>
      <div role="radiogroup" aria-labelledby={titleId}>
        {freeSlotIdx !== undefined && option("new", "New column")}
        {slots.map((s) => option(s.slotIdx, `Column ${s.slotIdx + 1} (${s.label})`))}
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <button type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
        <button type="button"
          disabled={target === undefined}
          onClick={() => { if (target !== undefined) onAdd(target); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
