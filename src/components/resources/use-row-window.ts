"use client";

import { useEffect, useState, type RefObject } from "react";

const THRESHOLD = 100;
const OVERSCAN = 12;

/**
 * Row windowing for large pages (over 100 rows): only rows near the visible part of the scroll
 * container are rendered, with spacer heights above and below so the scrollbar stays accurate.
 */
export function useRowWindow<T>(rows: T[], scrollRef: RefObject<HTMLDivElement | null>, rowHeight = 44) {
  const enabled = rows.length > THRESHOLD;
  const [view, setView] = useState({ top: 0, height: 800 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setView({ top: el.scrollTop, height: el.clientHeight || 800 }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [enabled, scrollRef]);

  if (!enabled) return { enabled, visible: rows, padTop: 0, padBottom: 0 };
  const start = Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((view.top + view.height) / rowHeight) + OVERSCAN);
  return { enabled, visible: rows.slice(start, end), padTop: start * rowHeight, padBottom: (rows.length - end) * rowHeight };
}
