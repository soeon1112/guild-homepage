"use client";

import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import {
  BODY_TYPES,
  type BodyType,
  isBodyType,
  useAvatarData,
} from "@/app/components/Avatar";
import { avatarUrl } from "@/src/lib/avatarAssets";

// Limited-time event: free body change ("환생") for the homepage's reborn-stone
// promo. Only the admin nickname sees the banner until QA passes; after that
// the gate is removed by editing ADMIN_ONLY → false. Auto-hides after EVENT_END.

const EVENT_END = new Date("2026-04-28T23:59:59+09:00");
const ADMIN_NICKS: readonly string[] = ["언쏘"];
const ADMIN_ONLY = true;
const STONE_URL =
  "https://storage.googleapis.com/dawnlight-guild.firebasestorage.app/events/ghkstod.png";

type Stage = "closed" | "stone" | "select" | "confirm" | "success";

export function RebirthEvent() {
  const { nickname, ready } = useAuth();
  const avatarData = useAvatarData(nickname);
  const [stage, setStage] = useState<Stage>("closed");
  const [picked, setPicked] = useState<BodyType | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-hide after the event window. Re-evaluates every minute so a session
  // straddling 23:59 → 00:00 doesn't keep the banner visible.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Auto-close success stage after the celebratory ping plays.
  useEffect(() => {
    if (stage !== "success") return;
    const t = setTimeout(() => {
      setStage("closed");
      setPicked(null);
    }, 2200);
    return () => clearTimeout(t);
  }, [stage]);

  if (!ready || !nickname) return null;
  if (now > EVENT_END.getTime()) return null;
  if (ADMIN_ONLY && !ADMIN_NICKS.includes(nickname)) return null;

  const currentBody = isBodyType(avatarData?.avatarBody)
    ? (avatarData!.avatarBody as BodyType)
    : null;

  const onConfirm = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "users", nickname),
        {
          avatarBody: picked,
          bodySelected: true,
          // Clear equipped fashion — body-specific assets won't render correctly
          // on a different silhouette. Owned items stay in `ownedFashion` and
          // remain re-equippable if the user changes back.
          avatarTop: "",
          avatarBottom: "",
          avatarShoes: "",
          avatarAccessories: "",
        },
        { merge: true },
      );
      setStage("success");
    } catch (err) {
      console.error("[RebirthEvent] body change failed", err);
      alert("환생에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setBusy(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="rebirth-banner"
        onClick={() => setStage("stone")}
        aria-label="환생석 이벤트 — 무료 체형 변경"
      >
        <span className="rebirth-banner-glow" aria-hidden />
        <span className="rebirth-banner-stone-wrap" aria-hidden>
          <img
            src={STONE_URL}
            alt=""
            className="rebirth-banner-stone"
            draggable={false}
          />
        </span>
        <span className="rebirth-banner-text">
          <span className="rebirth-banner-eyebrow">REBIRTH STONE</span>
          <span className="rebirth-banner-title">환생석 이벤트</span>
          <span className="rebirth-banner-desc">
            이벤트 기간 동안 환생비 없이 체형 변경하기
          </span>
          <span className="rebirth-banner-period">~4/28</span>
        </span>
        <span className="rebirth-banner-sparkles" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`rebirth-sparkle rebirth-sparkle-${i}`} />
          ))}
        </span>
      </button>

      {stage !== "closed" && (
        <div
          className="rebirth-backdrop"
          onClick={() => {
            if (busy) return;
            setStage("closed");
            setPicked(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="rebirth-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {stage === "stone" && (
              <button
                type="button"
                className="rebirth-stone-stage"
                onClick={() => setStage("select")}
                aria-label="환생석을 터치해 체형 선택으로 이동"
              >
                <span className="rebirth-stone-aura" aria-hidden />
                <img
                  src={STONE_URL}
                  alt=""
                  className="rebirth-stone-img"
                  draggable={false}
                />
                <span className="rebirth-stone-twinkles" aria-hidden>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span
                      key={i}
                      className={`rebirth-twinkle rebirth-twinkle-${i}`}
                    />
                  ))}
                </span>
                <span className="rebirth-stone-hint">환생석을 터치하세요</span>
              </button>
            )}

            {stage === "select" && (
              <div className="rebirth-select-stage">
                <div className="rebirth-stage-title">체형을 선택하세요</div>
                <div className="rebirth-stage-sub">
                  바뀐 체형에 맞지 않는 패션은 자동으로 해제됩니다
                </div>
                <div className="rebirth-body-grid">
                  {BODY_TYPES.map((b) => {
                    const isCurrent = currentBody === b.value;
                    return (
                      <button
                        type="button"
                        key={b.value}
                        className={
                          "rebirth-body-card" +
                          (isCurrent ? " is-current" : "")
                        }
                        onClick={() => {
                          if (isCurrent) return;
                          setPicked(b.value);
                          setStage("confirm");
                        }}
                        disabled={isCurrent}
                      >
                        <div className="rebirth-body-thumb-wrap">
                          <img
                            src={avatarUrl("bodies", b.value)}
                            alt=""
                            className="rebirth-body-thumb"
                            draggable={false}
                          />
                          {isCurrent && (
                            <span className="rebirth-current-pill">현재</span>
                          )}
                        </div>
                        <div className="rebirth-body-name">{b.label}</div>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="rebirth-cancel-btn"
                  onClick={() => setStage("closed")}
                >
                  닫기
                </button>
              </div>
            )}

            {stage === "confirm" && picked && (
              <div className="rebirth-confirm-stage">
                <div className="rebirth-confirm-title">환생 확인</div>
                <div className="rebirth-confirm-body">
                  <strong>{labelOf(picked)}</strong>(으)로 환생하시겠습니까?
                  <br />
                  장착 중인 패션은 모두 해제됩니다.
                </div>
                <div className="rebirth-confirm-actions">
                  <button
                    type="button"
                    className="rebirth-confirm-cancel"
                    onClick={() => {
                      setPicked(null);
                      setStage("select");
                    }}
                    disabled={busy}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="rebirth-confirm-ok"
                    onClick={onConfirm}
                    disabled={busy}
                  >
                    {busy ? "환생 중..." : "환생하기"}
                  </button>
                </div>
              </div>
            )}

            {stage === "success" && (
              <div className="rebirth-success-stage" aria-live="polite">
                <span className="rebirth-success-burst" aria-hidden />
                <div className="rebirth-success-title">환생 완료!</div>
                <div className="rebirth-success-sub">
                  새로운 모습으로 다시 태어났습니다
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function labelOf(b: BodyType): string {
  return BODY_TYPES.find((x) => x.value === b)?.label ?? b;
}
