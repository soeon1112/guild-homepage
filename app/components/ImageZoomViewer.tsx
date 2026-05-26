"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  uri: string;
  onClose: () => void;
};

const ZOOM_MAX = 4;
const DBL_TAP_ZOOM = 2.5;
const DISMISS_Y = 100;

export function ImageZoomViewer({ uri, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const s = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    savedScale: 1,
    savedTx: 0,
    savedTy: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pinchDist0: 0,
    pinchScale0: 1,
    dismissY0: 0,
    dismissing: false,
  }).current;

  const apply = useCallback((animate = false) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform .25s ease-out" : "none";
    el.style.transform = `translate(${s.tx}px,${s.ty}px) scale(${s.scale})`;
  }, [s]);

  const applyOpacity = useCallback((v: number) => {
    const el = containerRef.current;
    if (el) el.style.background = `rgba(0,0,0,${0.95 * v})`;
  }, []);

  const reset = useCallback(() => {
    s.scale = 1;
    s.tx = 0;
    s.ty = 0;
    s.savedScale = 1;
    s.savedTx = 0;
    s.savedTy = 0;
    s.dismissing = false;
  }, [s]);

  const doClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  // Esc key + body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [doClose]);

  // Wheel zoom (Ctrl+scroll / trackpad pinch)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.ctrlKey ? -e.deltaY * 0.01 : -e.deltaY * 0.003;
      const next = Math.min(ZOOM_MAX, Math.max(1, s.scale + d * s.scale));
      if (next === s.scale) return;

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const f = next / s.scale;
      s.tx = cx - f * (cx - s.tx);
      s.ty = cy - f * (cy - s.ty);
      s.scale = next;
      s.savedScale = next;
      s.savedTx = s.tx;
      s.savedTy = s.ty;
      apply();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [s, apply]);

  // Touch (pinch + drag + dismiss)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dist = (t: TouchList) => {
      if (t.length < 2) return 0;
      const dx = t[1].clientX - t[0].clientX;
      const dy = t[1].clientY - t[0].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        s.pinchDist0 = dist(e.touches);
        s.pinchScale0 = s.scale;
      } else if (e.touches.length === 1) {
        s.dragging = true;
        s.lastX = e.touches[0].clientX;
        s.lastY = e.touches[0].clientY;
        if (s.savedScale <= 1) {
          s.dismissing = true;
          s.dismissY0 = e.touches[0].clientY;
        }
      }
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && s.pinchDist0 > 0) {
        e.preventDefault();
        s.scale = Math.min(ZOOM_MAX, Math.max(0.5, s.pinchScale0 * (dist(e.touches) / s.pinchDist0)));
        apply();
      } else if (e.touches.length === 1 && s.dragging) {
        const dx = e.touches[0].clientX - s.lastX;
        const dy = e.touches[0].clientY - s.lastY;
        s.lastX = e.touches[0].clientX;
        s.lastY = e.touches[0].clientY;

        if (s.dismissing && s.savedScale <= 1) {
          s.ty = e.touches[0].clientY - s.dismissY0;
          applyOpacity(Math.max(0.3, 1 - Math.abs(s.ty) / 400));
          apply();
        } else if (s.scale > 1) {
          s.tx += dx;
          s.ty += dy;
          apply();
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      if (s.scale < 1) {
        s.scale = 1;
        s.tx = 0;
        s.ty = 0;
        apply(true);
      }
      s.savedScale = s.scale;
      s.savedTx = s.tx;
      s.savedTy = s.ty;

      if (s.dismissing) {
        if (Math.abs(s.ty) > DISMISS_Y) {
          doClose();
        } else {
          s.ty = 0;
          applyOpacity(1);
          apply(true);
        }
        s.dismissing = false;
      }

      s.dragging = false;
      s.pinchDist0 = 0;
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [s, apply, applyOpacity, doClose]);

  // Mouse drag (desktop, zoomed in)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || s.savedScale <= 1) return;
      s.dragging = true;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!s.dragging || e.pointerType === "touch") return;
      s.tx += e.clientX - s.lastX;
      s.ty += e.clientY - s.lastY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      apply();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      s.dragging = false;
      s.savedTx = s.tx;
      s.savedTy = s.ty;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, [s, apply]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (s.savedScale > 1) {
        s.scale = 1;
        s.tx = 0;
        s.ty = 0;
        s.savedScale = 1;
        s.savedTx = 0;
        s.savedTy = 0;
      } else {
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        s.scale = DBL_TAP_ZOOM;
        s.tx = cx * (1 - DBL_TAP_ZOOM);
        s.ty = cy * (1 - DBL_TAP_ZOOM);
        s.savedScale = DBL_TAP_ZOOM;
        s.savedTx = s.tx;
        s.savedTy = s.ty;
      }
      apply(true);
    },
    [s, apply],
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) doClose();
    },
    [doClose],
  );

  const lightbox = (
    <div
      ref={containerRef}
      className="image-zoom-viewer"
      onClick={handleBackdrop}
    >
      <div
        ref={contentRef}
        className="image-zoom-viewer-content"
        onDoubleClick={handleDoubleClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={uri} alt="" draggable={false} />
      </div>
      <button
        type="button"
        className="image-zoom-viewer-close"
        onClick={doClose}
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(lightbox, document.body)
    : null;
}
