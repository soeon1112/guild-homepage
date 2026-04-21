"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import TitlePrefix from "./TitlePrefix";

type Lookup = "idle" | "loading" | "found" | "missing";

export default function NicknameLink({
  nickname,
  className,
  prefix,
  hideTitle,
}: {
  nickname: string;
  className?: string;
  prefix?: string;
  hideTitle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [memberId, setMemberId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const runLookup = async () => {
    if (lookup === "found" || lookup === "missing") return;
    setLookup("loading");
    try {
      const q = query(
        collection(db, "members"),
        where("nickname", "==", nickname),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setLookup("missing");
      } else {
        setMemberId(snap.docs[0].id);
        setLookup("found");
      }
    } catch {
      setLookup("missing");
    }
  };

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    void runLookup();
  };

  const handleGo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!memberId) return;
    setOpen(false);
    router.push(`/members/${memberId}`);
  };

  const combinedClass = "nickname-link" + (className ? " " + className : "");

  return (
    <span ref={wrapRef} className="nickname-link-wrap">
      <span
        role="button"
        tabIndex={0}
        className={combinedClass}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleToggle(e);
        }}
      >
        {prefix}
        {!hideTitle && <TitlePrefix nickname={nickname} />}
        {nickname}
      </span>
      {open && (
        <span className="nickname-link-popup" onClick={(e) => e.stopPropagation()}>
          {lookup === "loading" && (
            <span className="nickname-link-msg">확인 중...</span>
          )}
          {lookup === "found" && (
            <button
              type="button"
              className="nickname-link-btn"
              onClick={handleGo}
            >
              {nickname}님 공간으로 가기
            </button>
          )}
          {lookup === "missing" && (
            <span className="nickname-link-msg">아직 공간이 없습니다</span>
          )}
        </span>
      )}
    </span>
  );
}
