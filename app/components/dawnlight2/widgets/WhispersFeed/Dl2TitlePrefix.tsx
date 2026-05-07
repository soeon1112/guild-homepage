"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

// dawnlight2-flavored title prefix.
//
// Cosmic's TitlePrefix subscribes to users/{nick}.{frontTitle,backTitle}
// and renders `「front back」` (full-width brackets) in stardust gold.
// We reuse the same Firestore source — but the dawnlight2 visual calls
// for corner brackets ⌜front back⌟ in the warm coral ink (#b85420), so
// the format helper isn't reusable. Implement a tiny module-level
// listener cache here (same trick the cosmic component uses) so a feed
// of N rows opens one Firestore listener per nickname, not N.

type Entry = {
  front: string;
  back: string;
  listeners: Set<(front: string, back: string) => void>;
  unsub?: () => void;
};

const cache = new Map<string, Entry>();

function subscribe(
  nickname: string,
  cb: (front: string, back: string) => void,
): () => void {
  let entry = cache.get(nickname);
  if (!entry) {
    entry = { front: "", back: "", listeners: new Set() };
    cache.set(nickname, entry);
  }
  entry.listeners.add(cb);
  cb(entry.front, entry.back);
  if (!entry.unsub) {
    const e = entry;
    e.unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      const data = snap.data() as
        | { frontTitle?: string; backTitle?: string }
        | undefined;
      e.front = data?.frontTitle ?? "";
      e.back = data?.backTitle ?? "";
      e.listeners.forEach((fn) => fn(e.front, e.back));
    });
  }
  return () => {
    const e = cache.get(nickname);
    if (!e) return;
    e.listeners.delete(cb);
    if (e.listeners.size === 0) {
      e.unsub?.();
      cache.delete(nickname);
    }
  };
}

export function Dl2TitlePrefix({ nickname }: { nickname: string }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  useEffect(() => {
    if (!nickname) return;
    return subscribe(nickname, (f, b) => {
      setFront(f);
      setBack(b);
    });
  }, [nickname]);

  const f = front.trim();
  const b = back.trim();
  if (!f || !b) return null;
  return (
    <span
      // 0.7em mirrors the legacy `.title-prefix` rule (cosmic uses the
      // same proportional sizing). On the 13-px body that resolves to
      // ~9 px — a clear half-step below the nick so the title feels
      // like a tag, not a second name.
      className="mr-1 font-medium tracking-tight"
      style={{ color: "#b85420", fontSize: "0.7em" }}
    >
      {`⌜${f} ${b}⌟`}
    </span>
  );
}
