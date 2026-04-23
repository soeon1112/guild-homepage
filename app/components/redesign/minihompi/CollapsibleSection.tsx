"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  title,
  rightSlot,
  newBadge = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  rightSlot?: ReactNode;
  newBadge?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: "rgba(26, 15, 61, 0.35)",
        border: "1px solid rgba(216, 150, 200, 0.18)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow:
          "0 4px 18px rgba(11,8,33,0.3), inset 0 1px 0 rgba(255,229,196,0.05)",
      }}
    >
      <div className="flex w-full items-center justify-between gap-3 px-5 py-4">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2.5 text-left transition-colors hover:text-stardust"
        >
          <h2
            className="font-serif text-[15px] tracking-wide sm:text-base"
            style={{
              backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            {title}
          </h2>
          {newBadge && (
            <span
              className="flex items-center rounded-full px-1.5 py-0.5 font-serif text-[8px] font-semibold tracking-wider text-abyss-deep"
              style={{
                background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                boxShadow: "0 0 6px rgba(255,181,167,0.7)",
              }}
            >
              NEW!
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          {rightSlot && (
            <div className="font-serif text-[11px] text-text-sub">{rightSlot}</div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "접기" : "펼치기"}
            aria-expanded={open}
            className="flex h-6 w-6 items-center justify-center text-nebula-pink/80 transition-colors hover:text-nebula-pink"
          >
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              aria-hidden
            >
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
        </div>
      </div>

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
              className="mx-5 h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, rgba(216,150,200,0.35), transparent)",
              }}
            />
            <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
