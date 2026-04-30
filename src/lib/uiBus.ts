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

// ── Chat input focus signal ──
// BottomNav already fades out when visualViewport.height shrinks, but on
// some Android browsers and across timing edges that detection fires
// late, leaving the nav hovering over the chat panel as the keyboard
// pushes both up the screen. FloatingChat now writes an explicit focus
// flag so BottomNav can hide deterministically the moment the user taps
// the chat input on a mobile device.
let chatInputFocused = false;
const focusSubs = new Set<() => void>();

export function getChatInputFocused(): boolean {
  return chatInputFocused;
}

export function setChatInputFocused(v: boolean): void {
  if (chatInputFocused === v) return;
  chatInputFocused = v;
  focusSubs.forEach((fn) => fn());
}

export function useChatInputFocused(): boolean {
  const [v, setV] = useState<boolean>(chatInputFocused);
  useEffect(() => {
    const fn = () => setV(chatInputFocused);
    focusSubs.add(fn);
    return () => {
      focusSubs.delete(fn);
    };
  }, []);
  return v;
}
