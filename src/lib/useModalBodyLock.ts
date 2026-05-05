"use client";

import { useEffect } from "react";

// iOS-compatible body scroll lock for Portal-mounted modals.
//
// Plain `body { overflow: hidden }` is NOT enough on iOS Safari — once the
// modal's own `overflow-y: auto` reaches an edge, touch scrolling bubbles
// up to body and the page rubber-bands. The reliable pattern (also used
// by FloatingChat and FishingGame) is:
//
//   1. Save the current scrollY.
//   2. Pin <html>/<body> with overflow: hidden + overscroll-behavior: none
//      AND set body to position: fixed; top: -scrollY; width: 100%.
//   3. On cleanup, restore everything and `window.scrollTo(0, savedScrollY)`
//      so closing the modal doesn't snap the page back to the top.
//
// A module-level counter handles nested/concurrent modals — only the first
// open captures scrollY + applies styles, only the last close restores.
// Without it, a nested second-open would overwrite captured scrollY with
// `0` (since `position:fixed` already zeroed it).
//
// Usage:
//   useModalBodyLock(open);          // boolean prop
//   useModalBodyLock(true);          // when called only inside a modal
//                                    //   component that mounts on open

let activeCount = 0;
let savedScrollY = 0;
const saved: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  htmlOverscroll: string;
  bodyOverscroll: string;
} = {
  htmlOverflow: "",
  bodyOverflow: "",
  bodyPosition: "",
  bodyTop: "",
  bodyWidth: "",
  htmlOverscroll: "",
  bodyOverscroll: "",
};

// ── Debug sink (no-op in prod, fed by AlbumPhotoViewer when '언쏘' is logged
// in to surface the lock/unlock timeline in the on-screen debug banner) ──
type DebugSink = (msg: string) => void;
const debugSinks = new Set<DebugSink>();
function emit(msg: string) {
  if (debugSinks.size === 0) return;
  for (const s of debugSinks) {
    try {
      s(msg);
    } catch {
      /* ignore */
    }
  }
}
export function registerModalLockDebug(sink: DebugSink): () => void {
  debugSinks.add(sink);
  return () => {
    debugSinks.delete(sink);
  };
}

function lock(reason: string) {
  if (activeCount === 0) {
    if (typeof window === "undefined") {
      activeCount++;
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    savedScrollY = window.scrollY;
    emit(
      `[lock APPLY] ${reason} 0→1 sY=${savedScrollY} body.pos(inline)="${body.style.position}" computed=${getComputedStyle(body).position}`,
    );
    saved.htmlOverflow = html.style.overflow;
    saved.bodyOverflow = body.style.overflow;
    saved.bodyPosition = body.style.position;
    saved.bodyTop = body.style.top;
    saved.bodyWidth = body.style.width;
    saved.htmlOverscroll = html.style.overscrollBehavior;
    saved.bodyOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.width = "100%";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    emit(
      `[lock APPLIED] body.pos(inline)="${body.style.position}" top="${body.style.top}"`,
    );
  } else {
    emit(`[lock] ${reason} ${activeCount}→${activeCount + 1} (already locked)`);
  }
  activeCount++;
}

function unlock(reason: string) {
  activeCount--;
  if (activeCount === 0 && typeof window !== "undefined") {
    const html = document.documentElement;
    const body = document.body;
    emit(
      `[unlock RESTORE] ${reason} 1→0 restoring sY=${savedScrollY} (was inline pos="${body.style.position}")`,
    );
    html.style.overflow = saved.htmlOverflow;
    body.style.overflow = saved.bodyOverflow;
    body.style.position = saved.bodyPosition;
    body.style.top = saved.bodyTop;
    body.style.width = saved.bodyWidth;
    html.style.overscrollBehavior = saved.htmlOverscroll;
    body.style.overscrollBehavior = saved.bodyOverscroll;
    window.scrollTo(0, savedScrollY);
    emit(
      `[unlock DONE] body.pos(inline)="${body.style.position}" computed=${getComputedStyle(body).position}`,
    );
  } else {
    emit(
      `[unlock] ${reason} ${activeCount + 1}→${activeCount} (still locked)`,
    );
  }
}

export function useModalBodyLock(open: boolean, debugTag?: string) {
  useEffect(() => {
    if (!open) return;
    const tag = debugTag ?? "?";
    lock(tag);
    return () => unlock(tag);
  }, [open, debugTag]);
}
