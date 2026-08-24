"use client";

import { useEffect } from "react";

// Mobile-only auto-scroll for page-level inputs.
//
// Modal inputs and the FloatingChat input each have their own keyboard
// handling — see the modal-FAB hide CSS in globals.css and the chat
// panel's `inputFocused` slide-down. This guard only catches inputs that
// live in the regular page flow (방명록, 게시판 댓글, 별에게 한마디,
// 모험 기록, 프로필 편집 등) and shifts the page so the focused field
// stays inside the visible viewport above the soft keyboard.
//
// We listen at the document level so every page benefits without per-
// component touchpoints. Only fires when:
//   • viewport is < 768 px wide (mobile only — desktop has no keyboard)
//   • the focused element is a text-style input/textarea/contenteditable
//   • the element is NOT inside a modal (.modal-safe-frame /
//     .minihome-modal — those handle their own keyboard avoidance)
//   • the element is NOT inside the floating chat panel (it slides
//     itself above the keyboard already)
//
// Strategy: wait one frame after focus for the soft keyboard to start
// animating in, then measure the element against `visualViewport`. If
// the element is occluded (above the visible top or below the visible
// bottom), call scrollIntoView with `block: "center"` for a smooth
// glide. visualViewport.resize fires again as the keyboard lands, so we
// re-check then to handle browsers that focus before reflowing.
export default function KeyboardScrollGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let scrollTimer: number | null = null;
    let lastTarget: HTMLElement | null = null;

    const isEditable = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input") {
        const type = (el as HTMLInputElement).type.toLowerCase();
        // Buttons / checkboxes / radios / files don't summon the soft
        // keyboard — leave them alone.
        const textyTypes = [
          "",
          "text",
          "search",
          "url",
          "tel",
          "email",
          "password",
          "number",
          "date",
          "datetime-local",
          "time",
          "month",
          "week",
        ];
        return textyTypes.includes(type);
      }
      if (tag === "textarea") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const isInsideExempt = (el: Element | null): boolean => {
      let cur: Element | null = el;
      while (cur && cur !== document.body) {
        if (cur instanceof HTMLElement) {
          // Modals — already keyboard-aware per component.
          if (cur.classList.contains("modal-safe-frame")) return true;
          if (cur.classList.contains("minihome-modal")) return true;
          // The chat FAB and its panel.
          if (cur.dataset.floatingFab === "chat") return true;
          // FloatingChat panel uses role=dialog without aria-modal; the
          // safe distinguishing mark is the panel's own dialog role
          // attached to a NON-modal dialog. Easier to detect: panel sits
          // inside the FloatingChat tree which has `aria-label="연합 채팅"`.
          if (cur.getAttribute("aria-label") === "연합 채팅") return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const tryScroll = () => {
      const el = lastTarget;
      if (!el) return;
      if (document.activeElement !== el) return;
      // Ignore if user has since closed the keyboard / blurred.
      const vv = window.visualViewport;
      const visibleTop = vv ? vv.offsetTop : 0;
      const visibleBottom = vv
        ? vv.offsetTop + vv.height
        : window.innerHeight;
      const rect = el.getBoundingClientRect();
      // 16 px breathing room on both edges so the input doesn't hug the
      // keyboard bezel or the page top once it's centred.
      const margin = 16;
      const occluded =
        rect.top < visibleTop + margin || rect.bottom > visibleBottom - margin;
      if (!occluded) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        el.scrollIntoView();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!isEditable(target)) {
        lastTarget = null;
        return;
      }
      // Mobile only — desktop browsers don't get a soft keyboard.
      if (window.innerWidth >= 768) {
        lastTarget = null;
        return;
      }
      if (isInsideExempt(target)) {
        lastTarget = null;
        return;
      }
      lastTarget = target;
      // First pass: ~280 ms covers the soft keyboard's slide-in on iOS
      // Safari and most Android Chromes. visualViewport.resize will fire
      // again when the keyboard fully lands — handler below re-checks.
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(tryScroll, 280);
    };

    const onFocusOut = () => {
      if (scrollTimer) {
        window.clearTimeout(scrollTimer);
        scrollTimer = null;
      }
      lastTarget = null;
    };

    const onViewportResize = () => {
      // Fires when the soft keyboard finishes animating. Re-run the
      // scroll-into-view check against the now-known visible band.
      if (lastTarget && document.activeElement === lastTarget) {
        if (scrollTimer) window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(tryScroll, 60);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportResize);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onViewportResize);
      if (scrollTimer) window.clearTimeout(scrollTimer);
    };
  }, []);

  return null;
}
