// Tiny pub/sub for cross-component "which floating panel is open"
// state. Used by FloatingChat + FloatingPet so they can hide each
// other's icon when either is open. Shared, mirrored verbatim in
// dawnlight-app/src/lib/uiBus.ts.

import { useEffect, useState } from "react";

export type FloatingPanel = "chat" | "pet" | null;

let current: FloatingPanel = null;
const subs = new Set<() => void>();

export function getOpenPanel(): FloatingPanel {
  return current;
}

export function setOpenPanel(p: FloatingPanel): void {
  if (current === p) return;
  current = p;
  subs.forEach((fn) => fn());
}

// React hook to subscribe to open-panel changes.
export function useOpenPanel(): FloatingPanel {
  const [v, setV] = useState<FloatingPanel>(current);
  useEffect(() => {
    const fn = () => setV(current);
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  }, []);
  return v;
}
