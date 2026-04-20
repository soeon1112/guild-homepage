"use client";

import { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { BADGES, BADGE_BY_ID, BadgeMeta } from "@/src/lib/badges";
import { listEarnedBadges } from "@/src/lib/badgeCheck";
import { formatSmart } from "@/src/lib/formatSmart";
import { useAuth } from "./AuthProvider";

type EarnedMap = Record<string, Timestamp | null>;

export default function BadgeCollection({ nickname }: { nickname: string }) {
  const { nickname: viewerNick } = useAuth();
  const isOwner = !!viewerNick && viewerNick === nickname;
  const [open, setOpen] = useState(false);
  const [earned, setEarned] = useState<EarnedMap>({});
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<BadgeMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listEarnedBadges(nickname);
        if (cancelled) return;
        const map: EarnedMap = {};
        for (const e of list) map[e.id] = e.earnedAt;
        setEarned(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname, open]);

  const total = BADGES.length;
  const earnedCount = useMemo(
    () => BADGES.filter((b) => earned[b.id] !== undefined).length,
    [earned],
  );

  return (
    <section className="badge-collection">
      <button
        type="button"
        className="badge-collection-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="badge-collection-title">
          배지 컬렉션 ({earnedCount}/{total})
        </span>
        <span className="badge-collection-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="badge-collection-body">
          {loading ? (
            <p className="badge-collection-loading">불러오는 중...</p>
          ) : (
            <div className="badge-grid">
              {BADGES.map((b) => {
                const isEarned = earned[b.id] !== undefined;
                const cls =
                  "badge-cell " +
                  (isEarned ? "badge-cell-earned" : "badge-cell-locked");
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={cls}
                    onClick={() => setDetail(b)}
                    aria-label={isEarned ? b.name : "미획득 배지"}
                  >
                    <span className="badge-cell-emoji">
                      {isEarned ? b.emoji : "❓"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {detail && (
        <BadgeDetailModal
          badge={detail}
          earnedAt={earned[detail.id] ?? null}
          isEarned={earned[detail.id] !== undefined}
          canReveal={isOwner}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}

function BadgeDetailModal({
  badge,
  earnedAt,
  isEarned,
  canReveal,
  onClose,
}: {
  badge: BadgeMeta;
  earnedAt: Timestamp | null;
  isEarned: boolean;
  canReveal: boolean;
  onClose: () => void;
}) {
  const revealed = isEarned && canReveal;
  const name = revealed ? badge.name : "???";
  const desc = revealed ? badge.description : "???";
  const emoji = revealed ? badge.emoji : "❓";

  return (
    <div className="badge-modal-backdrop" onClick={onClose}>
      <div className="badge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="badge-modal-header">
          <span className="badge-modal-emoji">{emoji}</span>
          <h3 className="badge-modal-title">{name}</h3>
          <button
            type="button"
            className="badge-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="badge-modal-body">
          <p className="badge-modal-desc">{desc}</p>
          {revealed && earnedAt && (
            <p className="badge-modal-earned">
              획득: {formatSmart(earnedAt.toDate())}
            </p>
          )}
          {!revealed && isEarned && (
            <p className="badge-modal-locked">본인만 볼 수 있습니다</p>
          )}
          {!isEarned && (
            <p className="badge-modal-locked">미획득</p>
          )}
        </div>
      </div>
    </div>
  );
}

// re-export for convenience in places that need to peek at a badge by id
export { BADGE_BY_ID };
