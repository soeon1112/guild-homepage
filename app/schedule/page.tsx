"use client";

import { useEffect, useMemo, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
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

const ADMIN_PASSWORD = "dawnlight2024";

type ScheduleItem = {
  id: string;
  title: string;
  date: string;
  description: string;
  createdAt: Timestamp | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function todayKey(): string {
  const t = new Date();
  return toDateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

type EditorMode =
  | { kind: "add"; date: string }
  | { kind: "edit"; item: ScheduleItem }
  | null;

export default function SchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [adminVerified, setAdminVerified] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<null | { run: () => void }>(null);

  useEffect(() => {
    const q = query(collection(db, "schedule"), orderBy("date", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ScheduleItem[],
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const it of items) {
      const arr = map.get(it.date) ?? [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return map;
  }, [items]);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const result: { day: number | null; dateKey: string | null }[] = [];
    for (let i = 0; i < total; i++) {
      const dayNum = i - startOffset + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        result.push({ day: null, dateKey: null });
      } else {
        result.push({ day: dayNum, dateKey: toDateKey(year, month, dayNum) });
      }
    }
    return result;
  }, [year, month]);

  const today = todayKey();

  const goPrevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
  };

  const requireAdmin = (run: () => void) => {
    if (adminVerified) {
      run();
      return;
    }
    setPendingAction({ run });
  };

  const openAdd = (date: string) => {
    requireAdmin(() => setEditor({ kind: "add", date }));
  };

  const openEdit = (item: ScheduleItem) => {
    requireAdmin(() => setEditor({ kind: "edit", item }));
  };

  const handleDelete = (item: ScheduleItem) => {
    requireAdmin(async () => {
      if (!confirm(`"${item.title}" 일정을 삭제할까요?`)) return;
      try {
        await deleteDoc(doc(db, "schedule", item.id));
      } catch (e) {
        console.error(e);
        alert("삭제에 실패했습니다.");
      }
    });
  };

  const selectedItems = selectedDate
    ? itemsByDate.get(selectedDate) ?? []
    : [];

  return (
    <div className="schedule-page">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>

      <h1 className="schedule-title">일정</h1>

      <div className="schedule-panel">
        <div className="schedule-toolbar">
          <button
            className="schedule-nav-btn"
            onClick={goPrevMonth}
            aria-label="이전 달"
          >
            ‹
          </button>
          <div className="schedule-month-label">
            {year}년 {month + 1}월
          </div>
          <button
            className="schedule-nav-btn"
            onClick={goNextMonth}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <div className="schedule-actions">
          <button className="schedule-today-btn" onClick={goToday}>
            오늘
          </button>
          <button
            className="schedule-add-btn"
            onClick={() => openAdd(today)}
          >
            + 일정 추가
          </button>
        </div>

        <div className="schedule-weekdays">
          {WEEKDAYS.map((w) => (
            <div key={w} className="schedule-weekday">
              {w}
            </div>
          ))}
        </div>

        <div className="schedule-grid">
          {cells.map((c, i) => {
            if (!c.day || !c.dateKey) {
              return <div key={i} className="schedule-cell schedule-cell-empty" />;
            }
            const hasEvents = (itemsByDate.get(c.dateKey)?.length ?? 0) > 0;
            const isToday = c.dateKey === today;
            return (
              <button
                key={i}
                className={
                  "schedule-cell" + (isToday ? " schedule-cell-today" : "")
                }
                onClick={() => setSelectedDate(c.dateKey)}
              >
                <span className="schedule-cell-day">{c.day}</span>
                {hasEvents && <span className="schedule-cell-dot" />}
              </button>
            );
          })}
        </div>

        {loading && <p className="schedule-loading">불러오는 중...</p>}
      </div>

      {selectedDate && (
        <div
          className="schedule-modal-backdrop"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="schedule-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="schedule-modal-header">
              <h2 className="schedule-modal-title">{selectedDate}</h2>
              <button
                className="schedule-modal-close"
                onClick={() => setSelectedDate(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            {selectedItems.length === 0 ? (
              <p className="schedule-modal-empty">일정이 없습니다.</p>
            ) : (
              <ul className="schedule-detail-list">
                {selectedItems.map((it) => (
                  <li key={it.id} className="schedule-detail-item">
                    <div className="schedule-detail-title">{it.title}</div>
                    {it.description && (
                      <div className="schedule-detail-desc">
                        {it.description}
                      </div>
                    )}
                    <div className="schedule-detail-actions">
                      <button
                        className="schedule-mini-btn"
                        onClick={() => openEdit(it)}
                      >
                        수정
                      </button>
                      <button
                        className="schedule-mini-btn schedule-mini-btn-danger"
                        onClick={() => handleDelete(it)}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="schedule-modal-footer">
              <button
                className="schedule-add-btn"
                onClick={() => openAdd(selectedDate)}
              >
                + 이 날짜에 일정 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAction && (
        <AdminGate
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
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function AdminGate({
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

  return (
    <div className="schedule-modal-backdrop" onClick={onCancel}>
      <div
        className="schedule-modal schedule-modal-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="schedule-modal-header">
          <h2 className="schedule-modal-title">관리자 인증</h2>
          <button
            className="schedule-modal-close"
            onClick={onCancel}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="schedule-form">
          <input
            type="password"
            className="schedule-input"
            placeholder="관리자 비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            autoFocus
          />
          {err && <p className="schedule-form-err">{err}</p>}
          <div className="schedule-form-actions">
            <button className="schedule-add-btn" onClick={handleSubmit}>
              확인
            </button>
            <button
              className="schedule-mini-btn"
              onClick={onCancel}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleEditor({
  mode,
  onClose,
}: {
  mode: Exclude<EditorMode, null>;
  onClose: () => void;
}) {
  const initial =
    mode.kind === "edit"
      ? mode.item
      : { title: "", date: mode.date, description: "" };

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
        await addDoc(collection(db, "schedule"), {
          title: title.trim(),
          date,
          description: description.trim(),
          createdAt: serverTimestamp(),
        });
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

  return (
    <div className="schedule-modal-backdrop" onClick={onClose}>
      <div
        className="schedule-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="schedule-modal-header">
          <h2 className="schedule-modal-title">
            {mode.kind === "add" ? "일정 추가" : "일정 수정"}
          </h2>
          <button
            className="schedule-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="schedule-form">
          <label className="schedule-label">
            날짜
            <input
              type="date"
              className="schedule-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="schedule-label">
            제목
            <input
              type="text"
              className="schedule-input"
              placeholder="제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="schedule-label">
            설명
            <textarea
              className="schedule-input schedule-textarea"
              placeholder="설명 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>
          <div className="schedule-form-actions">
            <button
              className="schedule-add-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button className="schedule-mini-btn" onClick={onClose}>
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
