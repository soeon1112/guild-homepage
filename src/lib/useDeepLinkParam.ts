"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

// Robust deep-link query/hash readers for App Router pages.
//
// Why this exists: `useSearchParams` from `next/navigation` resolves
// EMPTY on the first client render after `router.push(...)` on mobile
// browsers (Safari iOS in particular). NebulaWhispers row taps push
// e.g. `/members/X?guestbook=Y` and the destination page mounts before
// the router's URL state has propagated to the hook — so the page's
// effect bails on `if (!param) return;` and the user lands at the top
// of the page instead of jumping to the entry.
//
// The bug has burned us multiple times across deep-link work
// (모험기록 / 일정 / board / photos / guestbook). Each fix adopted the
// same `useState(() => window.location.search)` lazy-init + `??`
// fallback pattern. This hook codifies that pattern so every new
// deep-link consumer gets it for free.
//
// Usage:
//   const commentId = useDeepLinkParam("comment");      // reactive
//   const hash      = useDeepLinkHash();                // mount-only
//   // for paranoid in-effect re-reads:
//   const live = readDeepLinkParam("comment");

// Reactive query-string reader. Combines the lazy-init useState that
// captures `window.location.search` at mount (survives the
// hydration window) with the live `useSearchParams` value (updates
// on subsequent navigations). Returns whichever currently has a
// value, preferring the live one once it lands.
export function useDeepLinkParam(key: string): string | null {
  const [initial] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(key);
  });
  const searchParams = useSearchParams();
  const live = searchParams?.get(key) ?? null;
  return live ?? initial;
}

// Mount-time hash reader. App Router doesn't expose hash reactively
// (hash navigation is client-only), so we capture once at mount.
// Mirrors the `[a, b, c]#x#x` defensive split that NebulaWhispers
// originally needed for mobile Safari hash duplication.
export function useDeepLinkHash(): string {
  const [initial] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.location.hash.slice(1).split("#")[0] || "";
  });
  return initial;
}

// Sync helper for use inside `useEffect` bodies. Same single-source-
// of-truth idea as the hook but callable on demand — useful when an
// effect re-runs on a Firestore snapshot delta and wants to confirm
// the URL hasn't changed since the prop was passed in.
export function readDeepLinkParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}
