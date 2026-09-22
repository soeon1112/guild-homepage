"use client";

// KakaoBrowserNotice — 카카오톡 인앱 브라우저로 들어온 사람에게 참가 전에
// 띄우는 안내. 카톡 인앱 웹뷰는 getUserMedia를 아예 막아둬서(안드/iOS 둘 다)
// 마이크 트랙 생성이 반드시 실패한다 — 이제 그래도 듣기 전용으로는 참가가
// 되지만, "말하려면 외부 브라우저" 라는 걸 참가 전에 알려주는 쪽이 낫다.
//
// 감지는 userAgent의 "KAKAOTALK" 문자열. 카톡이 UA에 이걸 항상 박아주고
// (예: ...KAKAOTALK 10.5.5), 버전 표기가 바뀌어도 이 토큰 자체는 유지된다.
// UA 스니핑이 일반적으로 권장되진 않지만 여기서는 "인앱 웹뷰인지"를 알아낼
// 다른 수단이 없다(navigator.mediaDevices는 존재하되 호출 시점에야 실패).

import { useSyncExternalStore } from "react";

// userAgent는 한 번 정해지면 바뀌지 않으니 구독할 게 없다 — 빈 구독을 준다.
const subscribeToNothing = () => () => {};

function readIsKakao(): boolean {
  try {
    return navigator.userAgent.toUpperCase().includes("KAKAOTALK");
  } catch {
    return false;
  }
}

// useState+useEffect가 아니라 useSyncExternalStore를 쓰는 이유: SSR에서는
// navigator가 없어 서버 스냅샷을 false로 고정해야 하는데, effect에서
// setState하면 hydration 직후 한 번 더 렌더가 돌고 lint(react-hooks/
// set-state-in-effect)에도 걸린다. 이 훅은 서버 false / 클라이언트 실제값을
// 한 번에 처리한다.
export function useIsKakaoInAppBrowser(): boolean {
  return useSyncExternalStore(subscribeToNothing, readIsKakao, () => false);
}

type KakaoBrowserNoticeProps = {
  /** [계속] — 안내를 닫고 듣기 전용으로 진행. */
  onContinue: () => void;
};

export function KakaoBrowserNotice({ onContinue }: KakaoBrowserNoticeProps) {
  const openInExternalBrowser = () => {
    try {
      // 카카오톡 전용 스킴 — 현재 URL을 기기 기본 브라우저로 넘긴다.
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(
        window.location.href,
      )}`;
    } catch {
      /* 스킴이 안 먹는 환경이면 사용자가 직접 주소를 열어야 한다 */
    }
  };

  return (
    <div
      className="mx-4 mb-3 rounded-xl border p-3.5"
      style={{
        borderColor: "rgba(255, 199, 133, 0.45)",
        background: "rgba(11, 8, 33, 0.55)",
      }}
    >
      <p className="mb-1 text-[13px] font-semibold" style={{ color: "#ffc785" }}>
        카카오톡 안에서는 마이크를 쓸 수 없어요
      </p>
      <p className="mb-3 text-xs leading-5" style={{ color: "rgba(254, 245, 230, 0.8)" }}>
        듣기만 하려면 그대로 계속하시고, 말하려면 Safari나 Chrome으로 열어주세요.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 rounded-full px-4 py-2 text-xs font-semibold"
          style={{ color: "#fef5e6", border: "1px solid rgba(254, 245, 230, 0.4)" }}
        >
          계속
        </button>
        <button
          type="button"
          onClick={openInExternalBrowser}
          className="flex-1 rounded-full px-4 py-2 text-xs font-semibold"
          style={{ color: "#2a1f4a", background: "#ffc785" }}
        >
          브라우저로 열기
        </button>
      </div>
    </div>
  );
}
