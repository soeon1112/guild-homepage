"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";

// Today's Voyager — Dawnlight 2 daily-rotating member spotlight.
//
// Rotation algorithm + member pool 1:1 with cosmic StarOfDay
// (members collection, KST day number, FNV-1a → mulberry32 →
// Fisher-Yates pick). Same input every visitor sees the same
// voyager today + the same shuffle next cycle.
//
// Side panels (keyword gift + guestbook entry) write to the
// per-member subcollections cosmic minihome already uses, so
// anything submitted here lands in the voyager's existing
// keyword cloud / guestbook on their minihome page.

type MemberCard = {
  id: string;
  nickname: string;
  statusMessage: string;
  profileImage: string;
};

const NAVY = "#2a4570";
const NAVY_SOFT = "#5a7090";
const CREAM = "#fef5e6";

// ── KST + deterministic shuffle (verbatim from cosmic StarOfDay) ──
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstDayNumber(date = new Date()): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / 86400000);
}
function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffledIndices(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickStarIndex(poolSize: number, date = new Date()): number {
  if (poolSize <= 0) return -1;
  const day = kstDayNumber(date);
  const cycle = Math.floor(day / poolSize);
  const pos = ((day % poolSize) + poolSize) % poolSize;
  const seed = fnv1a(`star-of-day:${cycle}`);
  const order = shuffledIndices(poolSize, mulberry32(seed));
  return order[pos];
}

export function TodaysVoyager() {
  const { nickname } = useAuth();
  const [members, setMembers] = useState<MemberCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "members"));
        if (cancelled) return;
        const list: MemberCard[] = snap.docs
          .map((d) => ({
            id: d.id,
            nickname: (d.data().nickname as string) ?? "",
            statusMessage: (d.data().statusMessage as string) ?? "",
            profileImage: (d.data().profileImage as string) ?? "",
          }))
          .filter((m) => !!m.nickname)
          .sort((a, b) => a.id.localeCompare(b.id));
        setMembers(list);
        setLoaded(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = useMemo(() => {
    if (members.length === 0) return null;
    return members[pickStarIndex(members.length)];
  }, [members]);

  return (
    <section
      aria-labelledby="dl2-todays-voyager"
      className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
    >
      {/* Header outside the cards — same rhythm as the other dawnlight2 widgets */}
      <header className="mb-3 px-1">
        <h2
          id="dl2-todays-voyager"
          className="text-lg font-semibold leading-tight text-cream sm:text-xl"
        >
          오늘의 항해자
        </h2>
        <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
          Today&apos;s Voyager
        </p>
      </header>

      {/* Two-column on sm:+, single column on mobile */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto,1fr] sm:items-center sm:gap-5">
        <VoyagerCard voyager={today} loaded={loaded} />

        <div className="flex flex-col gap-3">
          <KeywordCard
            voyagerNickname={today?.nickname ?? ""}
            senderNickname={nickname}
          />
          <MinihomeGuestbookCard
            voyagerId={today?.id ?? ""}
            senderNickname={nickname}
          />
        </div>
      </div>
    </section>
  );
}

/* ─── Left card: voyager profile + visit button ─────────────────── */

function VoyagerCard({
  voyager,
  loaded,
}: {
  voyager: MemberCard | null;
  loaded: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl px-5 py-5 text-center"
      style={{
        background: "rgba(205, 216, 224, 0.65)",
        border: "1px solid rgba(42, 69, 112, 0.18)",
      }}
    >
      <Avatar
        src={voyager?.profileImage}
        nickname={voyager?.nickname ?? ""}
      />
      {voyager ? (
        <>
          <div className="min-w-0">
            <p
              className="text-base font-semibold leading-tight"
              style={{ color: NAVY }}
            >
              {voyager.nickname}
            </p>
            {voyager.statusMessage && (
              <p
                className="mt-1 text-[11px] italic leading-snug"
                style={{ color: NAVY_SOFT }}
              >
                &ldquo;{voyager.statusMessage}&rdquo;
              </p>
            )}
          </div>
          <Link
            href={`/members/${voyager.id}`}
            className="rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 active:scale-95"
            style={{ background: NAVY, color: CREAM }}
          >
            ✦ 항해자의 섬으로
          </Link>
        </>
      ) : (
        <p className="text-xs italic" style={{ color: NAVY_SOFT }}>
          {loaded ? "아직 빛나는 별이 없어요" : "별을 찾는 중..."}
        </p>
      )}
    </div>
  );
}

