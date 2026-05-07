"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { MemberCard, type MemberCardData } from "@/app/components/redesign/MemberCard";

// Nicknames that have a real users doc but should never appear in the
// members list (test/staff accounts). Edit here to add or restore.
const HIDDEN_NICKNAMES = new Set<string>(["테스트"]);

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
  const isDawnlight2 = useDawnlight2();
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

        type MemberData = {
          nickname?: string;
          bio?: string;
          statusMessage?: string;
          profileImage?: string;
          mood?: string;
        };
        type UserData = {
          lastAttendance?: Timestamp;
          password?: string;
        };

        // Build a nickname-keyed lookup over members so we can find both
        // legacy slot-keyed docs (id="14", nickname="언쏘") and any
        // future nickname-keyed docs in one shot. If duplicates exist for
        // the same nickname (shouldn't, after cleanup), prefer the doc
        // whose profile data is more populated.
        type MemberHit = { id: string; data: MemberData };
        const memberByNickname = new Map<string, MemberHit>();
        const score = (d: MemberData) =>
          [d.statusMessage, d.mood, d.profileImage, d.bio]
            .filter((v) => typeof v === "string" && v.trim().length > 0).length;
        membersSnap.forEach((d) => {
          const data = d.data() as MemberData;
          const nick = (data.nickname ?? "").trim();
          if (!nick) return;
          const existing = memberByNickname.get(nick);
          if (!existing || score(data) > score(existing.data)) {
            memberByNickname.set(nick, { id: d.id, data });
          }
        });

        // Drive the list off users (every real signup), and join with
        // members by nickname. Having a members doc = pressed "프로필
        // 등록" / claim button at some point → 빛나는 별. No members
        // doc = 잠든 별. The legacy `members/{slot_id}` schema is dead
        // — there's no MEMBER_SLOTS list anymore; we just look the doc
        // up by its nickname field.
        const cards: MemberCardData[] = [];
        usersSnap.forEach((u) => {
          const userData = u.data() as UserData;
          if (typeof userData.password !== "string") return; // junk doc
          const nickname = u.id;
          if (HIDDEN_NICKNAMES.has(nickname)) return;
          const hit = memberByNickname.get(nickname);
          const last = userData.lastAttendance;
          const lastSeenHours = last
            ? (now - last.toMillis()) / (1000 * 60 * 60)
            : undefined;
          if (hit) {
            cards.push({
              id: hit.id, // preserve legacy slot id for routing
              nickname,
              bio: hit.data.bio || hit.data.statusMessage || "",
              profileImage: hit.data.profileImage || "",
              registered: true,
              lastSeenHours,
            });
          } else {
            cards.push({
              id: nickname,
              nickname,
              bio: "",
              profileImage: "",
              registered: false,
              lastSeenHours,
            });
          }
        });

        setMembers(cards);
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
        ? unregistered.filter(
            (m) =>
              m.id.toLowerCase().includes(q) ||
              m.nickname.toLowerCase().includes(q),
          )
        : unregistered,
    [unregistered, q],
  );

  const hasAnyResult =
    filteredRegistered.length + filteredUnregistered.length > 0;

  if (isDawnlight2) {
    return (
      <div className="dawnlight2 dl2-members relative mx-auto max-w-2xl px-4 pt-3">
        {/* Page head — left-aligned cream title + MEMBERS subtitle. */}
        <header className="mb-6">
          <h1
            className="text-xl font-semibold leading-tight text-cream"
            style={{ letterSpacing: "0.02em" }}
          >
            길드원
          </h1>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.32em] text-mist-lavender">
            MEMBERS
          </p>
        </header>

        {/* Search — cream-toned transparent box (cosmic 패턴 유지, 색만 매핑). */}
        <section className="mb-8">
          <div className="relative mx-auto max-w-sm">
            <span
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: "#fef5e6" }}
            >
              <StarSearchIcon />
            </span>
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="닉네임을 검색하세요"
              aria-label="닉네임 검색"
              className="w-full rounded-full py-2.5 pl-10 pr-4 text-sm focus:outline-none"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(254, 245, 230, 0.3)",
                color: "#fef5e6",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#fef5e6";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(254, 245, 230, 0.3)";
              }}
            />
          </div>
        </section>

        {!loaded && (
          <div className="flex justify-center py-20">
            <p
              className="text-[12px] italic"
              style={{ color: "rgba(254, 245, 230, 0.65)" }}
            >
              길드원을 불러오는 중...
            </p>
          </div>
        )}

        {loaded && !hasAnyResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center"
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(254, 245, 230, 0.2)",
            }}
          >
            <span
              className="mb-4 text-3xl"
              style={{ color: "#ffc785" }}
              aria-hidden
            >
              ✦
            </span>
            <p
              className="break-keep text-sm italic"
              style={{ color: "#fef5e6" }}
            >
              찾는 길드원이 보이지 않아요
            </p>
            <p
              className="mt-2 text-[10px] tracking-wider"
              style={{ color: "rgba(200, 184, 232, 0.85)" }}
            >
              다른 닉네임으로 시도해보세요
            </p>
          </motion.div>
        )}

        {loaded && filteredRegistered.length > 0 && (
          <section className="mb-10">
            <header className="mb-4">
              <h2
                className="text-base font-semibold leading-tight text-cream sm:text-lg"
                style={{ letterSpacing: "0.02em" }}
              >
                하늘 위의 동료들
              </h2>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.32em] text-mist-lavender">
                SOARING COMPANIONS
              </p>
            </header>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {filteredRegistered.map((m, i) => (
                <MemberCard key={m.id} member={m} index={i} dl2 />
              ))}
            </div>
          </section>
        )}

        {loaded && filteredUnregistered.length > 0 && (
          <section className="mb-6">
            <header className="mb-4">
              <h2
                className="text-base font-semibold leading-tight sm:text-lg"
                style={{
                  color: "rgba(254, 245, 230, 0.8)",
                  letterSpacing: "0.02em",
                }}
              >
                아직 깃발이 없는 섬
              </h2>
              <p
                className="mt-1 text-[10px] font-medium uppercase tracking-[0.32em]"
                style={{ color: "rgba(200, 184, 232, 0.7)" }}
              >
                UNCLAIMED ISLES
              </p>
            </header>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {filteredUnregistered.map((m, i) => (
                <MemberCard key={m.id} member={m} index={i} dl2 />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

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
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {filteredUnregistered.map((m, i) => (
              <MemberCard key={m.id} member={m} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
