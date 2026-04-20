"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { formatTitlePrefix } from "@/src/lib/titles";

type Entry = {
  front: string;
  back: string;
  listeners: Set<(front: string, back: string) => void>;
  unsub?: () => void;
  pending?: boolean;
};

const cache = new Map<string, Entry>();

function subscribe(nickname: string, cb: (front: string, back: string) => void): () => void {
  let entry = cache.get(nickname);
  if (!entry) {
    entry = { front: "", back: "", listeners: new Set(), pending: true };
    cache.set(nickname, entry);
  }
  entry.listeners.add(cb);
  cb(entry.front, entry.back);

  if (!entry.unsub) {
    const e = entry;
    e.unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      const data = snap.data() as { frontTitle?: string; backTitle?: string } | undefined;
      e.front = data?.frontTitle ?? "";
      e.back = data?.backTitle ?? "";
      e.pending = false;
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

export default function TitlePrefix({
  nickname,
  className,
}: {
  nickname: string;
  className?: string;
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  useEffect(() => {
    if (!nickname) return;
    return subscribe(nickname, (f, b) => {
      setFront(f);
      setBack(b);
    });
  }, [nickname]);

  const text = formatTitlePrefix(front, back);
  if (!text) return null;
  return <span className={"title-prefix" + (className ? " " + className : "")}>{text} </span>;
}
