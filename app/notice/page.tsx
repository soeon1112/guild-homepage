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
import { useGuilds } from "@/src/lib/useGuilds";
import { canManageNotice, writableCategories } from "@/src/lib/noticePermissions";
import { writeBatch } from "firebase/firestore";
import {
  deleteActivitiesByTargetPath,
  logActivity,
} from "@/src/lib/activity";
import { canAddSchedule } from "@/src/lib/scheduleAdmin";
import { formatScheduleDate, josa, truncate } from "@/src/lib/text";
import { useDeepLinkParam } from "@/src/lib/useDeepLinkParam";
import { useModalBodyLock } from "@/src/lib/useModalBodyLock";
import { useBackdropClose } from "@/src/lib/useBackdropClose";
import { useDawnlight2 } from "@/src/lib/featureFlags";

// Phase 2-A: 통합 페이지. /schedule (기존) 도 양쪽 공존 — 다음 단계에서 제거.
// activity link 가 /notice?schedule=<id> 형태면 일정 섹션으로 자동 스크롤
// + 1초간 강조.

const ADMIN_PASSWORD = "dawnlight2024";

interface Notice {
  id: string;
  title: string;
  category: string;
  // notice/order: 카테고리 안 순서. 없으면 fallback (-createdAtMs) 로
  // 정렬. 새 공지는 카테고리 맨 위 (현재 min - 1) 로 자동 배치.
  order?: number;
  createdAtMs?: number;
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
  // Dawnlight 2 reskin gate. Wraps the page (and the schedule
  // editor's portal-rendered modal) in `.dawnlight2 .dl2-notice`
  // so the additive overrides at the bottom of globals.css apply.
  const isDawnlight2 = useDawnlight2();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  // 카테고리: 연합 (union) + 길드들. useGuilds 정렬 (union 우선 → 영문 → 한글).
  const guilds = useGuilds({ includeUnion: true });

  useEffect(() => {
    const col = collection(db, "notice");
    const q = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: typeof data.title === "string" ? data.title : "",
              category: typeof data.category === "string" ? data.category : "",
              order:
                typeof data.order === "number" ? data.order : undefined,
              createdAtMs:
                (data.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0,
            };
          }),
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

  // notice/order: 카테고리 안 정렬 — order ?? -createdAtMs 오름차순.
  // 기존 공지 (order 없음) 는 createdAt 역순으로 자연 fallback.
  const grouped = useMemo(() => {
    const m = new Map<string, Notice[]>();
    for (const n of items) {
      const cat = n.category || "_orphan";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(n);
    }
    const getOrd = (n: Notice) => n.order ?? -(n.createdAtMs ?? 0);
    for (const list of m.values()) {
      list.sort((a, b) => getOrd(a) - getOrd(b));
    }
    return m;
  }, [items]);

  const visibleCategories = guilds.filter((g) => (grouped.get(g.id)?.length ?? 0) > 0);
  const canWrite = writableCategories(nickname, guilds).length > 0;
  // 순서 변경 권한 — 언쏘만 (canManageNotice).
  const canManage = canManageNotice(nickname);

