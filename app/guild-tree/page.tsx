"use client";

// 하늘섬 가계도 — 연합 길드 구성을 한눈에 보는 읽기 전용 페이지.
// guilds 컬렉션을 펴서 길마/부길마/길원 트리로 표시. Phase 3 신규 (2026-05-18).
//
// 동작:
//   - useGuilds() onSnapshot 로 길드 목록 실시간
//   - users + members 1회 fetch 후 client-side group by guildId
//   - 영문 → 한글 순 정렬 (members/page.tsx 와 동일 패턴)
//   - HIDDEN_NICKNAMES (["테스트"]) 필터
//   - 카드 접고/펼치기 (디폴트 펼침)
//   - 길원 닉네임 클릭 → /members/{id} (slot id 또는 nickname)

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, type Timestamp } from "firebase/firestore";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Crown, Star, TreePine } from "lucide-react";
import { db } from "@/src/lib/firebase";
import { useGuilds, guildAccent } from "@/src/lib/useGuilds";

const HIDDEN_NICKNAMES = new Set<string>(["테스트"]);

// 길드별 로고. 여기 없는 (로고 미보유) 길드는 렌더 스킵.
const GUILD_LOGOS: Record<string, string> = {};

function isKorean(s: string) {
  return /[가-힯]/.test(s.charAt(0));
}

function nicknameCompare(a: string, b: string) {
  const aKo = isKorean(a);
  const bKo = isKorean(b);
  if (aKo !== bKo) return aKo ? 1 : -1;
  return a.localeCompare(b, aKo ? "ko" : "en");
}

type UserEntry = {
  nickname: string;
  guildId: string;
  routeId: string; // slot id (members doc) 또는 nickname (잠든 별)
  profileImage: string;
  registered: boolean;
};

type MemberData = {
  nickname?: string;
  profileImage?: string;
};

type UserData = {
  guildId?: string;
  password?: string;
};

export default function GuildTreePage() {
  const guilds = useGuilds();
  const [usersByGuild, setUsersByGuild] = useState<Map<string, UserEntry[]>>(
    new Map(),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [membersSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "members")),
          getDocs(collection(db, "users")),
        ]);
        if (cancelled) return;

        // members → nickname-keyed lookup (slot id 보존 위해)
        const memberByNick = new Map<string, { id: string; data: MemberData }>();
        membersSnap.forEach((d) => {
          const data = d.data() as MemberData;
          const nick = (data.nickname ?? "").trim();
          if (!nick) return;
          memberByNick.set(nick, { id: d.id, data });
        });

        const grouped = new Map<string, UserEntry[]>();
        usersSnap.forEach((u) => {
          const userData = u.data() as UserData;
          if (typeof userData.password !== "string") return;
          const nickname = u.id;
          if (HIDDEN_NICKNAMES.has(nickname)) return;
          const guildId = userData.guildId ?? "_orphan";
          const hit = memberByNick.get(nickname);
          const entry: UserEntry = {
            nickname,
            guildId,
            routeId: hit?.id ?? nickname,
            profileImage: hit?.data.profileImage ?? "",
            registered: !!hit,
          };
          if (!grouped.has(guildId)) grouped.set(guildId, []);
          grouped.get(guildId)!.push(entry);
        });

        setUsersByGuild(grouped);
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

  return (
    <div className="dl2-guild-tree relative mx-auto max-w-2xl px-4 pt-3 pb-20">
      <header className="mb-8 text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-mist-lavender">
          SKY ISLAND
        </p>
        <h1
          className="mt-2 text-xl font-semibold leading-tight text-cream"
          style={{ letterSpacing: "0.02em" }}
        >
          하늘섬 가계도
        </h1>
        <p className="mt-2 text-sm italic" style={{ color: "rgba(200, 184, 232, 0.85)" }}>
          연합 길드 {guilds.length}곳
        </p>
      </header>

      {!loaded && (
        <div className="flex justify-center py-20">
          <p className="text-[12px] italic" style={{ color: "rgba(254, 245, 230, 0.65)" }}>
            가계도를 그리는 중...
          </p>
        </div>
      )}

      {loaded && guilds.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-cream/15 bg-twilight-deep/30 px-6 py-16 text-center">
          <TreePine className="mb-3 h-8 w-8" style={{ color: "#ffc785" }} />
          <p className="text-sm italic" style={{ color: "#fef5e6" }}>
            아직 등록된 길드가 없어요
          </p>
        </div>
      )}

      {loaded &&
        guilds.map((g) => (
          <GuildCard
            key={g.id}
            guild={g}
            members={(usersByGuild.get(g.id) ?? []).slice().sort((a, b) =>
              nicknameCompare(a.nickname, b.nickname),
            )}
          />
        ))}
    </div>
  );
}

