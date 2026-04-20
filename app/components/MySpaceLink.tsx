"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "./AuthProvider";

export default function MySpaceLink() {
  const { nickname } = useAuth();
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!nickname) {
      setMemberId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "members"),
          where("nickname", "==", nickname),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setMemberId(snap.empty ? null : snap.docs[0].id);
      } catch (e) {
        console.error(e);
        if (!cancelled) setMemberId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  if (!nickname || !memberId) return null;

  return (
    <Link href={`/members/${memberId}`} className="loginbar-link-btn">
      내 공간
    </Link>
  );
}
