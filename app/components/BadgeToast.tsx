"use client";

import { useEffect, useState } from "react";
import { BADGE_BY_ID } from "@/src/lib/badges";
import { registerBadgeNotifier } from "@/src/lib/badgeCheck";

type ToastItem = { id: number; badgeId: string };

export default function BadgeToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let counter = 0;
    registerBadgeNotifier((badgeId) => {
      const id = ++counter;
      setItems((prev) => [...prev, { id, badgeId }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    });
    return () => registerBadgeNotifier(null);
  }, []);

  return (
    <div className="badge-toast-stack" aria-live="polite">
      {items.map((t) => {
        const meta = BADGE_BY_ID[t.badgeId];
        if (!meta) return null;
        return (
          <div key={t.id} className="badge-toast">
            <span className="badge-toast-emoji">{meta.emoji}</span>
            <span className="badge-toast-text">
              새로운 배지를 획득했습니다: {meta.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
