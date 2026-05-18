"use client";

// /admin/guilds — 관리자 페이지: 길마/부길마 지정 + 사용자 길드 이동.
// 옛 admin 가드 패턴 1:1 (비번 dawnlight2024 단일 게이트).
// Phase 4 신규 (2026-05-18).

import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
import { useGuilds, type Guild } from "@/src/lib/useGuilds";

const ADMIN_PASSWORD = "dawnlight2024";

// 옛 cosmic admin 톤은 어두운 배경 + 흰 글자라 .loginbar-input 의
// 기본 input/select 글자도 흰색이 상속됨. 드롭다운 열렸을 때 option
// 텍스트가 cream bg + 흰 글자로 안 보이는 문제 해결을 위해 select/
// option 양쪽에 명시적 cream bg + ink 글자 강제.
const SELECT_STYLE: React.CSSProperties = {
  maxWidth: 180,
  background: "#fef5e6",
  color: "#2a1f4a",
};
const OPTION_STYLE: React.CSSProperties = {
  background: "#fef5e6",
  color: "#2a1f4a",
};

type UserRow = {
  nickname: string;
  guildId: string;
};

function isKorean(s: string) {
  return /[가-힯]/.test(s.charAt(0));
}

function nicknameCompare(a: string, b: string) {
  const aKo = isKorean(a);
  const bKo = isKorean(b);
  if (aKo !== bKo) return aKo ? 1 : -1;
  return a.localeCompare(b, aKo ? "ko" : "en");
}

export default function AdminGuildsPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");

  const guilds = useGuilds();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [actionErr, setActionErr] = useState("");

  useEffect(() => {
    if (!verified) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list: UserRow[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (typeof data.password !== "string") return; // junk doc
        list.push({
          nickname: d.id,
          guildId: typeof data.guildId === "string" ? data.guildId : "",
        });
      });
      list.sort((a, b) => nicknameCompare(a.nickname, b.nickname));
      setUsers(list);
    });
    return () => unsub();
  }, [verified]);

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setErr("");
    setVerified(true);
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <h1 className="admin-exchange-title">길드 관리</h1>
        <div className="admin-exchange-gate">
          <input
            type="password"
            className="loginbar-input"
            placeholder="관리자 비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            autoFocus
          />
          <button className="minihome-btn" onClick={handleVerify}>
            확인
          </button>
          {err && <p className="loginbar-error">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-exchange">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 className="admin-exchange-title">길드 관리</h1>

      {actionErr && (
        <p className="loginbar-error" style={{ marginBottom: 12 }}>
          {actionErr}
        </p>
      )}

      {guilds.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.7)", padding: "1rem 0" }}>
          등록된 길드가 없습니다.
        </p>
      )}

      {guilds.map((g) => (
        <GuildAdminCard
          key={g.id}
          guild={g}
          users={users}
          onError={setActionErr}
        />
      ))}

      <UserGuildMoveSection
        users={users}
        guilds={guilds}
        onError={setActionErr}
      />
    </div>
  );
}

