"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ScrollRestorer() {
  const pathname = usePathname();
  const isPopState = useRef(false);

  useEffect(() => {
    // Track back/forward navigation via popstate
    const handlePopState = () => {
      isPopState.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    // Save scroll position before navigating away (on link click)
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (anchor && anchor.href && !anchor.target && anchor.origin === window.location.origin) {
        sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY));
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  useEffect(() => {
    // Restore scroll position on back/forward navigation
    if (isPopState.current) {
      const saved = sessionStorage.getItem(`scroll:${pathname}`);
      if (saved) {
        const y = parseInt(saved, 10);
        // Use requestAnimationFrame to wait for DOM render
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
        });
      }
      isPopState.current = false;
    }
  }, [pathname]);

  return null;
}
