"use client";

import { useEffect, useMemo, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
import { renameUser, type RenameReport } from "@/src/lib/userRename";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";

const ADMIN_PASSWORD = "dawnlight2024";

type UserRow = {
  id: string;
  nickname: string;
  points: number;
  createdAt: Timestamp | null;
};

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "-";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default function AdminUsersPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [working, setWorking] = useState(false);
  const [report, setReport] = useState<{ nick: string; r: RenameReport } | null>(
    null,
  );
  const [actionErr, setActionErr] = useState("");

  useEffect(() => {
    if (!verified) return;
    const unsub = onSnapshot(query(collection(db, "users")), (snap) => {
      const list: UserRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nickname: typeof data.nickname === "string" ? data.nickname : d.id,
          points: typeof data.points === "number" ? data.points : 0,
          createdAt: (data.createdAt as Timestamp | undefined) ?? null,
        };
      });
      list.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
      setUsers(list);
    });
    return () => unsub();
  }, [verified]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => u.nickname.toLowerCase().includes(s));
  }, [users, search]);

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setErr("");
    setVerified(true);
  };

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditValue(u.nickname);
    setActionErr("");
    setReport(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
    setActionErr("");
  };

  const handleRename = async (oldNick: string) => {
    const newNick = editValue.trim();
    if (!newNick) {
      setActionErr("새 닉네임을 입력해주세요.");
      return;
    }
    if (newNick === oldNick) {
      setActionErr("기존 닉네임과 동일합니다.");
      return;
    }
    if (
      !confirm(
        `"${oldNick}" → "${newNick}"\n\n유저 문서와 활동 데이터의 닉네임을 모두 변경합니다. 진행할까요?`,
      )
    ) {
      return;
    }
    setWorking(true);
    setActionErr("");
    setReport(null);
    try {
      const r = await renameUser(oldNick, newNick);
      setReport({ nick: newNick, r });
      setEditingId(null);
      setEditValue("");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "변경에 실패했습니다.";
      setActionErr(msg);
    }
    setWorking(false);
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <h1 className="admin-exchange-title">유저 관리</h1>
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
      <h1 className="admin-exchange-title">유저 관리</h1>

      <div className="admin-users-toolbar">
        <input
          type="text"
          className="loginbar-input"
          placeholder="닉네임 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="admin-users-count">총 {filtered.length}명</span>
      </div>

      {report && (
        <div className="admin-users-report">
          <strong>{report.nick}</strong>(으)로 변경 완료
          <ul>
            <li>방명록/흔적: {report.r.guestbookEntries}</li>
            <li>댓글: {report.r.comments}</li>
            <li>답글: {report.r.replies}</li>
            <li>채팅: {report.r.chatMessages}</li>
            <li>활동: {report.r.activities}</li>
            <li>게시글: {report.r.boardPosts}</li>
            <li>프로필(members): {report.r.members}</li>
            <li>앨범 업로더: {report.r.albumPhotos}</li>
            <li>앨범 태그: {report.r.albumPeopleTags}</li>
            <li>캐릭터: {report.r.characters}</li>
            <li>환전 요청: {report.r.exchangeRequests}</li>
            <li>편지: {report.r.letters}</li>
          </ul>
        </div>
      )}
      {actionErr && <p className="loginbar-error">{actionErr}</p>}

      {filtered.length === 0 ? (
        <p className="admin-exchange-empty">유저가 없습니다.</p>
      ) : (
        <div className="admin-exchange-table-wrap">
          <table className="admin-exchange-table">
            <thead>
              <tr>
                <th>닉네임</th>
                <th>포인트</th>
                <th>가입일</th>
                <th>닉네임 변경</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>{u.nickname}</td>
                  <td>{u.points}점</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    {editingId === u.id ? (
                      <div className="admin-users-edit">
                        <input
                          type="text"
                          className="loginbar-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          disabled={working}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="minihome-btn minihome-btn-small"
                          onClick={() => handleRename(u.nickname)}
                          disabled={working}
                        >
                          {working ? "변경 중..." : "저장"}
                        </button>
                        <button
                          type="button"
                          className="admin-letters-reject"
                          onClick={cancelEdit}
                          disabled={working}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="minihome-btn minihome-btn-small"
                        onClick={() => startEdit(u)}
                        disabled={working}
                      >
                        변경
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
