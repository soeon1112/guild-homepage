"use client";

import { useEffect } from "react";

// Mirrors `window.visualViewport.height` into a CSS variable `--vvh`.
//
// Why: `position: fixed` modals are sized against the LAYOUT viewport on
// iOS Safari, which doesn't shrink when the soft keyboard appears — so a
// modal's `height: 100vh` keeps the keyboard area inside the modal layout
// and the focused input lands behind the keyboard instead of just above
// it. By tracking `visualViewport.height` and feeding it into `--vvh`,
// any modal CSS that uses `height: var(--vvh, 100vh)` shrinks to the
// keyboard-clear viewport in real time, letting the card (with its
// natural flex-start alignment) sit right above the keyboard.
//
// Mounted once at app root (layout.tsx). Browsers without
// `visualViewport` (very old) get the fallback `--vvh: 100vh` behaviour.
export function VisualViewportSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) {
      root.style.setProperty("--vvh", "100vh");
      return;
    }
    const update = () => {
      root.style.setProperty("--vvh", `${vv.height}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
