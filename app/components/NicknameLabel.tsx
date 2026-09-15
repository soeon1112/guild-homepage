"use client";

// NicknameLabel.tsx
// 닉네임 클릭 → 서버(던컨/아이라) 툴팁. 프사 클릭(MemberAvatar → DM 이동)과는
// 완전히 별개 이벤트 — 이 컴포넌트는 닉네임 "텍스트"에만 반응한다.
//
// NicknameLink.tsx(20여 곳에서 쓰는 "dumb" 닉네임 span)는 의도적으로
// 미접촉 — 그 컴포넌트를 확장하면 20여 곳 전부에 영향이 가므로, 이번에
// 요청받은 채팅 + 제안 게시판 2곳에만 별도 컴포넌트로 적용한다.
//
// 서버 조회는 useUserServer([nickname]) 를 툴팁이 열렸을 때만 호출하는
// lazy 패턴 — 닫혀있으면 Firestore 비용 0. 전역 싱글톤(closeActiveTooltip)
// 으로 "동시에 하나만 열림"을 보장 — Context/Provider 없이 이 파일 안에서
// 자체 완결. 바깥 클릭 닫힘은 document mousedown 리스너.

import { useEffect, useRef, useState } from "react";
import { useUserServer } from "@/src/lib/useUserServer";
import { SERVER_LABELS } from "@/src/lib/guilds";

let closeActiveTooltip: (() => void) | null = null;

export default function NicknameLabel({
  nickname,
  className,
  style,
}: {
  nickname: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const serverMap = useUserServer(open ? [nickname] : []);
  const server = serverMap.get(nickname) ?? null;

  const close = () => {
    setOpen(false);
    closeActiveTooltip = null;
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    closeActiveTooltip?.();
    closeActiveTooltip = close;
    setOpen(true);
  };

  return (
    <span
      ref={wrapRef}
      className="relative inline-block"
      style={{ cursor: "pointer" }}
    >
      <span className={className} style={style} onClick={toggle}>
        {nickname}
      </span>
      {open && (
        <span
          className="absolute whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold"
          style={{
            left: "50%",
            bottom: "100%",
            transform: "translateX(-50%)",
            marginBottom: 4,
            background: "rgba(11, 8, 33, 0.92)",
            color: "#fef5e6",
            border: "1px solid rgba(200, 184, 232, 0.3)",
            zIndex: 50,
          }}
        >
          {server ? SERVER_LABELS[server] : "..."}
        </span>
      )}
    </span>
  );
}
