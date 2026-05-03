"use client";

// /admin/guild-test-results — password-gated viewer for the self-check
// responses. Mirrors the dawnlight2024 gate used by the other admin
// pages. Shows: total/per-result counts, response list with filters,
// per-response walkthrough, and a missing-members list (members
// collection minus those who have at least one response).

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import BackLink from "@/app/components/BackLink";
import {
  QUESTIONS,
  RESULTS,
  type QuestionId,
  type ResultKey,
} from "@/src/lib/guildTest";

const ADMIN_PASSWORD = "dawnlight2024";

type Row = {
  id: string;
  nickname: string;
  result: ResultKey;
  resultName: string;
  answers: string[]; // ["Q1-A", "Q2A-B", ...]
  createdAt: Timestamp | null;
  userAgent: string;
};

const RESULT_KEYS: ResultKey[] = ["A", "B", "C", "D", "E"];

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "-";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export default function AdminGuildTestResultsPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [filterResult, setFilterResult] = useState<ResultKey | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [memberNicknames, setMemberNicknames] = useState<string[]>([]);

  useEffect(() => {
    if (!verified) return;
    const q = query(
      collection(db, "guildTestResults"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Row[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nickname: typeof data.nickname === "string" ? data.nickname : "",
          result: (typeof data.result === "string" ? data.result : "D") as ResultKey,
          resultName:
            typeof data.resultName === "string" ? data.resultName : "",
          answers: Array.isArray(data.answers)
            ? data.answers.filter((x: unknown): x is string => typeof x === "string")
            : [],
          createdAt: (data.createdAt as Timestamp | undefined) ?? null,
          userAgent:
            typeof data.userAgent === "string" ? data.userAgent : "",
        };
      });
      setRows(list);
    });
    return () => unsub();
  }, [verified]);

  // Pull active member nicknames (from members collection — slot id docs
  // store nickname as a field). Used to show who hasn't answered yet.
  useEffect(() => {
    if (!verified) return;
    let cancelled = false;
    getDocs(collection(db, "members")).then((snap) => {
      if (cancelled) return;
      const nicks = new Set<string>();
      snap.forEach((d) => {
        const n = d.data().nickname;
        if (typeof n === "string" && n) nicks.add(n);
      });
      setMemberNicknames([...nicks].sort((a, b) => a.localeCompare(b, "ko")));
    });
    return () => {
      cancelled = true;
    };
  }, [verified]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filterResult !== "all") {
      list = list.filter((r) => r.result === filterResult);
    }
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter((r) => r.nickname.toLowerCase().includes(s));
    }
    return list;
  }, [rows, filterResult, search]);

  const counts = useMemo(() => {
    const c: Record<ResultKey, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const r of rows) c[r.result] = (c[r.result] ?? 0) + 1;
    return c;
  }, [rows]);

  const respondedNicks = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.nickname) s.add(r.nickname);
    return s;
  }, [rows]);

  const missing = useMemo(
    () => memberNicknames.filter((n) => !respondedNicks.has(n)),
    [memberNicknames, respondedNicks],
  );

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
        <h1 className="admin-exchange-title">셀프 점검 결과</h1>
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

  const total = rows.length;

  return (
    <div className="admin-exchange admin-guildtest">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 className="admin-exchange-title">셀프 점검 결과</h1>

      {/* Summary */}
      <div className="admin-guildtest-summary">
        <div className="admin-guildtest-stat">
          <div className="admin-guildtest-stat-num">{total}</div>
          <div className="admin-guildtest-stat-lbl">총 응답</div>
        </div>
        {RESULT_KEYS.map((k) => {
          const n = counts[k];
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <div key={k} className="admin-guildtest-stat">
              <div className="admin-guildtest-stat-num">{n}</div>
              <div className="admin-guildtest-stat-lbl">
                {k} · {RESULTS[k].name} ({pct}%)
              </div>
              <div className="admin-guildtest-stat-bar">
                <span
                  style={{ width: `${pct}%` }}
                  className={`admin-guildtest-stat-fill admin-guildtest-stat-fill-${k}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="admin-guildtest-toolbar">
        <input
          type="text"
          className="loginbar-input"
          placeholder="닉네임 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="admin-guildtest-chips">
          <button
            className={
              "admin-guildtest-chip" +
              (filterResult === "all" ? " is-active" : "")
            }
            onClick={() => setFilterResult("all")}
          >
            전체 ({total})
          </button>
          {RESULT_KEYS.map((k) => (
            <button
              key={k}
              className={
                "admin-guildtest-chip" +
                (filterResult === k ? " is-active" : "") +
                ` admin-guildtest-chip-${k}`
              }
              onClick={() => setFilterResult(k)}
            >
              {k} · {RESULTS[k].name} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      {/* Responses */}
      <h2 className="admin-guildtest-section-title">
        응답 목록 ({filtered.length})
      </h2>
      {filtered.length === 0 ? (
        <p className="admin-exchange-empty">조건에 맞는 응답이 없어요.</p>
      ) : (
        <div className="admin-guildtest-list">
          {filtered.map((r) => {
            const isOpen = openId === r.id;
            return (
              <div
                key={r.id}
                className={
                  "admin-guildtest-row" + (isOpen ? " is-open" : "")
                }
              >
                <button
                  type="button"
                  className="admin-guildtest-row-head"
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                >
                  <span className="admin-guildtest-row-nick">{r.nickname || "(닉네임 없음)"}</span>
                  <span
                    className={`admin-guildtest-pill admin-guildtest-pill-${r.result}`}
                  >
                    {r.result} · {r.resultName}
                  </span>
                  <span className="admin-guildtest-row-date">
                    {formatDate(r.createdAt)}
                  </span>
                  <span className="admin-guildtest-row-toggle">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </button>
                {isOpen && (
                  <div className="admin-guildtest-row-body">
                    <ol className="admin-guildtest-walkthrough">
                      {r.answers.map((step, i) => {
                        const [qid, optKey] = step.split("-") as [QuestionId, "A" | "B"];
                        const q = QUESTIONS[qid];
                        const opt = q?.options.find((o) => o.key === optKey);
                        return (
                          <li key={i}>
                            <div className="admin-guildtest-step-q">
                              {qid}. {q?.text ?? "(알 수 없음)"}
                            </div>
                            <div className="admin-guildtest-step-a">
                              → {optKey}: {opt?.label ?? "(알 수 없음)"}
                            </div>
                          </li>
                        );
                      })}
                      <li className="admin-guildtest-step-result">
                        ★ 결과: {r.result} ({r.resultName})
                      </li>
                    </ol>
                    <details className="admin-guildtest-meta">
                      <summary>메타</summary>
                      <div>doc id: {r.id}</div>
                      <div>userAgent: {r.userAgent || "-"}</div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Missing members */}
      <h2 className="admin-guildtest-section-title">
        아직 답하지 않은 길드원 ({missing.length})
      </h2>
      {missing.length === 0 ? (
        <p className="admin-exchange-empty">모두 답하셨어요. ✨</p>
      ) : (
        <div className="admin-guildtest-missing">
          {missing.map((n) => (
            <span key={n} className="admin-guildtest-missing-chip">
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
