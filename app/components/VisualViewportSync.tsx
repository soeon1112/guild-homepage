"use client";

import { useEffect } from "react";

// Mirrors `window.visualViewport` state into two CSS variables:
//   --vvh             — visualViewport.height in px (currently unused;
//                       the previous attempt to size modals to vvh
//                       caused iOS layout regressions, so the variable
//                       is kept exposed for future use without driving
//                       any CSS today).
//   --keyboard-inset  — px height of the soft keyboard's overlap with
//                       the layout viewport. Zero when the keyboard is
//                       closed.
//
// Modals add `--keyboard-inset` to their padding-bottom so the inner
// scroll area gains the keyboard's worth of space — letting the
// browser's native input-into-view scroll lift the focused field above
// the keyboard without resizing the modal box itself.
//
// Mounted once at app root (layout.tsx). Browsers without
// `visualViewport` get the fallback values (--vvh: 100vh,
// --keyboard-inset: 0px).
export function VisualViewportSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) {
      root.style.setProperty("--vvh", "100vh");
      root.style.setProperty("--keyboard-inset", "0px");
      return;
    }
    const update = () => {
      root.style.setProperty("--vvh", `${vv.height}px`);
      // window.innerHeight - (vv.height + vv.offsetTop) = how far the
      // soft keyboard has eaten into the bottom of the layout viewport.
      // Negative values can briefly appear during URL-bar animations
      // on iOS Safari — clamp to 0.
      const inset = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      root.style.setProperty("--keyboard-inset", `${inset}px`);
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
