"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

// dawnlight2 미니홈피 2단계 — 로즈 톤 collapsible 섹션.
// 헤드 (rgba(184,84,120,0.88)) + 본 박스 (rgba(184,84,120,0.22)) 강한
// 색 대비. cosmic CollapsibleSection 의 deep-link mount 가드 (initial
// height-auto skip → AnimatePresence 전환) 패턴 그대로 보존.

export function CollapsibleSectionD2({
  id,
  title,
  count,
  leftIcon,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  count?: string;
  leftIcon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [interactive, setInteractive] = useState(false);
  const handleToggle = () => {
    setInteractive(true);
    setOpen((v) => !v);
  };

  return (
    <section id={id} className="flex flex-col gap-2">
      {/* HEAD — rose 0.88, always visible */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-left transition-all hover:brightness-110"
        style={{
          background: "rgba(184, 84, 120, 0.7)",
          boxShadow: "0 4px 14px rgba(80, 20, 30, 0.22)",
        }}
      >
        <span className="flex items-center gap-2">
          {leftIcon}
          <span
            className="text-[15px] font-semibold tracking-wide"
            style={{ color: "#fef5e6" }}
          >
            {title}
          </span>
          {count && (
            <span
              className="text-xs"
              style={{ color: "rgba(254,245,230,0.65)" }}
            >
              {count}
            </span>
          )}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          aria-hidden
          style={{
            display: "inline-flex",
            color: "#fef5e6",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 5l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </button>

      {/* BODY — rose 0.22, only when open */}
      {interactive ? (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div
                className="rounded-2xl px-4 py-4 sm:px-5 sm:py-5"
                style={{
                  background: "rgba(184, 84, 120, 0.2)",
                  border: "1px solid rgba(184, 84, 120, 0.4)",
                }}
              >
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && (
          <div
            className="rounded-2xl px-4 py-4 sm:px-5 sm:py-5"
            style={{
              background: "rgba(184, 84, 120, 0.2)",
              border: "1px solid rgba(184, 84, 120, 0.4)",
            }}
          >
            {children}
          </div>
        )
      )}
    </section>
  );
}

// v0 별 SVG (dawnlight2-v0/components/minihome/badge-collection.tsx 51-58).
// 헤드 좌측 아이콘으로 사용.
export function CollectionStarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <polygon
        points="8,1 10,6 15,6 11,9.5 12.5,14.5 8,11.5 3.5,14.5 5,9.5 1,6 6,6"
        fill="#ffd4b8"
        stroke="#e8a890"
        strokeWidth="0.6"
      />
    </svg>
  );
}
