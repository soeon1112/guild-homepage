"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { MemberCard, type MemberCardData } from "@/app/components/redesign/MemberCard";

const MEMBER_SLOTS: string[] = [
  "a", "1", "1-2",
  "2", "3", "4", "6", "7", "8", "9",
  "12", "13", "14", "14-1", "15", "16", "17", "17-1", "18", "19", "20", "21", "22",
];

function isKorean(s: string) {
  return /[가-힯]/.test(s.charAt(0));
}

function nicknameCompare(a: string, b: string) {
  const aKo = isKorean(a);
  const bKo = isKorean(b);
  if (aKo !== bKo) return aKo ? 1 : -1;
  return a.localeCompare(b, aKo ? "ko" : "en");
}

function StarSearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path
        d="M10 2 L11.2 7.8 L17 9 L11.2 10.2 L10 16 L8.8 10.2 L3 9 L8.8 7.8 Z"
        fill="currentColor"
        opacity="0.55"
      />
      <circle cx="10" cy="9" r="5.5" />
      <path d="M14.5 13.5 L20 19" />
    </svg>
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState<MemberCardData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [queryText, setQueryText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [membersSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "members")),
          getDocs(collection(db, "users")),
        ]);
        if (cancelled) return;

        const now = Date.now();

        const memberById = new Map<
          string,
          {
            nickname?: string;
            bio?: string;
            statusMessage?: string;
            profileImage?: string;
          }
        >();
        membersSnap.forEach((d) => {
          memberById.set(d.id, d.data());
        });

        const userByNickname = new Map<
          string,
          { lastAttendance?: Timestamp }
        >();
        usersSnap.forEach((u) => {
          userByNickname.set(u.id, u.data() as { lastAttendance?: Timestamp });
        });

        const list: MemberCardData[] = MEMBER_SLOTS.map((id) => {
          const data = memberById.get(id);
          if (!data) {
            return {
              id,
              nickname: "",
              bio: "",
              profileImage: "",
              registered: false,
            };
          }
          const nickname = data.nickname ?? "";
          const user = nickname ? userByNickname.get(nickname) : undefined;
          const last = user?.lastAttendance;
          const lastSeenHours = last
            ? (now - last.toMillis()) / (1000 * 60 * 60)
            : undefined;
          return {
            id,
            nickname,
            bio: data.bio || data.statusMessage || "",
            profileImage: data.profileImage || "",
            registered: true,
            lastSeenHours,
          };
        });

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

  const q = queryText.trim().toLowerCase();

  const registered = useMemo(
    () => members.filter((m) => m.registered),
    [members],
  );
  const unregistered = useMemo(
    () => members.filter((m) => !m.registered),
    [members],
  );

  const filteredRegistered = useMemo(
    () =>
      registered
        .filter((m) => m.nickname.toLowerCase().includes(q))
        .sort((a, b) => nicknameCompare(a.nickname, b.nickname)),
    [registered, q],
  );
  const filteredUnregistered = useMemo(
    () =>
      q
        ? unregistered.filter((m) => m.id.toLowerCase().includes(q))
        : unregistered,
    [unregistered, q],
  );

  const hasAnyResult =
    filteredRegistered.length + filteredUnregistered.length > 0;

  return (
    <div className="relative mx-auto max-w-2xl px-4 pt-3 text-text-primary">
      <section className="mb-8">
        <div className="relative mx-auto max-w-sm">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nebula-pink/80">
            <StarSearchIcon />
          </span>
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="닉네임을 검색하세요"
            aria-label="닉네임 검색"
            className="w-full rounded-full border border-nebula-pink/25 bg-abyss-deep/40 py-2.5 pl-10 pr-4 font-serif text-sm text-text-primary placeholder:text-text-sub/70 focus:border-nebula-pink/60 focus:outline-none focus:ring-2 focus:ring-nebula-pink/20"
            style={{
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow:
                "inset 0 1px 0 rgba(255,229,196,0.04), 0 0 14px rgba(107,75,168,0.15)",
            }}
          />
        </div>
      </section>

      {!loaded && (
        <div className="flex justify-center py-20">
          <p className="font-serif text-[11px] italic text-text-sub/70">
            별들을 불러오는 중...
          </p>
        </div>
      )}

      {loaded && !hasAnyResult && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-nebula-pink/15 bg-abyss-deep/30 px-6 py-16 text-center backdrop-blur-md"
        >
          <span
            className="mb-4 text-3xl text-text-sub/60"
            style={{ filter: "drop-shadow(0 0 10px rgba(216,150,200,0.5))" }}
            aria-hidden
          >
            ✦
          </span>
          <p className="break-keep font-serif text-sm italic text-text-sub text-balance">
            찾는 별이 보이지 않아요
          </p>
          <p className="mt-2 font-serif text-[10px] tracking-wider text-text-sub/70">
            다른 닉네임으로 시도해보세요
          </p>
        </motion.div>
      )}

      {loaded && filteredRegistered.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-nebula-pink/30 to-transparent" />
            <h2 className="font-serif text-[11px] tracking-[0.35em] text-stardust uppercase">
              빛나는 별들
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-nebula-pink/30 to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {filteredRegistered.map((m, i) => (
              <MemberCard key={m.id} member={m} index={i} />
            ))}
          </div>
        </section>
      )}

      {loaded && filteredUnregistered.length > 0 && (
        <section className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-text-sub/20 to-transparent" />
            <h2 className="font-serif text-[11px] tracking-[0.35em] text-text-sub uppercase">
              아직 잠든 별들
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-text-sub/20 to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {filteredUnregistered.map((m, i) => (
              <MemberCard key={m.id} member={m} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