function Avatar({ src, nickname }: { src?: string; nickname: string }) {
  const initials = nickname.trim().slice(0, 2) || "·";
  return (
    <div
      className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-base font-semibold"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,199,133,0.95), rgba(244,168,122,0.95))",
        color: "#2a1f4a",
        border: "2px solid rgba(255,245,220,0.7)",
        boxShadow: "0 3px 14px rgba(42, 69, 112, 0.18)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={nickname}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

/* ─── Right card 1: keyword gift ────────────────────────────────── */

function KeywordCard({
  voyagerNickname,
  senderNickname,
}: {
  voyagerNickname: string;
  senderNickname: string | null;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleChange = (raw: string) => {
    let v = raw;
    if (v && !v.startsWith("#")) v = "#" + v;
    if (v.length > 21) v = v.slice(0, 21); // # + 20 chars
    setValue(v);
  };

  const handleSend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!senderNickname || !voyagerNickname || busy || done) return;
    const text = value.trim();
    if (!text || text === "#") return;
    setBusy(true);
    try {
      await addDoc(collection(db, "users", voyagerNickname, "keywords"), {
        text,
        authorNickname: senderNickname,
        createdAt: serverTimestamp(),
      });
      setDone(true);
      setValue("");
      setTimeout(() => setDone(false), 2200);
    } catch (e2) {
      console.error(e2);
    }
    setBusy(false);
  };

  const disabled = !senderNickname || !voyagerNickname || busy || done;
  return (
    <form
      onSubmit={handleSend}
      className="rounded-2xl px-4 py-3 sm:px-5"
      style={{
        background: "rgba(205, 216, 224, 0.65)",
        border: "1px solid rgba(42, 69, 112, 0.18)",
      }}
    >
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em]"
        style={{ color: NAVY }}
      >
        ✦ 키워드 선물하기
      </p>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="#이 별에게 선물할 키워드"
          maxLength={21}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none focus:border-[rgba(42,69,112,0.5)]"
          style={{
            background: "rgba(255, 255, 255, 0.7)",
            color: NAVY,
            border: "1px solid rgba(42, 69, 112, 0.22)",
          }}
        />
        <button
          type="submit"
          disabled={disabled}
          className="flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ background: NAVY, color: CREAM }}
        >
          {done ? "전달됨" : "✦ 전하기"}
        </button>
      </div>
    </form>
  );
}

/* ─── Right card 2: per-member guestbook entry ──────────────────── */

function MinihomeGuestbookCard({
  voyagerId,
  senderNickname,
}: {
  voyagerId: string;
  senderNickname: string | null;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleSend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!senderNickname || !voyagerId || busy || done) return;
    const message = value.trim();
    if (!message) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "members", voyagerId, "guestbook"), {
        nickname: senderNickname,
        message,
        createdAt: serverTimestamp(),
      });
      setDone(true);
      setValue("");
      setTimeout(() => setDone(false), 2200);
    } catch (e2) {
      console.error(e2);
    }
    setBusy(false);
  };

  const disabled = !senderNickname || !voyagerId || busy || done;
  return (
    <form
      onSubmit={handleSend}
      className="rounded-2xl px-4 py-3 sm:px-5"
      style={{
        background: "rgba(205, 216, 224, 0.65)",
        border: "1px solid rgba(42, 69, 112, 0.18)",
      }}
    >
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em]"
        style={{ color: NAVY }}
      >
        ✉ 방명록에 한마디
      </p>
      <div className="flex items-stretch gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="오늘의 항해자에게 한마디"
          maxLength={120}
          rows={2}
          className="min-w-0 flex-1 resize-none rounded-lg px-3 py-2 text-sm leading-relaxed outline-none focus:border-[rgba(42,69,112,0.5)]"
          style={{
            background: "rgba(255, 255, 255, 0.7)",
            color: NAVY,
            border: "1px solid rgba(42, 69, 112, 0.22)",
          }}
        />
        <button
          type="submit"
          disabled={disabled}
          className="flex-shrink-0 self-end rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ background: NAVY, color: CREAM }}
        >
          {done ? "전달됨" : "✦ 띄우기"}
        </button>
      </div>
    </form>
  );
}
