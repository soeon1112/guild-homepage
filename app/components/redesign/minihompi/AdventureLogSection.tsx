"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarIcon, Pencil, Trash2, Check, X } from "lucide-react";
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
import { CollapsibleSection } from "./CollapsibleSection";

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

function formatDateBadge(dateStr: string): string {
  // Input "YYYY-MM-DD" -> "MM.DD"
  const m = dateStr.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}`;
  return dateStr;
}

function formatDateLong(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}. ${m[2]}. ${m[3]}.`;
  return dateStr;
}

export function AdventureLogSection({
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
          `${memberNickname}님이 새로운 모험 기록을 남겼습니다`,
          `/members/${id}`,
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

  return (
    <CollapsibleSection
      title="모험 기록"
      rightSlot={<span>{entries.length}개</span>}
      defaultOpen
    >
      {/* Input form - owner only */}
      {isOwner && (
        <div
          className="mb-5 flex flex-col gap-3 rounded-xl p-3"
          style={{
            background: "rgba(11,8,33,0.4)",
            border: "1px solid rgba(216,150,200,0.18)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2 px-1">
            <CalendarIcon
              className="h-4 w-4 text-nebula-pink/80"
              aria-hidden
            />
            <label className="sr-only" htmlFor="adventure-date-input">
              모험 기록 날짜
            </label>
            <input
              id="adventure-date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-nebula-pink/25 bg-abyss-deep/60 px-2 py-1 font-serif text-[11px] tracking-wider text-text-primary focus:border-nebula-pink/50 focus:outline-none [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:invert"
            />
            <span
              className="font-serif text-[11px] italic text-text-sub/70"
              aria-hidden
            >
              {formatDateLong(date)}
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="오늘의 모험을 기록하세요"
            rows={3}
            maxLength={500}
            aria-label="모험 기록 내용"
            disabled={submitting}
            className="w-full resize-none rounded-lg border border-nebula-pink/15 bg-abyss-deep/40 px-3 py-2.5 font-serif text-[13px] leading-relaxed text-text-primary placeholder:text-text-sub/70 focus:border-nebula-pink/50 focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
            className="w-full rounded-full px-4 py-2 font-serif text-[12px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              boxShadow: "0 0 12px rgba(255,181,167,0.5)",
            }}
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      )}

      {/* List */}
      {entries.length === 0 ? (
        <p className="py-10 text-center font-serif text-xs italic text-text-sub/70">
          {isOwner
            ? "아직 기록이 없습니다. 첫 모험을 남겨보세요."
            : "아직 기록이 없습니다."}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((e, i) => (
            <AdventureEntryRow
              key={e.id}
              entry={e}
              index={i}
              isOwner={isOwner}
              onDelete={() => handleDelete(e.id)}
              onUpdate={(newContent) => handleUpdate(e.id, newContent)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-5 font-serif text-[11px] tracking-wider text-text-sub">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="transition-colors hover:text-stardust disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← 이전
          </button>
          <span className="text-stardust">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="transition-colors hover:text-stardust disabled:cursor-not-allowed disabled:opacity-30"
          >
            다음 →
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}

function AdventureEntryRow({
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

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="group relative flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-nebula-violet/10"
      style={{
        background: "rgba(26, 15, 61, 0.35)",
        border: "1px solid rgba(216, 150, 200, 0.12)",
        backdropFilter: "blur(14px)",
      }}
    >
      {/* Date badge */}
      <div
        className="flex flex-shrink-0 flex-col items-center justify-center rounded-lg px-2.5 py-2 text-center"
        style={{
          minWidth: 52,
          background:
            "linear-gradient(135deg, rgba(255,229,196,0.15), rgba(216,150,200,0.12))",
          border: "1px solid rgba(216,150,200,0.25)",
        }}
      >
        <span
          className="font-serif text-[13px] font-medium leading-none"
          style={{
            backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          {formatDateBadge(entry.date)}
        </span>
      </div>

      {/* Content or edit field */}
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={saving}
                autoFocus
                className="w-full resize-none rounded-lg border border-nebula-pink/25 bg-abyss-deep/60 px-2 py-2 font-serif text-[13px] leading-relaxed text-text-primary focus:border-nebula-pink/50 focus:outline-none disabled:opacity-60"
              />
            </motion.div>
          ) : (
            <motion.p
              key="view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="wrap-anywhere font-serif text-[13px] leading-relaxed text-text-primary"
            >
              {entry.content}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      {isOwner && (
        <div className="flex flex-shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button
                type="button"
                aria-label="저장"
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                className="flex h-6 w-6 items-center justify-center rounded-full text-stardust transition-colors hover:bg-peach-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="취소"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-sub transition-colors hover:bg-nebula-pink/20 disabled:opacity-50"
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
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-sub transition-colors hover:text-stardust"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="삭제"
                onClick={onDelete}
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-sub transition-colors hover:text-peach-accent"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
