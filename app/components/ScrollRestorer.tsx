"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ScrollRestorer() {
  const pathname = usePathname();
  const isPopState = useRef(false);

  useEffect(() => {
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
    const restoreTarget = sessionStorage.getItem("scroll:restore");
    const shouldRestore = isPopState.current || restoreTarget === pathname;

    if (shouldRestore) {
      const saved = sessionStorage.getItem(`scroll:${pathname}`);
      if (saved) {
        const y = parseInt(saved, 10);
        // Hide page, restore scroll, then show
        document.body.style.opacity = "0";
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
          requestAnimationFrame(() => {
            document.body.style.opacity = "1";
          });
        });
      }
    }

    isPopState.current = false;
    sessionStorage.removeItem("scroll:restore");
  }, [pathname]);

  return null;
}
