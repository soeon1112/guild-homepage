// /admin/pet-logs — admin viewer for pet chat conversations.
// Mirrors the password-gate pattern used by /admin/activity etc.
//
// Layout:
//   ┌────────────────┬─────────────────────────────────┐
//   │ User list      │ Selected user's chat thread     │
//   │ (sidebar)      │ (KakaoTalk-style date dividers, │
//   │                │  user msg right / pet msg left) │
//   └────────────────┴─────────────────────────────────┘
//
// Data:
//   - petChatLogs/{nickname}                summary {nickname, petName,
//                                            petType, petStage, lastChatAt}
//   - petChatLogs/{nickname}/messages       individual entries
//                                            {role, content, createdAt}
//   - users/{nickname}/pet/current          source of petChatBanned flag

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
import { PET_TYPE_LABEL_KO } from "@/src/lib/petChat";
import { PET_STAGES, type PetStage, type PetType } from "@/src/lib/pets";

const ADMIN_PASSWORD = "dawnlight2024";

type UserSummary = {
  nickname: string;
  petName?: string;
  petType?: PetType;
  petStage?: PetStage;
  lastChatAt?: Timestamp;
};

type ChatLogMessage = {
  id: string;
  role: "user" | "pet";
  content: string;
  createdAt?: Timestamp;
};

