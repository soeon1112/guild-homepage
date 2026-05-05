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

function lock() {
  if (activeCount === 0) {
    if (typeof window === "undefined") {
      activeCount++;
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    savedScrollY = window.scrollY;
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
  }
  activeCount++;
}

function unlock() {
  activeCount--;
  if (activeCount === 0 && typeof window !== "undefined") {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = saved.htmlOverflow;
    body.style.overflow = saved.bodyOverflow;
    body.style.position = saved.bodyPosition;
    body.style.top = saved.bodyTop;
    body.style.width = saved.bodyWidth;
    html.style.overscrollBehavior = saved.htmlOverscroll;
    body.style.overscrollBehavior = saved.bodyOverscroll;
    window.scrollTo(0, savedScrollY);
  }
}

export function useModalBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    lock();
    return unlock;
  }, [open]);
}