  // 인접 swap — writeBatch 로 두 doc 의 order 원자적 교환.
  const swapOrder = async (a: Notice, b: Notice) => {
    if (!canManage) return;
    const aOrd = a.order ?? -(a.createdAtMs ?? 0);
    const bOrd = b.order ?? -(b.createdAtMs ?? 0);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "notice", a.id), { order: bOrd });
      batch.update(doc(db, "notice", b.id), { order: aOrd });
      await batch.commit();
    } catch (e) {
      console.error("[Notice order] swap failed", e);
    }
  };

  return (
    <div
      className={
        "board-content" + (isDawnlight2 ? " dl2-notice" : "")
      }
    >
      {isDawnlight2 ? (
        <header className="dl2-notice-page-head">
          <h1 className="dl2-notice-page-title">공지 게시판</h1>
          <p className="dl2-notice-page-sub">NOTICE BOARD</p>
        </header>
      ) : (
        <h1 className="board-title">공지 게시판</h1>
      )}

      {/* 공지 섹션 헤더 — 일정 섹션과 동일한 .notice-schedule-header 행
          스타일 재사용 ("schedule" prefix 지만 공지/일정 공통 row 스타일).
          글쓰기 Link 도 일정 추가 버튼과 동일한 .notice-schedule-add-btn
          warm gradient 스타일로 통일. */}
      <div className="notice-schedule-header">
        <h2 className="notice-schedule-title">공지</h2>
        {canWrite && (
          <Link href="/notice/write" className="notice-schedule-add-btn">
            {isDawnlight2 ? "✦ 글쓰기" : "글쓰기"}
          </Link>
        )}
      </div>

      {loading ? (
        <p className="board-loading">불러오는 중...</p>
      ) : visibleCategories.length === 0 ? (
        <p className="board-loading">공지가 없습니다.</p>
      ) : (
        visibleCategories.map((guild) => {
          const list = grouped.get(guild.id) ?? [];
          // 카테고리별 톤 — 연합(union)은 mist-lavender, 길드는 sunset-gold.
          // 다른 길드 추가 시 색상 매핑 확장.
          const accent = guild.isUnion ? "200, 184, 232" : "255, 199, 133";
          return (
            <section
              key={guild.id}
              className="notice-category-section"
              style={{
                marginBottom: "1.5rem",
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid rgba(${accent}, 0.18)`,
                background: `rgba(${accent}, 0.04)`,
              }}
            >
              <h3
                className="notice-category-header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  margin: 0,
                  padding: "10px 16px",
                  background: `rgba(${accent}, 0.12)`,
                  fontFamily:
                    "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: guild.isUnion ? "#c8b8e8" : "#ffc785",
                  letterSpacing: "0.02em",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 3,
                    height: 12,
                    background: guild.isUnion ? "#c8b8e8" : "#ffc785",
                    borderRadius: 2,
                  }}
                />
                {guild.name}
              </h3>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {list.map((n, i) => (
                  <li
                    key={n.id}
                    style={{
                      borderTop:
                        i > 0
                          ? "1px solid rgba(254, 245, 230, 0.08)"
                          : "none",
                      display: "flex",
                      alignItems: "stretch",
                    }}
                  >
                    <Link
                      href={`/notice/${n.id}`}
                      className="board-post-link"
                      style={{
                        flex: 1,
                        display: "block",
                        padding: "12px 16px",
                        color: "#fef5e6",
                        textDecoration: "none",
                      }}
                    >
                      {n.title}
                    </Link>
                    {/* notice/order: 언쏘만 ▲▼ 노출. 첫/마지막 row 는
                        해당 방향 disabled. */}
                    {canManage && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          paddingRight: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => i > 0 && swapOrder(n, list[i - 1])}
                          disabled={i === 0}
                          aria-label="위로 이동"
                          style={{
                            width: 24,
                            height: 24,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "none",
                            color: isDawnlight2 ? "#5c3a1f" : "#fef5e6",
                            opacity: i === 0 ? 0.3 : 0.7,
                            cursor: i === 0 ? "default" : "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            i < list.length - 1 && swapOrder(n, list[i + 1])
                          }
                          disabled={i === list.length - 1}
                          aria-label="아래로 이동"
                          style={{
                            width: 24,
                            height: 24,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "none",
                            color: isDawnlight2 ? "#5c3a1f" : "#fef5e6",
                            opacity: i === list.length - 1 ? 0.3 : 0.7,
                            cursor:
                              i === list.length - 1 ? "default" : "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {/* ── 일정 섹션 (통합 페이지) ─────────────────────────────────── */}
      <ScheduleSection loginNick={nickname} isDawnlight2={isDawnlight2} />
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

function ScheduleSection({
  loginNick,
  isDawnlight2,
}: {
  loginNick: string | null;
  isDawnlight2: boolean;
}) {
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
            {isDawnlight2 ? "✦ 일정 추가" : "+ 일정 추가"}
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
          isDawnlight2={isDawnlight2}
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
        <ScheduleEditor
          mode={editor}
          isDawnlight2={isDawnlight2}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}

function ScheduleAdminGate({
  onCancel,
  onSuccess,
  isDawnlight2,
}: {
  onCancel: () => void;
  onSuccess: () => void;
  isDawnlight2: boolean;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const backdropHandlers = useBackdropClose(onCancel);

  const handleSubmit = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    onSuccess();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={
        // dl2-notice ONLY (not `dawnlight2`) — `.dawnlight2` declares
        // `position: relative` which conflicts with the cosmic
        // `.notice-schedule-modal-backdrop { position: fixed }`. Even
        // with a compound .dawnlight2.notice-schedule-modal-backdrop
        // override the cascade was unreliable in production (CDN /
        // Next bundle order). `.dl2-notice` doesn't touch position
        // and the universal `.dl2-notice *` rule still cascades the
        // Pretendard font into the modal subtree.
        "notice-schedule-modal-backdrop" +
        (isDawnlight2 ? " dl2-notice" : "")
      }
      {...backdropHandlers}
    >
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
  isDawnlight2,
}: {
  mode: Exclude<ScheduleEditorMode, null>;
  onClose: () => void;
  isDawnlight2: boolean;
}) {
  const initial =
    mode.kind === "edit"
      ? mode.item
      : { title: "", date: todayKey(), description: "" };
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [description, setDescription] = useState(initial.description);
  const [saving, setSaving] = useState(false);
  const backdropHandlers = useBackdropClose(onClose, !saving);

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
    <div
      className={
        // dl2-notice ONLY (not `dawnlight2`) — `.dawnlight2` declares
        // `position: relative` which conflicts with the cosmic
        // `.notice-schedule-modal-backdrop { position: fixed }`. Even
        // with a compound .dawnlight2.notice-schedule-modal-backdrop
        // override the cascade was unreliable in production (CDN /
        // Next bundle order). `.dl2-notice` doesn't touch position
        // and the universal `.dl2-notice *` rule still cascades the
        // Pretendard font into the modal subtree.
        "notice-schedule-modal-backdrop" +
        (isDawnlight2 ? " dl2-notice" : "")
      }
      {...backdropHandlers}
    >
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
