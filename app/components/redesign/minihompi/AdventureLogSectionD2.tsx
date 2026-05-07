"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Anchor, Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import {
  deleteActivitiesByTargetPath,
  logActivity,
} from "@/src/lib/activity";
import { handleEvent } from "@/src/lib/badgeCheck";

// dawnlight2 미니홈피 4단계 — 모험기록 (월넛 박스 + 타임라인 + 우표 카드).
// logic은 cosmic AdventureLogSection 1:1 동일. 디자인만 사용자 결정대로.

type AdventureEntry = {
  id: string;
  date: string;
  content: string;
  createdAt: Timestamp | null;
};

const PAGE_SIZE = 5;

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLong(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}. ${m[2]}. ${m[3]}.`;
  return dateStr;
}

export function AdventureLogSectionD2({
  id,
  isOwner,
  memberNickname,
}: {
  id: string;
  isOwner: boolean;
  memberNickname: string | null;
}) {
  const [entries, setEntries] = useState<AdventureEntry[]>([]);
  const [date, setDate] = useState(todayDateString);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(true);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "members", id, "adventures"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AdventureEntry[],
      );
    });
    return () => unsub();
  }, [id]);

  const handleSubmit = async () => {
    if (!isOwner) return;
    if (!date || !content.trim()) return;
    setSubmitting(true);
    try {
      const advRef = await addDoc(
        collection(db, "members", id, "adventures"),
        {
          date,
          content: content.trim(),
          createdAt: serverTimestamp(),
        },
      );
      setContent("");
      if (memberNickname) {
        await logActivity(
          "adventure",
          memberNickname,
          `${memberNickname}님이 새로운 모험 기록을 남겼어요`,
          `/members/${id}#minihome-adventure`,
          `members/${id}/adventures/${advRef.id}`,
        );
        handleEvent({
          type: "adventure",
          nickname: memberNickname,
          entryDate: date,
          when: new Date(),
        });
      }
    } catch (e) {
      console.error(e);
      alert("기록 등록에 실패했습니다.");
    }
    setSubmitting(false);
  };

  const handleDelete = async (entryId: string) => {
    if (!isOwner) return;
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "members", id, "adventures", entryId));
      await deleteActivitiesByTargetPath(
        `members/${id}/adventures/${entryId}`,
      );
    } catch (e) {
      console.error(e);
      alert("삭제에 실패했습니다.");
    }
  };

  const handleUpdate = async (entryId: string, newContent: string) => {
    if (!isOwner) return;
    if (!newContent.trim()) return;
    try {
      await updateDoc(doc(db, "members", id, "adventures", entryId), {
        content: newContent.trim(),
      });
    } catch (e) {
      console.error(e);
      alert("수정에 실패했습니다.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = entries.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  const handleToggle = () => {
    setInteractive(true);
    setOpen((v) => !v);
  };

  const body = (
    <div className="px-4 pb-5 pt-4 sm:px-5 sm:pb-6">
      {isOwner && (
        <div
          className="mb-5 rounded-md p-3"
          style={{
            background: "rgba(254, 245, 230, 0.95)",
            border: "1px solid rgba(92, 58, 31, 0.2)",
          }}
        >
          {/* 상단 한 줄 — 좌측 날짜 / 우측 등록 */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background: "rgba(184, 132, 90, 0.18)",
                border: "1px solid rgba(184, 132, 90, 0.35)",
                color: "#5c3a1f",
              }}
              htmlFor="adventure-date-input-d2"
            >
              {formatDateLong(date)}
              <input
                id="adventure-date-input-d2"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="absolute opacity-0"
                style={{ pointerEvents: "none", width: 0, height: 0 }}
                aria-label="모험 기록 날짜"
              />
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !content.trim()}
              className="rounded-md px-4 py-1.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "rgba(184, 132, 90, 0.18)",
                border: "1px solid rgba(184, 132, 90, 0.35)",
                color: "#5c3a1f",
              }}
              onMouseEnter={(e) => {
                if (!submitting && content.trim())
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(184, 132, 90, 0.3)";
              }}
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(184, 132, 90, 0.18)")
              }
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>

          {/* 본문 입력란 — 흰색 */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="오늘의 모험을 기록하세요"
            rows={3}
            maxLength={500}
            disabled={submitting}
            aria-label="모험 기록 내용"
            className="w-full resize-none rounded-md px-3 py-2 text-[13px] leading-relaxed focus:outline-none disabled:opacity-60"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(92, 58, 31, 0.2)",
              color: "#5c3a1f",
            }}
          />
        </div>
      )}

      {entries.length === 0 ? (
        <p
          className="py-10 text-center text-[11px] italic"
          style={{ color: "rgba(254, 245, 230, 0.6)" }}
        >
          {isOwner
            ? "아직 기록이 없습니다. 첫 모험을 남겨보세요."
            : "아직 기록이 없습니다."}
        </p>
      ) : (
        // 타임라인 컨테이너 — 좌측 28px 점선 + 항목별 점 마커
        <div className="relative" style={{ paddingLeft: 0 }}>
          {/* 세로 점선 — 좌측 28px 지점, 첫/마지막 항목 약간 안쪽 */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: 28,
              top: 14,
              bottom: 14,
              borderLeft: "2px dotted rgba(254, 245, 230, 0.4)",
            }}
          />

          <div className="flex flex-col gap-3">
            {visible.map((e, i) => (
              <AdventureEntryRowD2
                key={e.id}
                entry={e}
                index={i}
                isOwner={isOwner}
                onDelete={() => handleDelete(e.id)}
                onUpdate={(newContent) => handleUpdate(e.id, newContent)}
              />
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div
          className="mt-6 flex items-center justify-center gap-5 text-[11px] tracking-wider"
          style={{ color: "rgba(254, 245, 230, 0.7)" }}
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← 이전
          </button>
          <span style={{ color: "#fef5e6" }}>
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section
      id="minihome-adventure"
      className="overflow-hidden rounded-2xl"
      style={{
        background: "#8b5a3c",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:brightness-110"
      >
        <span className="flex items-center gap-2">
          <Anchor className="h-4 w-4" style={{ color: "#fef5e6" }} aria-hidden />
          <span
            className="text-[15px] font-semibold tracking-wide"
            style={{ color: "#fef5e6" }}
          >
            모험기록
          </span>
          <span
            className="text-xs font-normal"
            style={{ color: "rgba(254, 245, 230, 0.7)" }}
          >
            ({entries.length}개)
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          aria-hidden
          style={{ display: "inline-flex", color: "#fef5e6" }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {/* 헤드/본 사이 1px 구분선 */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(60, 40, 25, 0.4)" }} />
      )}

      {interactive ? (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && body
      )}
    </section>
  );
}

function AdventureEntryRowD2({
  entry,
  index,
  isOwner,
  onDelete,
  onUpdate,
}: {
  entry: AdventureEntry;
  index: number;
  isOwner: boolean;
  onDelete: () => void;
  onUpdate: (content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(entry.content);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onUpdate(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const dateLong = (() => {
    const m = entry.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}. ${parseInt(m[2], 10)}. ${parseInt(m[3], 10)}.`;
    return entry.date;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="group relative"
      style={{ paddingLeft: 56 }}
    >
      {/* 점 마커 — 점선 위에 겹쳐서 표시 */}
      <span
        aria-hidden
        className="absolute z-10"
        style={{
          left: 21,
          top: 14,
          width: 14,
          height: 14,
          borderRadius: 999,
          background: "#ffc785",
          border: "2px solid #fef5e6",
          boxShadow: "0 0 8px rgba(255, 199, 133, 0.5)",
        }}
      />

      {/* 항목 카드 — cream + 좌측 4px double border 월넛 */}
      <div
        className="rounded-sm py-2.5 pl-4 pr-3"
        style={{
          background: "rgba(254, 245, 230, 0.95)",
          borderLeft: "4px double rgba(139, 90, 60, 0.5)",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-semibold"
              style={{ color: "#8a6a4a" }}
            >
              {dateLong}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              {editing ? (
                <motion.div
                  key="edit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="mt-1"
                >
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    maxLength={500}
                    disabled={saving}
                    autoFocus
                    className="w-full resize-none rounded-sm px-2 py-1.5 text-[12px] leading-relaxed focus:outline-none disabled:opacity-60"
                    style={{
                      background: "#ffffff",
                      border: "1px solid rgba(92, 58, 31, 0.25)",
                      color: "#4a2a1a",
                    }}
                  />
                </motion.div>
              ) : (
                <motion.p
                  key="view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="wrap-anywhere mt-0.5 text-[12px] font-semibold leading-relaxed"
                  style={{ color: "#4a2a1a" }}
                >
                  {entry.content}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {isOwner && (
            <div className="flex flex-shrink-0 items-center gap-1">
              {editing ? (
                <>
                  <button
                    type="button"
                    aria-label="저장"
                    onClick={handleSave}
                    disabled={saving || !draft.trim()}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ color: "#5c3a1f" }}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="취소"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                    style={{ color: "rgba(92, 58, 31, 0.6)" }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="수정"
                    onClick={startEdit}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                    style={{ color: "rgba(92, 58, 31, 0.6)" }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="삭제"
                    onClick={onDelete}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                    style={{ color: "rgba(92, 58, 31, 0.6)" }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
