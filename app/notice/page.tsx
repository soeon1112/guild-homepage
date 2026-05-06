"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  startAfter,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { createPortal } from "react-dom";
import { useAuth } from "../components/AuthProvider";
import { db } from "@/src/lib/firebase";
import {
  deleteActivitiesByTargetPath,
  logActivity,
} from "@/src/lib/activity";
import { canAddSchedule } from "@/src/lib/scheduleAdmin";
import { formatScheduleDate, josa, truncate } from "@/src/lib/text";
import { useDeepLinkParam } from "@/src/lib/useDeepLinkParam";
import { useModalBodyLock } from "@/src/lib/useModalBodyLock";

// Phase 2-A: 통합 페이지. /schedule (기존) 도 양쪽 공존 — 다음 단계에서 제거.
// activity link 가 /notice?schedule=<id> 형태면 일정 섹션으로 자동 스크롤
// + 1초간 강조.

const ADMIN_PASSWORD = "dawnlight2024";
const PAGE_SIZE = 5;

interface Notice {
  id: string;
  title: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  description: string;
  createdAt: Timestamp | null;
}

type ScheduleEditorMode =
  | { kind: "add" }
  | { kind: "edit"; item: ScheduleItem }
  | null;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function todayKey(): string {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

function formatRowDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return dateKey;
  return `${m[2]}-${m[3]} (${WEEKDAY_KO[dt.getDay()]})`;
}