function GuildAdminCard({
  guild,
  users,
  onError,
}: {
  guild: Guild;
  users: UserRow[];
  onError: (msg: string) => void;
}) {
  const [pickLeader, setPickLeader] = useState("");
  const [pickVice, setPickVice] = useState("");
  const [working, setWorking] = useState(false);

  const guildUsers = useMemo(
    () => users.filter((u) => u.guildId === guild.id),
    [users, guild.id],
  );

  const leader = guild.leader;
  const viceLeaders = guild.viceLeaders ?? [];

  // 부길마 추가 후보: 같은 길드 멤버 중 현재 길마/부길마 제외
  const viceCandidates = guildUsers.filter(
    (u) => u.nickname !== leader && !viceLeaders.includes(u.nickname),
  );

  // 길마 변경 후보: 같은 길드 멤버 (현재 길마 제외)
  const leaderCandidates = guildUsers.filter((u) => u.nickname !== leader);

  const setLeader = async (newLeader: string) => {
    if (!newLeader) return;
    setWorking(true);
    onError("");
    try {
      // 새 길마가 기존 부길마였으면 부길마에서 제거 (중복 방지)
      const wasVice = viceLeaders.includes(newLeader);
      const patch: Record<string, unknown> = { leader: newLeader };
      if (wasVice) patch.viceLeaders = arrayRemove(newLeader);
      await updateDoc(doc(db, "guilds", guild.id), patch);
      setPickLeader("");
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "길마 변경 실패");
    }
    setWorking(false);
  };

  const clearLeader = async () => {
    if (!confirm(`${guild.name} 길마를 비우시겠습니까?`)) return;
    setWorking(true);
    onError("");
    try {
      await updateDoc(doc(db, "guilds", guild.id), { leader: null });
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "길마 비우기 실패");
    }
    setWorking(false);
  };

  const addVice = async (nickname: string) => {
    if (!nickname) return;
    if (nickname === leader) {
      onError("길마는 부길마로 지정할 수 없습니다.");
      return;
    }
    setWorking(true);
    onError("");
    try {
      await updateDoc(doc(db, "guilds", guild.id), {
        viceLeaders: arrayUnion(nickname),
      });
      setPickVice("");
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "부길마 추가 실패");
    }
    setWorking(false);
  };

  const removeVice = async (nickname: string) => {
    setWorking(true);
    onError("");
    try {
      await updateDoc(doc(db, "guilds", guild.id), {
        viceLeaders: arrayRemove(nickname),
      });
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "부길마 제거 실패");
    }
    setWorking(false);
  };

  return (
    <section
      style={{
        marginBottom: 20,
        padding: 16,
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h2
          style={{
            margin: 0,
            color: "#daa520",
            fontFamily: "'Noto Serif KR', serif",
            fontSize: "1.1rem",
          }}
        >
          {guild.name}{" "}
          <span
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "0.8rem",
              marginLeft: 6,
            }}
          >
            ({guildUsers.length}명 · id: {guild.id})
          </span>
        </h2>
      </header>

      {/* 길마 */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 6px", color: "#daa520", fontSize: "0.85rem" }}>
          ◆ 길마
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "#fff", minWidth: 80 }}>
            {leader ?? <em style={{ color: "rgba(255,255,255,0.5)" }}>없음</em>}
          </span>
          <select
            className="loginbar-input"
            value={pickLeader}
            onChange={(e) => setPickLeader(e.target.value)}
            disabled={working}
            style={SELECT_STYLE}
          >
            <option value="" style={OPTION_STYLE}>길마로 지정할 사람 선택</option>
            {leaderCandidates.map((u) => (
              <option key={u.nickname} value={u.nickname} style={OPTION_STYLE}>
                {u.nickname}
              </option>
            ))}
          </select>
          <button
            className="minihome-btn"
            onClick={() => setLeader(pickLeader)}
            disabled={working || !pickLeader}
          >
            지정
          </button>
          {leader && (
            <button
              className="minihome-btn"
              onClick={clearLeader}
              disabled={working}
              style={{ background: "rgba(220, 38, 38, 0.7)" }}
            >
              비우기
            </button>
          )}
        </div>
      </div>

      {/* 부길마 */}
      <div>
        <p style={{ margin: "0 0 6px", color: "#c8b8e8", fontSize: "0.85rem" }}>
          ◆ 부길마 ({viceLeaders.length}명)
        </p>
        {viceLeaders.length > 0 && (
          <ul
            style={{
              margin: "0 0 8px",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {viceLeaders.map((v) => (
              <li
                key={v}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: "rgba(200,184,232,0.15)",
                  border: "1px solid rgba(200,184,232,0.4)",
                  borderRadius: 999,
                  color: "#fff",
                  fontSize: "0.85rem",
                }}
              >
                {v}
                <button
                  className="minihome-btn"
                  onClick={() => removeVice(v)}
                  disabled={working}
                  style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                  aria-label={`${v} 부길마 제거`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select
            className="loginbar-input"
            value={pickVice}
            onChange={(e) => setPickVice(e.target.value)}
            disabled={working || viceCandidates.length === 0}
            style={SELECT_STYLE}
          >
            <option value="" style={OPTION_STYLE}>부길마 추가</option>
            {viceCandidates.map((u) => (
              <option key={u.nickname} value={u.nickname} style={OPTION_STYLE}>
                {u.nickname}
              </option>
            ))}
          </select>
          <button
            className="minihome-btn"
            onClick={() => addVice(pickVice)}
            disabled={working || !pickVice}
          >
            추가
          </button>
        </div>
      </div>
    </section>
  );
}

function UserGuildMoveSection({
  users,
  guilds,
  onError,
}: {
  users: UserRow[];
  guilds: Guild[];
  onError: (msg: string) => void;
}) {
  const [pickUser, setPickUser] = useState("");
  const [pickGuild, setPickGuild] = useState("");
  const [working, setWorking] = useState(false);

  const currentGuildId = users.find((u) => u.nickname === pickUser)?.guildId ?? "";
  const sameGuild = pickGuild !== "" && pickGuild === currentGuildId;
  const canMove = !!pickUser && !!pickGuild && !sameGuild && !working;

  const handleMove = async () => {
    if (!canMove) return;
    const newGuild = guilds.find((g) => g.id === pickGuild);
    if (!newGuild) {
      onError("이동할 길드를 찾을 수 없습니다.");
      return;
    }
    if (!confirm(`"${pickUser}" 을(를) ${newGuild.name} 으로 이동합니다.`)) return;
    setWorking(true);
    onError("");
    try {
      // (1) 옛 길드에서 길마/부길마였으면 제거
      const oldGuild = guilds.find((g) => g.id === currentGuildId);
      if (oldGuild) {
        const patch: Record<string, unknown> = {};
        if (oldGuild.leader === pickUser) patch.leader = null;
        if ((oldGuild.viceLeaders ?? []).includes(pickUser)) {
          patch.viceLeaders = arrayRemove(pickUser);
        }
        if (Object.keys(patch).length > 0) {
          await updateDoc(doc(db, "guilds", oldGuild.id), patch);
        }
      }
      // (2) users 문서 guildId 만 update (다른 필드 정밀 보존)
      await updateDoc(doc(db, "users", pickUser), { guildId: pickGuild });
      setPickUser("");
      setPickGuild("");
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "길드 이동 실패");
    }
    setWorking(false);
  };

  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: "0 0 12px",
          color: "#daa520",
          fontFamily: "'Noto Serif KR', serif",
          fontSize: "1.05rem",
        }}
      >
        사용자 길드 이동
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          className="loginbar-input"
          value={pickUser}
          onChange={(e) => setPickUser(e.target.value)}
          disabled={working}
          style={SELECT_STYLE}
        >
          <option value="" style={OPTION_STYLE}>사용자 선택</option>
          {users.map((u) => (
            <option key={u.nickname} value={u.nickname} style={OPTION_STYLE}>
              {u.nickname}
              {u.guildId ? ` (${u.guildId})` : ""}
            </option>
          ))}
        </select>
        <span style={{ color: "rgba(255,255,255,0.5)" }}>→</span>
        <select
          className="loginbar-input"
          value={pickGuild}
          onChange={(e) => setPickGuild(e.target.value)}
          disabled={working || !pickUser}
          style={SELECT_STYLE}
        >
          <option value="" style={OPTION_STYLE}>이동할 길드</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id} style={OPTION_STYLE}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          className="minihome-btn"
          onClick={handleMove}
          disabled={!canMove}
        >
          이동
        </button>
        {sameGuild && (
          <span style={{ color: "rgba(220, 38, 38, 0.9)", fontSize: "0.8rem" }}>
            현재 길드와 동일합니다.
          </span>
        )}
      </div>
    </section>
  );
}
