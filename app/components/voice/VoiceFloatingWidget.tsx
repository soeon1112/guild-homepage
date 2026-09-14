"use client";

// VoiceFloatingWidget — Phase 3. 다른 페이지로 이동해도 통화가 유지되니
// (VoiceRoomProvider), "지금 통화 중"임을 알리고 빠르게 돌아갈 수 있는
// 하단 고정 pill. /voice 자체에서는 본체 UI가 있으니 숨김.

import { Mic, MicOff, PhoneOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useVoiceRoom } from "@/app/components/voice/VoiceRoomProvider";

// Dawnlight2BottomNav(다른 모든 페이지에서 보임 — /voice에서만 숨김)
// 높이 실측 추정치(아이콘 36 + 라벨 + 내부/외부 패딩 ≈ 83px) 위로 띄우는
// 여백. VoiceRoom.tsx의 과거 BOTTOM_NAV_CLEARANCE와 동일한 값.
const FLOATING_WIDGET_BOTTOM = 88;

// BottomNav(z-40)보다는 위, FloatingChat FAB(z-[100], app/layout.tsx
// 전역)보다는 아래 — 이 pill은 폭이 좁고 가운데 정렬이라 우하단 FAB과
// 물리적으로 겹치지 않아서 그 위로 올라갈 필요가 없다.
const WIDGET_Z_INDEX = "z-[45]";

export function VoiceFloatingWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const { joined, participantEntries, avatarMap, muted, toggleMute, leave } = useVoiceRoom();

  if (pathname === "/voice" || pathname?.startsWith("/voice/")) return null;
  if (!joined) return null;

  const previewEntries = participantEntries.slice(0, 3);
  const extraCount = participantEntries.length - previewEntries.length;

  return (
    <div
      className={`fixed inset-x-0 flex justify-center px-4 ${WIDGET_Z_INDEX}`}
      style={{ bottom: FLOATING_WIDGET_BOTTOM }}
    >
      <button
        type="button"
        onClick={() => router.push("/voice")}
        aria-label="하늘섬 음성방으로 돌아가기"
        className="flex items-center gap-2.5 rounded-full py-2 pl-2.5 pr-3 backdrop-blur-md transition-transform active:scale-95"
        style={{
          background: "rgba(28, 21, 48, 0.92)",
          border: "1px solid rgba(254, 245, 230, 0.22)",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
        }}
      >
        {/* 참가자 프사 겹침 — 최대 3개 + 나머지는 +N */}
        <div className="flex shrink-0 items-center">
          {previewEntries.map(([nickname], i) => {
            const imageUrl = avatarMap.get(nickname)?.imageUrl;
            return (
              <div
                key={nickname}
                className="overflow-hidden rounded-full"
                style={{
                  width: 26,
                  height: 26,
                  marginLeft: i === 0 ? 0 : -8,
                  border: "1.5px solid rgba(28, 21, 48, 0.92)",
                  background: "#d4a870",
                  zIndex: previewEntries.length - i,
                }}
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
              </div>
            );
          })}
          {extraCount > 0 && (
            <div
              className="flex items-center justify-center rounded-full text-[9px] font-semibold"
              style={{
                width: 26,
                height: 26,
                marginLeft: -8,
                border: "1.5px solid rgba(28, 21, 48, 0.92)",
                background: "rgba(254, 245, 230, 0.16)",
                color: "#fef5e6",
              }}
            >
              +{extraCount}
            </div>
          )}
        </div>

        <span className="text-xs font-semibold" style={{ color: "#fef5e6" }}>
          {participantEntries.length > 0 ? `${participantEntries.length}명 통화 중` : "통화 중"}
        </span>

        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            void toggleMute();
          }}
          aria-label={muted ? "음소거 해제" : "음소거"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            background: muted ? "rgba(220, 80, 80, 0.35)" : "rgba(254, 245, 230, 0.12)",
            color: "#fef5e6",
          }}
        >
          {muted ? <MicOff size={13} /> : <Mic size={13} />}
        </span>

        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            void leave();
          }}
          aria-label="음성방 나가기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(220, 38, 38, 0.6)", color: "#fef5e6" }}
        >
          <PhoneOff size={13} />
        </span>
      </button>
    </div>
  );
}