function NoticePageInner() {
  const { nickname } = useAuth();
  const [items, setItems] = useState<Notice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pageSnapshots, setPageSnapshots] = useState<
    (QueryDocumentSnapshot<DocumentData> | null)[]
  >([null]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    (async () => {
      const col = collection(db, "notice");
      const countSnap = await getCountFromServer(col);
      setTotalCount(countSnap.data().count);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const col = collection(db, "notice");
      const cursor = pageSnapshots[currentPage - 1];

      let q;
      if (cursor) {
        q = query(col, orderBy("createdAt", "desc"), startAfter(cursor), limit(PAGE_SIZE));
      } else {
        q = query(col, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      }

      const snap = await getDocs(q);
      setItems(
        snap.docs.map((doc) => ({ id: doc.id, title: doc.data().title })),
      );

      if (snap.docs.length > 0) {
        setPageSnapshots((prev) => {
          const next = [...prev];
          next[currentPage] = snap.docs[snap.docs.length - 1];
          return next;
        });
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const getRowNumber = (index: number) => {
    return totalCount - (currentPage - 1) * PAGE_SIZE - index;
  };

  return (
    <div className="board-content">
      <h1 className="board-title">공지 게시판</h1>

      <div className="board-write-btn-wrap">
        <Link href="/notice/write" className="board-btn">
          글쓰기
        </Link>
      </div>

      <div className="board-table-wrap">
        {loading ? (
          <p className="board-loading">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="board-loading">공지가 없습니다.</p>
        ) : (
          <table className="board-table">
            <tbody>
              {items.map((n, i) => (
                <tr key={n.id}>
                  <td className="col-no">{getRowNumber(i)}</td>
                  <td className="col-title">
                    <Link href={`/notice/${n.id}`} className="board-post-link">
                      {n.title}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="board-pagination">
        <button
          className="board-page-btn"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => p - 1)}
        >
          이전
        </button>
        <span className="board-page-info">
          {currentPage} / {totalPages}
        </span>
        <button
          className="board-page-btn"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
        >
          다음
        </button>
      </div>

      {/* ── 일정 섹션 (통합 페이지) ─────────────────────────────────── */}
      <ScheduleSection loginNick={nickname} />
    </div>
  );
}

export default function NoticePage() {
  return (
    <Suspense fallback={null}>
      <NoticePageInner />
    </Suspense>
  );
}

function ScheduleSection({ loginNick }: { loginNick: string | null }) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<ScheduleEditorMode>(null);
  const [adminVerified, setAdminVerified] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | { run: () => void }>(
    null,
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useModalBodyLock(!!pendingAction);
  useModalBodyLock(!!editor);

  useEffect(() => {
    const q = query(collection(db, "schedule"), orderBy("date", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ScheduleItem[],
        );
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  // ?schedule=<id> 받으면 섹션으로 스크롤 + 1초 강조. items 가 도착하기
  // 전에 받으면 multi-retry 필요한데, useDeepLinkParam 이 mobile race 를
  // 봉인해주므로 items 갱신 후 한 번만 시도하면 충분.
  const scheduleParam = useDeepLinkParam("schedule");
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scheduleParam) return;
    if (handledRef.current === scheduleParam) return;
    if (loading) return;
    if (!items.find((it) => it.id === scheduleParam)) return;
    handledRef.current = scheduleParam;
    setHighlightId(scheduleParam);
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const t = setTimeout(() => setHighlightId(null), 1200);
    return () => clearTimeout(t);
  }, [scheduleParam, loading, items]);

  const today = todayKey();
  const upcoming = useMemo(
    () => items.filter((it) => it.date >= today),
    [items, today],
  );

  const requireAdmin = useCallback(
    (run: () => void) => {
      if (adminVerified) {
        run();
        return;
      }
      setPendingAction({ run });
    },
    [adminVerified],
  );

  const handleAdd = () => requireAdmin(() => setEditor({ kind: "add" }));
  const handleEdit = (item: ScheduleItem) =>
    requireAdmin(() => setEditor({ kind: "edit", item }));
  const handleDelete = (item: ScheduleItem) => {
    requireAdmin(async () => {
      if (!confirm(`"${item.title}" 일정을 삭제할까요?`)) return;
      try {
        await deleteDoc(doc(db, "schedule", item.id));
        await deleteActivitiesByTargetPath(`schedule/${item.id}`);
      } catch (e) {
        console.error(e);
        alert("삭제에 실패했습니다.");
      }
    });
  };

  const showAddBtn = canAddSchedule(loginNick);

  return (
    <section ref={sectionRef} className="notice-schedule-section">
      <hr className="notice-schedule-divider" />
      <div className="notice-schedule-header">
        <h2 className="notice-schedule-title">일정</h2>
        {showAddBtn ? (
          <button
            type="button"
            className="notice-schedule-add-btn"
            onClick={handleAdd}
          >
            + 일정 추가
          </button>
        ) : null}
      </div>

      <div className="notice-schedule-list">
        {loading ? (
          <p className="notice-schedule-empty">불러오는 중...</p>
        ) : upcoming.length === 0 ? (
          <p className="notice-schedule-empty">등록된 일정이 없습니다.</p>
        ) : (
          upcoming.map((it) => (
            <article
              key={it.id}
              className={
                "notice-schedule-item" +
                (highlightId === it.id
                  ? " notice-schedule-item-highlight"
                  : "")
              }
            >
              <div className="notice-schedule-item-main">
                <span className="notice-schedule-item-date">
                  {formatRowDate(it.date)}
                </span>
                <span className="notice-schedule-item-sep">|</span>
                <span className="notice-schedule-item-title">{it.title}</span>
              </div>
              {it.description ? (
                <div className="notice-schedule-item-desc">
                  {it.description}
                </div>
              ) : null}
              {showAddBtn ? (
                <div className="notice-schedule-item-actions">
                  <button
                    type="button"
                    className="notice-schedule-mini-btn"
                    onClick={() => handleEdit(it)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="notice-schedule-mini-btn notice-schedule-mini-btn-danger"
                    onClick={() => handleDelete(it)}
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      {pendingAction && (
        <ScheduleAdminGate
          onCancel={() => setPendingAction(null)}
          onSuccess={() => {
            setAdminVerified(true);
            const run = pendingAction.run;
            setPendingAction(null);
            run();
          }}
        />
      )}

      {editor && (
        <ScheduleEditor mode={editor} onClose={() => setEditor(null)} />
      )}
    </section>
  );
}

function ScheduleAdminGate({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    onSuccess();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="notice-schedule-modal-backdrop" onClick={onCancel}>
      <div
        className="notice-schedule-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="notice-schedule-modal-title">관리자 인증</h2>
        <input
          type="password"
          className="notice-schedule-modal-input"
          placeholder="관리자 비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          autoFocus
        />
        {err && <p className="notice-schedule-modal-err">{err}</p>}
        <div className="notice-schedule-modal-footer">
          <button
            type="button"
            className="notice-schedule-modal-cancel"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="button"
            className="notice-schedule-modal-confirm"
            onClick={handleSubmit}
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ScheduleEditor({
  mode,
  onClose,
}: {
  mode: Exclude<ScheduleEditorMode, null>;
  onClose: () => void;
}) {
  const initial =
    mode.kind === "edit"
      ? mode.item
      : { title: "", date: todayKey(), description: "" };
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [description, setDescription] = useState(initial.description);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !date) {
      alert("제목과 날짜를 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      if (mode.kind === "add") {
        const cleanTitle = title.trim();
        const newRef = await addDoc(collection(db, "schedule"), {
          title: cleanTitle,
          date,
          description: description.trim(),
          createdAt: serverTimestamp(),
        });
        const dateLabel = formatScheduleDate(date);
        const headline = dateLabel
          ? `${dateLabel} ${truncate(cleanTitle, 15)}`
          : truncate(cleanTitle, 15);
        // Phase 2-A: activity link 만 통합 페이지 형식. 푸시 트리거(triggers/
        // schedule.ts)는 다음 단계에서 통합.
        await logActivity(
          "schedule",
          "관리자",
          `일정 '${headline}'${josa(cleanTitle, "이/가")} 올라왔어요`,
          `/notice?schedule=${newRef.id}`,
          `schedule/${newRef.id}`,
        );
      } else {
        await updateDoc(doc(db, "schedule", mode.item.id), {
          title: title.trim(),
          date,
          description: description.trim(),
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert("저장에 실패했습니다.");
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="notice-schedule-modal-backdrop" onClick={onClose}>
      <div
        className="notice-schedule-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="notice-schedule-modal-title">
          {mode.kind === "add" ? "일정 추가" : "일정 수정"}
        </h2>
        <label className="notice-schedule-modal-label">
          <span>날짜</span>
          <input
            type="date"
            className="notice-schedule-modal-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="notice-schedule-modal-label">
          <span>제목</span>
          <input
            type="text"
            className="notice-schedule-modal-input"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="notice-schedule-modal-label">
          <span>설명</span>
          <textarea
            className="notice-schedule-modal-input notice-schedule-modal-textarea"
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </label>
        <div className="notice-schedule-modal-footer">
          <button
            type="button"
            className="notice-schedule-modal-cancel"
            onClick={onClose}
            disabled={saving}
          >
            취소
          </button>
          <button
            type="button"
            className="notice-schedule-modal-confirm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
