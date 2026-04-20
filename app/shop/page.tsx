"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import BackLink from "@/app/components/BackLink";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";
import { logActivity } from "@/src/lib/activity";
import {
  BACK_WORDS,
  FRONT_WORDS,
  TitleType,
  TitleWord,
  TitleWordDoc,
  currentMonthKey,
  ensureMonthlyReset,
  formatTitlePrefix,
  getWordByText,
  purchaseTitle,
} from "@/src/lib/titles";

type WordStatus = {
  owner: string;
  purchasedMonth: string;
};

export default function ShopPage() {
  const { nickname, ready } = useAuth();
  const [tab, setTab] = useState<TitleType>("front");
  const [points, setPoints] = useState(0);
  const [frontTitle, setFrontTitle] = useState("");
  const [backTitle, setBackTitle] = useState("");
  const [statuses, setStatuses] = useState<Record<string, WordStatus>>({});
  const [busyWordId, setBusyWordId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const monthKey = currentMonthKey();

  useEffect(() => {
    void ensureMonthlyReset();
  }, []);

  useEffect(() => {
    if (!nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      const data = snap.data();
      setPoints(typeof data?.points === "number" ? data.points : 0);
      setFrontTitle((data?.frontTitle as string | undefined) ?? "");
      setBackTitle((data?.backTitle as string | undefined) ?? "");
    });
    return () => unsub();
  }, [nickname]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "titleWords"), (snap) => {
      const next: Record<string, WordStatus> = {};
      snap.forEach((d) => {
        const data = d.data() as Partial<TitleWordDoc>;
        next[d.id] = {
          owner: data.owner ?? "",
          purchasedMonth: data.purchasedMonth ?? "",
        };
      });
      setStatuses(next);
    });
    return () => unsub();
  }, []);

  const words = tab === "front" ? FRONT_WORDS : BACK_WORDS;

  const equippedFrontId = useMemo(() => {
    if (!frontTitle) return "";
    const w = getWordByText("front", frontTitle);
    return w?.id ?? "";
  }, [frontTitle]);

  const equippedBackId = useMemo(() => {
    if (!backTitle) return "";
    const w = getWordByText("back", backTitle);
    return w?.id ?? "";
  }, [backTitle]);

  const handleBuy = async (w: TitleWord) => {
    if (!nickname) return;
    const status = statuses[w.id];
    const takenByOther =
      !!status &&
      !!status.owner &&
      status.owner !== nickname &&
      status.purchasedMonth === monthKey;
    if (takenByOther) {
      setMessage("이미 다른 사람이 사용 중인 단어입니다.");
      return;
    }
    if (points < w.price) {
      setMessage("포인트가 부족합니다.");
      return;
    }
    const prevText = w.type === "front" ? frontTitle : backTitle;
    if (prevText === w.word) {
      setMessage("이미 장착 중인 단어입니다.");
      return;
    }
    if (
      !confirm(
        `「${w.word}」 단어를 ${w.price}p에 구매하시겠습니까?\n(기존 ${
          w.type === "front" ? "앞" : "뒤"
        } 단어는 해제됩니다.)`,
      )
    ) {
      return;
    }
    setBusyWordId(w.id);
    setMessage(null);
    try {
      const result = await purchaseTitle(nickname, w.id);
      if (result.ok) {
        const newFront = w.type === "front" ? w.word : frontTitle;
        const newBack = w.type === "back" ? w.word : backTitle;
        const combined = formatTitlePrefix(newFront, newBack);
        await logActivity(
          "title",
          nickname,
          `${nickname}님이 새 칭호를 장착했습니다: ${combined}`,
        );
        setMessage(`「${w.word}」 구매 완료!`);
      } else if (result.reason === "taken") {
        setMessage("방금 다른 사람이 선점했습니다.");
      } else if (result.reason === "no_points") {
        setMessage("포인트가 부족합니다.");
      } else {
        setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setBusyWordId(null);
    }
  };

  if (!ready) {
    return (
      <div className="shop-page">
        <p className="shop-hint">불러오는 중...</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className="shop-page">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <p className="login-required">로그인이 필요합니다.</p>
      </div>
    );
  }

  const previewText = formatTitlePrefix(frontTitle, backTitle);

  return (
    <div className="shop-page">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <div className="shop-container">
        <header className="shop-header">
          <h1 className="shop-title">칭호 상점</h1>
          <p className="shop-subtitle">앞 단어와 뒤 단어를 조합하여 나만의 칭호를 만드세요</p>
        </header>

        <section className="shop-status">
          <div className="shop-status-row">
            <span className="shop-status-label">내 포인트</span>
            <span className="shop-status-value shop-status-points">
              {points.toLocaleString()}p
            </span>
          </div>
          <div className="shop-status-row">
            <span className="shop-status-label">현재 장착</span>
            <span className="shop-status-preview">
              {previewText ? (
                <>
                  <span className="title-prefix shop-preview-title">{previewText}</span>
                  <span className="shop-preview-nick">{nickname}</span>
                </>
              ) : (
                <span className="shop-status-empty">아직 장착한 칭호가 없습니다</span>
              )}
            </span>
          </div>
          <p className="shop-status-reset">매월 1일 자정에 모든 칭호가 리셋됩니다 (환불 없음)</p>
        </section>

        <div className="shop-tabs">
          <button
            type="button"
            className={"shop-tab" + (tab === "front" ? " shop-tab-active" : "")}
            onClick={() => setTab("front")}
          >
            앞 단어
          </button>
          <button
            type="button"
            className={"shop-tab" + (tab === "back" ? " shop-tab-active" : "")}
            onClick={() => setTab("back")}
          >
            뒤 단어
          </button>
        </div>

        {message && <p className="shop-message">{message}</p>}

        <div className="shop-grid">
          {words.map((w) => {
            const status = statuses[w.id];
            const owner = status?.owner ?? "";
            const isCurrent = status?.purchasedMonth === monthKey && !!owner;
            const mine = isCurrent && owner === nickname;
            const takenByOther = isCurrent && !mine;
            const equipped =
              (w.type === "front" && equippedFrontId === w.id) ||
              (w.type === "back" && equippedBackId === w.id);
            const notEnoughPoints = points < w.price;
            const disabled =
              !!busyWordId ||
              takenByOther ||
              equipped ||
              notEnoughPoints;

            const cardClass = [
              "shop-card",
              mine && equipped ? "shop-card-equipped" : "",
              takenByOther ? "shop-card-taken" : "",
            ]
              .filter(Boolean)
              .join(" ");

            let btnLabel = "구매";
            if (busyWordId === w.id) btnLabel = "구매 중...";
            else if (equipped) btnLabel = "장착 중";
            else if (takenByOther) btnLabel = "사용 중";
            else if (notEnoughPoints) btnLabel = "포인트 부족";

            return (
              <div key={w.id} className={cardClass}>
                <div className="shop-card-word">{w.word}</div>
                <div className="shop-card-price">{w.price}p</div>
                {takenByOther && (
                  <div className="shop-card-taken-text">
                    사용 중 ({owner})
                  </div>
                )}
                <button
                  type="button"
                  className="minihome-btn shop-card-btn"
                  onClick={() => handleBuy(w)}
                  disabled={disabled}
                >
                  {btnLabel}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
