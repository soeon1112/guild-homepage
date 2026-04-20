"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "./AuthProvider";
import { handleEvent } from "@/src/lib/badgeCheck";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function AttendanceButton() {
  const { nickname } = useAuth();
  const [alreadyToday, setAlreadyToday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!nickname) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", nickname));
        const last = snap.data()?.lastAttendance as Timestamp | undefined;
        if (!cancelled) {
          setAlreadyToday(!!last && isSameLocalDay(last.toDate(), new Date()));
          setLoaded(true);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  const handleAttend = async () => {
    if (!nickname || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const snap = await getDoc(doc(db, "users", nickname));
      const last = snap.data()?.lastAttendance as Timestamp | undefined;
      if (last && isSameLocalDay(last.toDate(), new Date())) {
        setAlreadyToday(true);
        setMessage("오늘은 이미 출석했습니다");
        setBusy(false);
        return;
      }
      await setDoc(
        doc(db, "users", nickname),
        {
          points: increment(1),
          lastAttendance: serverTimestamp(),
        },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "출석",
        points: 1,
        description: "출석 체크",
        createdAt: serverTimestamp(),
      });
      setAlreadyToday(true);
      setMessage("출석 완료! 1점 적립되었습니다");
      handleEvent({ type: "attend", nickname, when: new Date() });
    } catch (e) {
      console.error(e);
      setMessage("출석 처리 중 오류가 발생했습니다");
    }
    setBusy(false);
  };

  if (!nickname) return null;

  return (
    <div className="attendance-wrap">
      <button
        type="button"
        className="loginbar-btn"
        onClick={handleAttend}
        disabled={!loaded || busy || alreadyToday}
      >
        {busy ? "..." : "출석"}
      </button>
      {message && <span className="attendance-msg">{message}</span>}
    </div>
  );
}
