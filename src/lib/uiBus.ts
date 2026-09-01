// Tiny pub/sub for cross-component "which floating panel is open"
// state. Used by FloatingChat to track its open state. Shared,
// mirrored verbatim in dawnlight-app/src/lib/uiBus.ts.

import { useEffect, useRef, useState } from "react";

export type FloatingPanel = "chat" | null;

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

// ── Chat scroll-to-latest bus ──
// P6 — 상단 로고를 이미 홈(NewHomeChat)에서 다시 클릭하면 최신 메시지로
// 스크롤. Topbar 는 NewHomeChat 내부 ref 를 모르므로 이 one-shot 신호로만
// 전달(dawnlight-app/src/lib/uiBus.ts 의 emitTabReset/useTabReset 과 같은
// ref-pattern — 구독 쪽은 매번 최신 cb 를 쓰되 effect 재등록은 마운트 때만).
type ScrollToLatestCb = () => void;
const scrollToLatestSubs = new Set<ScrollToLatestCb>();

export function emitChatScrollToLatest(): void {
  scrollToLatestSubs.forEach((fn) => fn());
}

export function useChatScrollToLatest(cb: ScrollToLatestCb): void {
  const cbRef = useRef(cb);
  // ref 를 렌더 중이 아니라 effect 안에서 갱신 — "최신 콜백을 매번 재구독
  // 없이" 패턴은 유지하면서 react-hooks/refs(렌더 중 ref 쓰기 금지) 를
  // 만족시킨다.
  useEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    const fn = () => cbRef.current();
    scrollToLatestSubs.add(fn);
    return () => {
      scrollToLatestSubs.delete(fn);
    };
  }, []);
}