function formatDate(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(ts: Timestamp | undefined): string {
  if (!ts) return "";
  const d = ts.toDate();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${m}`;
}

function dateKey(ts: Timestamp | undefined): string {
  return formatDate(ts);
}

function formatLastChat(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return formatDate(ts);
}

export default function AdminPetLogsPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatLogMessage[]>([]);
  const [bannedSet, setBannedSet] = useState<Set<string>>(new Set());

  // Subscribe to summary docs once admin is verified.
  useEffect(() => {
    if (!verified) return;
    const ref = collection(db, "petChatLogs");
    const q = query(ref, orderBy("lastChatAt", "desc"));
    return onSnapshot(q, (snap) => {
      const next: UserSummary[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          nickname: d.id,
          petName: data.petName,
          petType: data.petType,
          petStage: data.petStage,
          lastChatAt: data.lastChatAt,
        };
      });
      setUsers(next);
    });
  }, [verified]);

  // Whenever the user list changes, refresh ban status by reading each
  // pet doc (they're tiny and the list is small — no need to subscribe).
  useEffect(() => {
    if (!verified || users.length === 0) {
      setBannedSet(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const banned = new Set<string>();
      await Promise.all(
        users.map(async (u) => {
          try {
            const petRef = doc(db, "users", u.nickname, "pet", "current");
            const petSnap = await getDoc(petRef);
            if (petSnap.exists() && petSnap.data().petChatBanned === true) {
              banned.add(u.nickname);
            }
          } catch {
            // skip
          }
        }),
      );
      if (!cancelled) setBannedSet(banned);
    })();
    return () => {
      cancelled = true;
    };
  }, [verified, users]);

  // Subscribe to selected user's messages.
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    const ref = collection(db, "petChatLogs", selected, "messages");
    const q = query(ref, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const next: ChatLogMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          role: data.role === "pet" ? "pet" : "user",
          content: String(data.content ?? ""),
          createdAt: data.createdAt,
        };
      });
      setMessages(next);
    });
  }, [selected]);

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setErr("");
    setVerified(true);
  };

  const toggleBan = async (nickname: string) => {
    const isBanned = bannedSet.has(nickname);
    const action = isBanned ? "차단을 해제" : "대화를 차단";
    if (!confirm(`${nickname}님의 펫 대화 ${action}하시겠습니까?`)) return;
    try {
      await setDoc(
        doc(db, "users", nickname, "pet", "current"),
        { petChatBanned: !isBanned },
        { merge: true },
      );
      setBannedSet((prev) => {
        const next = new Set(prev);
        if (isBanned) next.delete(nickname);
        else next.add(nickname);
        return next;
      });
    } catch (e) {
      console.error("toggleBan failed", e);
      alert("처리 실패");
    }
  };

  // Group messages by date for KakaoTalk-style separators.
  const groupedMessages = useMemo(() => {
    const groups: { date: string; entries: ChatLogMessage[] }[] = [];
    let currentDate = "";
    for (const m of messages) {
      const k = dateKey(m.createdAt);
      if (k !== currentDate) {
        currentDate = k;
        groups.push({ date: k, entries: [] });
      }
      groups[groups.length - 1].entries.push(m);
    }
    return groups;
  }, [messages]);

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <h1 className="admin-exchange-title">펫 대화 로그</h1>
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

  const selectedUser = users.find((u) => u.nickname === selected);

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14, color: "#f4efff" }}>
        펫 대화 로그
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 12,
          minHeight: 480,
        }}
      >
        {/* === Left: user list === */}
        <aside
          style={{
            background: "rgba(11,8,33,0.55)",
            border: "1px solid rgba(216,150,200,0.30)",
            borderRadius: 10,
            overflow: "hidden",
            maxHeight: 600,
            overflowY: "auto",
          }}
        >
          {users.length === 0 ? (
            <div style={{ padding: 16, color: "#a89cc4", fontSize: 12 }}>
              대화 기록이 있는 사용자가 없습니다.
            </div>
          ) : (
            users.map((u) => {
              const isSel = u.nickname === selected;
              const isBanned = bannedSet.has(u.nickname);
              const stageLabel =
                PET_STAGES.find((s) => s.id === u.petStage)?.label ?? "";
              return (
                <div
                  key={u.nickname}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(216,150,200,0.15)",
                    background: isSel ? "rgba(122,78,176,0.35)" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(u.nickname)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#f4efff",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {u.nickname}
                    </span>
                    {isBanned ? (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: "#7a2a3a",
                          color: "#FFD4D8",
                        }}
                      >
                        차단
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: "#a89cc4", marginTop: 2 }}>
                    {u.petName ?? "—"}
                    {u.petType ? ` · ${PET_TYPE_LABEL_KO[u.petType]}` : ""}
                    {stageLabel ? ` · ${stageLabel}` : ""}
                  </div>
                  <div style={{ fontSize: 10, color: "#7a6da0", marginTop: 2 }}>
                    {formatLastChat(u.lastChatAt)}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBan(u.nickname);
                    }}
                    style={{
                      marginTop: 6,
                      padding: "3px 8px",
                      fontSize: 10,
                      borderRadius: 4,
                      background: isBanned ? "#3a5a3a" : "#5a3a3a",
                      color: "#f4efff",
                      border: "1px solid rgba(216,150,200,0.30)",
                      cursor: "pointer",
                    }}
                  >
                    {isBanned ? "차단 해제" : "대화 차단"}
                  </button>
                </div>
              );
            })
          )}
        </aside>

        {/* === Right: chat thread === */}
        <section
          style={{
            background: "rgba(11,8,33,0.55)",
            border: "1px solid rgba(216,150,200,0.30)",
            borderRadius: 10,
            padding: 14,
            maxHeight: 600,
            overflowY: "auto",
          }}
        >
          {!selected ? (
            <div style={{ color: "#a89cc4", fontSize: 12, textAlign: "center", padding: "40px 0" }}>
              왼쪽에서 길드원을 선택하세요.
            </div>
          ) : (
            <>
              {selectedUser ? (
                <div
                  style={{
                    paddingBottom: 10,
                    marginBottom: 10,
                    borderBottom: "1px solid rgba(216,150,200,0.15)",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f4efff" }}>
                    {selectedUser.nickname}
                  </div>
                  <div style={{ fontSize: 11, color: "#a89cc4", marginTop: 2 }}>
                    {selectedUser.petName ?? "—"}
                    {selectedUser.petType ? ` · ${PET_TYPE_LABEL_KO[selectedUser.petType]}` : ""}
                  </div>
                </div>
              ) : null}
              {groupedMessages.length === 0 ? (
                <div
                  style={{
                    color: "#a89cc4",
                    fontSize: 12,
                    textAlign: "center",
                    padding: "40px 0",
                  }}
                >
                  대화 기록이 없습니다.
                </div>
              ) : (
                groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    <div
                      style={{
                        textAlign: "center",
                        margin: "12px 0",
                        fontSize: 10,
                        color: "#a89cc4",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 12,
                          background: "rgba(11,8,33,0.85)",
                          border: "1px solid rgba(216,150,200,0.30)",
                        }}
                      >
                        {group.date}
                      </span>
                    </div>
                    {group.entries.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          flexDirection: m.role === "user" ? "row-reverse" : "row",
                          alignItems: "flex-end",
                          gap: 6,
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "65%",
                            padding: "6px 10px",
                            borderRadius: 12,
                            background:
                              m.role === "user"
                                ? "#FFE5C4"
                                : "#FFFFFF",
                            color: "#1F2937",
                            fontSize: 12,
                            lineHeight: "16px",
                            wordBreak: "break-all",
                            overflowWrap: "anywhere",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {m.content}
                        </div>
                        <div style={{ fontSize: 9, color: "#a89cc4", whiteSpace: "nowrap" }}>
                          {formatTime(m.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