function GuildCard({
  guild,
  members,
}: {
  guild: {
    id: string;
    name: string;
    leader: string | null;
    viceLeaders: string[];
    createdAt?: Timestamp;
  };
  members: UserEntry[];
}) {
  const [open, setOpen] = useState(false);

  const leader = guild.leader;
  const viceLeaders = guild.viceLeaders ?? [];
  const leaderSet = useMemo(
    () => new Set<string>([leader, ...viceLeaders].filter((x): x is string => !!x)),
    [leader, viceLeaders],
  );
  const regularMembers = members.filter((m) => !leaderSet.has(m.nickname));
  const logo = GUILD_LOGOS[guild.id];

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl border"
      style={{
        background: "rgba(11, 8, 33, 0.4)",
        borderColor: "rgba(254, 245, 230, 0.15)",
        boxShadow: "0 4px 18px rgba(11, 8, 33, 0.3)",
      }}
    >
      {/* Header — accent stripe + 길드명 + 길원 수 + chevron */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-cream/5"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-6 w-1 rounded-full"
            style={{ background: guildAccent(guild.id).hex }}
          />
          <div>
            <h2
              className="text-lg font-semibold leading-tight text-cream"
              style={{ letterSpacing: "0.02em" }}
            >
              {guild.name}
            </h2>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-[0.3em]"
              style={{ color: "rgba(200, 184, 232, 0.7)" }}
            >
              {members.length}명
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "#c8b8e8" }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5">
              {logo && (
                <div className="mb-3 flex justify-center">
                  <img
                    src={logo}
                    alt={`${guild.name} 로고`}
                    className="h-[180px] w-[180px] object-contain"
                  />
                </div>
              )}
              {/* 길마 — 큰 프사 + 왕관 overlay + 가운데 단일 카드 */}
              <div className="mb-6 flex flex-col items-center">
                <div className="mb-2 flex items-center gap-1.5">
                  <Crown className="h-3.5 w-3.5" style={{ color: "#ffc785" }} />
                  <span
                    className="text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: "rgba(255, 199, 133, 0.85)" }}
                  >
                    LEADER
                  </span>
                </div>
                {leader ? (
                  <LeaderCard nickname={leader} entry={findEntry(leader, members)} />
                ) : (
                  <p className="text-xs italic" style={{ color: "rgba(254, 245, 230, 0.5)" }}>
                    아직 지정되지 않음
                  </p>
                )}
              </div>

              {/* 부길마 — 중간 프사 + 별 overlay + 가로 wrap */}
              <div className="mb-6 flex flex-col items-center">
                <div className="mb-2 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" style={{ color: "#c8b8e8" }} />
                  <span
                    className="text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: "rgba(200, 184, 232, 0.85)" }}
                  >
                    VICE
                  </span>
                </div>
                {viceLeaders.length === 0 ? (
                  <p className="text-xs italic" style={{ color: "rgba(254, 245, 230, 0.5)" }}>
                    아직 지정되지 않음
                  </p>
                ) : (
                  <div className="flex flex-wrap justify-center gap-3">
                    {viceLeaders.map((v) => (
                      <ViceCard key={v} nickname={v} entry={findEntry(v, members)} />
                    ))}
                  </div>
                )}
              </div>

              {/* 길원 — grid */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <span
                    className="text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: "rgba(254, 245, 230, 0.7)" }}
                  >
                    MEMBERS · {regularMembers.length}
                  </span>
                </div>
                {regularMembers.length === 0 ? (
                  <p
                    className="py-4 text-center text-xs italic"
                    style={{ color: "rgba(254, 245, 230, 0.45)" }}
                  >
                    아직 길원이 없어요
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {regularMembers.map((m) => (
                      <Link
                        key={m.nickname}
                        href={`/members/${m.routeId}`}
                        className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-all hover:scale-[1.02]"
                        style={{
                          background: m.registered
                            ? "rgba(255, 199, 133, 0.08)"
                            : "rgba(255, 255, 255, 0.04)",
                          borderColor: m.registered
                            ? "rgba(255, 199, 133, 0.25)"
                            : "rgba(254, 245, 230, 0.12)",
                        }}
                      >
                        {m.profileImage ? (
                          <img
                            src={m.profileImage}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                            style={{ border: "1px solid rgba(254, 245, 230, 0.25)" }}
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[10px]"
                            style={{
                              background: "rgba(254, 245, 230, 0.08)",
                              color: "rgba(254, 245, 230, 0.45)",
                            }}
                          >
                            ✦
                          </span>
                        )}
                        <span
                          className="truncate text-[12px] font-medium"
                          style={{
                            color: m.registered
                              ? "#fef5e6"
                              : "rgba(254, 245, 230, 0.55)",
                          }}
                        >
                          {m.nickname}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function nicknameToRouteId(nickname: string, members: UserEntry[]): string {
  return members.find((m) => m.nickname === nickname)?.routeId ?? nickname;
}

function findEntry(nickname: string, members: UserEntry[]): UserEntry | null {
  return members.find((m) => m.nickname === nickname) ?? null;
}

function LeaderCard({
  nickname,
  entry,
}: {
  nickname: string;
  entry: UserEntry | null;
}) {
  const routeId = entry?.routeId ?? nickname;
  const profileImage = entry?.profileImage ?? "";
  const registered = !!entry?.registered;
  return (
    <Link
      href={`/members/${routeId}`}
      className="flex flex-col items-center gap-2 rounded-2xl border px-5 py-4 transition-all hover:scale-[1.02]"
      style={{
        background: "rgba(255, 199, 133, 0.12)",
        borderColor: "rgba(255, 199, 133, 0.45)",
      }}
    >
      <span className="relative">
        {profileImage ? (
          <img
            src={profileImage}
            alt=""
            className="h-24 w-24 rounded-full object-cover"
            style={{ border: "2px solid rgba(255, 199, 133, 0.6)" }}
          />
        ) : (
          <span
            aria-hidden
            className="flex h-24 w-24 items-center justify-center rounded-full text-2xl"
            style={{
              background: "rgba(255, 199, 133, 0.12)",
              border: "2px solid rgba(255, 199, 133, 0.45)",
              color: registered ? "#ffc785" : "rgba(254, 245, 230, 0.45)",
            }}
          >
            ✦
          </span>
        )}
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: "#ffc785",
            boxShadow: "0 0 8px rgba(255, 199, 133, 0.6)",
          }}
        >
          <Crown className="h-3.5 w-3.5" style={{ color: "#2a1f4a" }} />
        </span>
      </span>
      <span
        className="text-base font-semibold tracking-wide"
        style={{ color: "#ffc785" }}
      >
        {nickname}
      </span>
    </Link>
  );
}

function ViceCard({
  nickname,
  entry,
}: {
  nickname: string;
  entry: UserEntry | null;
}) {
  const routeId = entry?.routeId ?? nickname;
  const profileImage = entry?.profileImage ?? "";
  const registered = !!entry?.registered;
  return (
    <Link
      href={`/members/${routeId}`}
      className="flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-3 transition-all hover:scale-[1.02]"
      style={{
        background: "rgba(200, 184, 232, 0.1)",
        borderColor: "rgba(200, 184, 232, 0.35)",
      }}
    >
      <span className="relative">
        {profileImage ? (
          <img
            src={profileImage}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
            style={{ border: "1.5px solid rgba(200, 184, 232, 0.5)" }}
          />
        ) : (
          <span
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl"
            style={{
              background: "rgba(200, 184, 232, 0.1)",
              border: "1.5px solid rgba(200, 184, 232, 0.35)",
              color: registered ? "#c8b8e8" : "rgba(254, 245, 230, 0.45)",
            }}
          >
            ✦
          </span>
        )}
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full"
          style={{
            background: "#c8b8e8",
            boxShadow: "0 0 6px rgba(200, 184, 232, 0.6)",
          }}
        >
          <Star className="h-2.5 w-2.5" style={{ color: "#2a1f4a" }} />
        </span>
      </span>
      <span
        className="text-sm font-medium"
        style={{ color: "#c8b8e8" }}
      >
        {nickname}
      </span>
    </Link>
  );
}
